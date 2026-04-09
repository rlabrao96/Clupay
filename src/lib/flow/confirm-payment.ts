import type { SupabaseClient } from "@supabase/supabase-js";
import { paymentConfirmationEmail } from "@/lib/email/templates";
import { sendNotification } from "@/lib/email/send-notification";
import { formatCLP } from "@/lib/format";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export interface ConfirmPaymentInput {
  supabase: SupabaseClient;
  paymentId: string;
  flowAmount: number;
  flowStatus: 1 | 2 | 3 | 4;
}

export type ConfirmPaymentResult =
  | { ok: true }
  | { ok: true; alreadyProcessed: true }
  | { ok: true; failed: true }
  | { ok: true; stillPending: true }
  | { ok: false; reason: "amount_mismatch" | "not_found" | "update_failed" };

/**
 * Shared confirmation logic for Flow payments. Called by the webhook
 * and the mock return route. Idempotent: safe to call multiple times
 * with the same payment. Amount is verified against the stored
 * `payments.amount` before any state changes.
 *
 * Does NOT use the `mark_invoice_paid` RPC because that RPC inserts a
 * new payments row, which would duplicate the row already inserted
 * by the server action.
 */
export async function confirmPayment(
  input: ConfirmPaymentInput
): Promise<ConfirmPaymentResult> {
  const { supabase, paymentId, flowAmount, flowStatus } = input;

  // Load payment
  const { data: payment, error: paymentErr } = await supabase
    .from("payments")
    .select("id, invoice_id, amount, status")
    .eq("id", paymentId)
    .single();

  if (paymentErr || !payment) {
    console.error("[confirmPayment] payment not found", paymentId, paymentErr);
    return { ok: false, reason: "not_found" };
  }

  // Idempotency: already completed → no-op
  if (payment.status === "completed") {
    return { ok: true, alreadyProcessed: true };
  }

  // Flow still pending — do nothing, will webhook again
  if (flowStatus === 1) {
    return { ok: true, stillPending: true };
  }

  // Flow rejected/cancelled → mark payment failed
  if (flowStatus === 3 || flowStatus === 4) {
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("id", paymentId);
    return { ok: true, failed: true };
  }

  // flowStatus === 2 (paid) — verify amount
  if (flowAmount !== payment.amount) {
    console.error(
      "[confirmPayment] CRITICAL: Flow amount mismatch",
      { paymentId, expected: payment.amount, actual: flowAmount }
    );
    return { ok: false, reason: "amount_mismatch" };
  }

  // Update payment first
  const now = new Date().toISOString();
  const { error: payUpdateErr } = await supabase
    .from("payments")
    .update({ status: "completed", paid_at: now })
    .eq("id", paymentId);

  if (payUpdateErr) {
    console.error("[confirmPayment] payment update failed", payUpdateErr);
    return { ok: false, reason: "update_failed" };
  }

  // Load invoice for update + email
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, parent_id, club_id, total, status, period_month, period_year, clubs(name), profiles(email)"
    )
    .eq("id", payment.invoice_id)
    .single();

  if (invErr || !invoice) {
    console.error("[confirmPayment] invoice lookup failed", invErr);
    return { ok: false, reason: "update_failed" };
  }

  // Only update invoice if not already paid (prevents double-paid state
  // when admin already marked it paid manually). The invoices table has
  // no `paid_at` column — status is the source of truth for paid state.
  if (invoice.status !== "paid") {
    const { error: invUpdateErr } = await supabase
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", invoice.id);

    if (invUpdateErr) {
      console.error("[confirmPayment] invoice update failed", invUpdateErr);
      return { ok: false, reason: "update_failed" };
    }
  }

  // Send confirmation email (fire-and-forget failure handling)
  const parentEmail = (invoice.profiles as any)?.email;
  const clubName = (invoice.clubs as any)?.name ?? "Tu club";

  if (parentEmail) {
    const periodLabel = `${MONTH_NAMES[invoice.period_month - 1]} ${invoice.period_year}`;
    const { subject, html } = paymentConfirmationEmail(
      clubName,
      formatCLP(invoice.total),
      periodLabel
    );

    try {
      await sendNotification({
        supabase,
        parentId: invoice.parent_id,
        clubId: invoice.club_id,
        email: parentEmail,
        type: "confirmation",
        subject,
        html,
        metadata: {
          invoice_id: invoice.id,
          payment_id: paymentId,
          event: "flow_payment_confirmed",
        },
      });
    } catch (err) {
      console.error("[confirmPayment] email send failed, not rolling back", err);
    }
  }

  return { ok: true };
}
