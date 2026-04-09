import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { confirmPayment } from "@/lib/flow/confirm-payment";

/**
 * Mock-mode only. This route is the target of the fake URL returned by
 * the Flow client when FLOW_MOCK=true. It calls confirmPayment directly
 * (simulating a successful Flow payment) and redirects to the normal
 * return page, which will then see the payment as completed.
 *
 * Guarded so it refuses to run when FLOW_MOCK is not enabled — even if
 * someone hits the URL directly in production.
 */
export async function GET(request: Request): Promise<Response> {
  if (process.env.FLOW_MOCK !== "true") {
    return NextResponse.json(
      { error: "mock mode disabled" },
      { status: 404 }
    );
  }
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json(
      { error: "mock mode cannot run in production" },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  const paymentId = url.searchParams.get("paymentId");
  const token = url.searchParams.get("token");
  if (!paymentId || !token) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Store token on the payments row so the return page can find it by token
  await supabase
    .from("payments")
    .update({ flow_transaction_id: token })
    .eq("id", paymentId);

  // Look up amount so we can pass the matching flowAmount
  const { data: payment } = await supabase
    .from("payments")
    .select("id, amount")
    .eq("id", paymentId)
    .single();

  if (!payment) {
    return NextResponse.json({ error: "payment not found" }, { status: 404 });
  }

  await confirmPayment({
    supabase,
    paymentId: payment.id,
    flowAmount: payment.amount,
    flowStatus: 2,
  });

  // Redirect to the normal return page with the token
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.redirect(
    `${appUrl}/app/pagos/retorno?token=${encodeURIComponent(token)}`
  );
}
