"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { paymentConfirmationEmail } from "@/lib/email/templates";
import { sendNotification } from "@/lib/email/send-notification";
import { formatCLP } from "@/lib/format";

interface MarkPaidResult {
  success: boolean;
  error?: string;
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export async function markInvoicePaid(
  invoiceId: string,
  amount: number,
  method: string = "bank_transfer"
): Promise<MarkPaidResult> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión expirada" };

  // Call existing RPC
  const { error: rpcError } = await supabase.rpc("mark_invoice_paid", {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_method: method,
  });

  if (rpcError) return { success: false, error: rpcError.message };

  // Fetch invoice details for email
  const serviceClient = createServiceRoleClient();
  const { data: invoice } = await serviceClient
    .from("invoices")
    .select("id, parent_id, club_id, total, period_month, period_year, clubs(name), profiles(email)")
    .eq("id", invoiceId)
    .single();

  if (invoice) {
    const parentEmail = (invoice.profiles as any)?.email;
    const clubName = (invoice.clubs as any)?.name ?? "Tu club";

    if (parentEmail) {
      const periodLabel = `${MONTH_NAMES[invoice.period_month - 1]} ${invoice.period_year}`;

      const { subject, html } = paymentConfirmationEmail(
        clubName,
        formatCLP(invoice.total),
        periodLabel
      );

      await sendNotification({
        supabase: serviceClient,
        parentId: invoice.parent_id,
        clubId: invoice.club_id,
        email: parentEmail,
        type: "confirmation",
        subject,
        html,
        metadata: { invoice_id: invoice.id, event: "payment_confirmed" },
      });
    }
  }

  return { success: true };
}
