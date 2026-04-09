import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createFlowClient } from "@/lib/flow/client";
import { confirmPayment } from "@/lib/flow/confirm-payment";

/**
 * Flow.cl webhook handler. Flow POSTs a `token` here after payment.
 *
 * We do NOT trust the inbound POST body beyond the token. Authenticity
 * comes from calling `payment/getStatus` back to Flow over HTTPS with
 * our secret key — the token is meaningless to an attacker without our
 * API credentials.
 *
 * Always returns 200 for processed (even already-confirmed, even
 * amount mismatch, even unknown token) so Flow stops retrying. Returns
 * 500 only for transient errors (network to Flow) so Flow retries.
 */
export async function POST(request: Request): Promise<Response> {
  // Parse form body
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const token = formData.get("token");
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  // Verify with Flow (authenticity check)
  let status;
  try {
    const flow = createFlowClient();
    status = await flow.getPaymentStatus(token);
  } catch (err) {
    console.error("[flow webhook] getPaymentStatus failed", err);
    // Transient — let Flow retry
    return NextResponse.json({ error: "flow lookup failed" }, { status: 500 });
  }

  // Look up our payments row by token
  const supabase = createServiceRoleClient();
  const { data: payment, error: lookupErr } = await supabase
    .from("payments")
    .select("id, amount, status")
    .eq("flow_transaction_id", token)
    .maybeSingle();

  if (lookupErr) {
    console.error("[flow webhook] payment lookup error", lookupErr);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }

  if (!payment) {
    // Unknown token — no side effects. Return 200 so Flow does not retry.
    console.warn("[flow webhook] unknown token", token);
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  // Delegate to shared logic
  const result = await confirmPayment({
    supabase,
    paymentId: payment.id,
    flowAmount: status.amount,
    flowStatus: status.status,
  });

  if (!result.ok && result.reason === "update_failed") {
    // Transient DB error — let Flow retry
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }

  // All other outcomes (ok, already processed, amount mismatch, failed) → 200
  return NextResponse.json({ ok: true }, { status: 200 });
}
