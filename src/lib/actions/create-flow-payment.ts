"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createFlowClient } from "@/lib/flow/client";

interface CreateFlowPaymentResult {
  success: boolean;
  url?: string;
  error?: string;
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Initiates a Flow.cl payment for an invoice. Called from the parent
 * portal "Pagar Ahora" button.
 *
 * Flow:
 * 1. Verify authenticated parent owns this invoice.
 * 2. Verify invoice is payable (pending or overdue).
 * 3. Dedupe: reject if a pending payment was created less than 30 min
 *    ago for the same invoice (prevents duplicate Flow checkouts).
 * 4. Pre-insert payments row with status=pending.
 * 5. Call Flow createPayment; on failure, mark payments row failed.
 * 6. Store Flow token in payments.flow_transaction_id.
 * 7. Return redirect URL to client.
 */
export async function createFlowPayment(
  invoiceId: string
): Promise<CreateFlowPaymentResult> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión expirada" };

  // Load invoice and validate ownership + status
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, parent_id, club_id, total, status, period_month, period_year, clubs(name)")
    .eq("id", invoiceId)
    .single();

  if (invErr || !invoice) {
    return { success: false, error: "Factura no encontrada" };
  }
  if (invoice.parent_id !== user.id) {
    return { success: false, error: "No autorizado" };
  }
  if (invoice.status !== "pending" && invoice.status !== "overdue") {
    return { success: false, error: "Esta factura no se puede pagar" };
  }

  // Dedupe: any recent pending payment for this invoice?
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("payments")
    .select("id, created_at, flow_transaction_id")
    .eq("invoice_id", invoiceId)
    .eq("status", "pending")
    .not("flow_transaction_id", "is", null)
    .gte("created_at", thirtyMinAgo)
    .limit(1);

  if (recent && recent.length > 0) {
    return {
      success: false,
      error: "Ya tienes un pago en curso. Espera unos minutos e intenta nuevamente.",
    };
  }

  // Fetch parent email for the Flow checkout
  const serviceClient = createServiceRoleClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  const parentEmail = profile?.email;
  if (!parentEmail) {
    return { success: false, error: "No tenemos tu email en el sistema" };
  }

  // Pre-insert payments row
  const { data: payment, error: insertErr } = await supabase
    .from("payments")
    .insert({
      invoice_id: invoiceId,
      amount: invoice.total,
      method: "card_link",
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !payment) {
    console.error("[createFlowPayment] pre-insert failed", insertErr);
    return { success: false, error: "No pudimos iniciar el pago" };
  }

  // Call Flow
  const clubName = (invoice.clubs as any)?.name ?? "CluPay";
  const periodLabel = `${MONTH_NAMES[invoice.period_month - 1]} ${invoice.period_year}`;
  const subject = `CluPay - ${clubName} - ${periodLabel}`;

  const flow = createFlowClient();
  let flowResult;
  try {
    flowResult = await flow.createPayment({
      commerceOrder: payment.id,
      subject,
      amount: invoice.total,
      email: parentEmail,
      urlConfirmation: `${appUrl()}/api/webhooks/flow/confirm`,
      urlReturn: `${appUrl()}/app/pagos/retorno`,
    });
  } catch (err) {
    console.error("[createFlowPayment] Flow createPayment failed", err);
    // Mark row failed so it does not block dedupe
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id);
    return { success: false, error: "No pudimos conectar con Flow. Intenta nuevamente." };
  }

  // Store token on the payments row
  const { error: updateErr } = await supabase
    .from("payments")
    .update({ flow_transaction_id: flowResult.token })
    .eq("id", payment.id);

  if (updateErr) {
    console.error("[createFlowPayment] token update failed", updateErr);
    // The payment was created at Flow, but we could not store the token.
    // This is recoverable via the webhook (Flow will POST the token, we
    // look it up by... we can't, without the token stored). Safer to
    // mark failed and let the parent retry.
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id);
    return { success: false, error: "Error interno. Intenta nuevamente." };
  }

  return { success: true, url: flowResult.url };
}
