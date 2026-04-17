"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createFlowClient } from "@/lib/flow/client";
import {
  type FlowMethodKey,
  PAYMENT_METHOD_FLOW_ID,
  paymentMethodToEnum,
} from "@/lib/club-payments";

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

const CLUB_COLUMN_BY_KEY: Record<FlowMethodKey, string> = {
  card: "pm_card",
  flow_transfer: "pm_flow_transfer",
  wallet: "pm_wallet",
  installments: "pm_installments",
};

/**
 * Initiates a Flow.cl payment for an invoice using a specific method key.
 * The club must have the corresponding toggle enabled; otherwise we
 * refuse before inserting any payments row.
 */
export async function createFlowPayment(
  invoiceId: string,
  methodKey: FlowMethodKey
): Promise<CreateFlowPaymentResult> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión expirada" };

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, parent_id, club_id, total, status, period_month, period_year, clubs(name)")
    .eq("id", invoiceId)
    .single();

  if (invErr || !invoice) return { success: false, error: "Factura no encontrada" };
  if (invoice.parent_id !== user.id) return { success: false, error: "No autorizado" };
  if (invoice.status !== "pending" && invoice.status !== "overdue") {
    return { success: false, error: "Esta factura no se puede pagar" };
  }

  // Verify the method is still enabled on the club (race-safe)
  const { data: club, error: clubErr } = await supabase
    .from("clubs")
    .select("pm_card, pm_flow_transfer, pm_wallet, pm_installments")
    .eq("id", invoice.club_id)
    .single();

  if (clubErr || !club) return { success: false, error: "Club no encontrado" };

  const column = CLUB_COLUMN_BY_KEY[methodKey] as
    | "pm_card"
    | "pm_flow_transfer"
    | "pm_wallet"
    | "pm_installments";
  if (!club[column]) {
    return { success: false, error: "Método no disponible" };
  }

  const serviceClient = createServiceRoleClient();

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recent } = await serviceClient
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

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();
  const parentEmail = profile?.email;
  if (!parentEmail) return { success: false, error: "No tenemos tu email en el sistema" };

  const { data: payment, error: insertErr } = await serviceClient
    .from("payments")
    .insert({
      invoice_id: invoiceId,
      amount: invoice.total,
      method: paymentMethodToEnum(methodKey),
      status: "pending",
    })
    .select("id")
    .single();
  if (insertErr || !payment) {
    console.error("[createFlowPayment] pre-insert failed", insertErr);
    return { success: false, error: "No pudimos iniciar el pago" };
  }

  const clubName = (invoice.clubs as unknown as { name: string } | null)?.name ?? "CluPay";
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
      paymentMethod: PAYMENT_METHOD_FLOW_ID[methodKey],
    });
  } catch (err) {
    console.error("[createFlowPayment] Flow createPayment failed", err);
    await serviceClient.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return { success: false, error: "No pudimos conectar con Flow. Intenta nuevamente." };
  }

  const { error: updateErr } = await serviceClient
    .from("payments")
    .update({ flow_transaction_id: flowResult.token })
    .eq("id", payment.id);
  if (updateErr) {
    console.error("[createFlowPayment] token update failed", updateErr);
    await serviceClient.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return { success: false, error: "Error interno. Intenta nuevamente." };
  }

  const checkoutUrl = `${flowResult.url}?token=${encodeURIComponent(flowResult.token)}`;
  return { success: true, url: checkoutUrl };
}
