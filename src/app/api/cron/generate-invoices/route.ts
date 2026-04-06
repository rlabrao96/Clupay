import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { generateInvoices } from "@/lib/invoice-generation";
import { processNotifications } from "@/lib/notification-cron";

export async function POST(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient();
    const invoiceResult = await generateInvoices(supabase);
    const notificationResult = await processNotifications(supabase, {
      autoApprovedInvoiceIds: invoiceResult.auto_approved_invoice_ids,
    });

    return NextResponse.json(
      { ...invoiceResult, notifications: notificationResult },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
