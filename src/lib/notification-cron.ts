import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotification } from "@/lib/email/send-notification";
import {
  paymentReminderEmail,
  overdueAlertEmail,
  invoiceReadyEmail,
} from "@/lib/email/templates";
import { formatCLP, formatDate } from "@/lib/format";

interface NotificationResult {
  reminders_sent: number;
  overdue_sent: number;
  auto_approved_sent: number;
}

interface ProcessOptions {
  autoApprovedInvoiceIds: string[];
}

export async function processNotifications(
  supabase: SupabaseClient,
  options: ProcessOptions
): Promise<NotificationResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const clubNameCache = new Map<string, string>();

  async function getClubName(clubId: string): Promise<string> {
    if (clubNameCache.has(clubId)) return clubNameCache.get(clubId)!;
    const { data } = await supabase.from("clubs").select("name").eq("id", clubId).single();
    const name = data?.name ?? "Tu club";
    clubNameCache.set(clubId, name);
    return name;
  }

  async function getParentEmail(parentId: string): Promise<string | null> {
    const { data } = await supabase.from("profiles").select("email").eq("id", parentId).single();
    return data?.email ?? null;
  }

  async function wasAlreadySent(
    parentId: string,
    type: string,
    metadata: Record<string, unknown>
  ): Promise<boolean> {
    const { data } = await supabase
      .from("notifications")
      .select("id")
      .eq("parent_id", parentId)
      .eq("type", type)
      .contains("metadata", metadata)
      .limit(1);
    return (data?.length ?? 0) > 0;
  }

  // --- Payment Reminders (3 days before due) ---
  const today = new Date();
  const reminderDate = new Date(today);
  reminderDate.setDate(reminderDate.getDate() + 3);
  const reminderDateStr = reminderDate.toISOString().split("T")[0];

  const { data: reminderInvoices } = await supabase
    .from("invoices")
    .select("id, parent_id, club_id, total, due_date")
    .eq("status", "pending")
    .eq("due_date", reminderDateStr);

  let remindersSent = 0;
  for (const inv of reminderInvoices ?? []) {
    const alreadySent = await wasAlreadySent(inv.parent_id, "reminder", { invoice_id: inv.id });
    if (alreadySent) continue;

    const email = await getParentEmail(inv.parent_id);
    if (!email) continue;

    const clubName = await getClubName(inv.club_id);
    const { subject, html } = paymentReminderEmail(
      clubName,
      formatCLP(inv.total),
      formatDate(inv.due_date),
      baseUrl
    );

    await sendNotification({
      supabase,
      parentId: inv.parent_id,
      clubId: inv.club_id,
      email,
      type: "reminder",
      subject,
      html,
      metadata: { invoice_id: inv.id },
    });
    remindersSent++;
  }

  // --- Overdue Alerts (1, 3, 7 days after due) ---
  let overdueSent = 0;
  for (const daysOverdue of [1, 3, 7]) {
    const overdueDate = new Date(today);
    overdueDate.setDate(overdueDate.getDate() - daysOverdue);
    const overdueDateStr = overdueDate.toISOString().split("T")[0];

    const { data: overdueInvoices } = await supabase
      .from("invoices")
      .select("id, parent_id, club_id, total, due_date")
      .eq("status", "overdue")
      .eq("due_date", overdueDateStr);

    for (const inv of overdueInvoices ?? []) {
      const alreadySent = await wasAlreadySent(inv.parent_id, "overdue", {
        invoice_id: inv.id,
        days_overdue: daysOverdue,
      });
      if (alreadySent) continue;

      const email = await getParentEmail(inv.parent_id);
      if (!email) continue;

      const clubName = await getClubName(inv.club_id);
      const { subject, html } = overdueAlertEmail(clubName, formatCLP(inv.total), daysOverdue, baseUrl);

      await sendNotification({
        supabase,
        parentId: inv.parent_id,
        clubId: inv.club_id,
        email,
        type: "overdue",
        subject,
        html,
        metadata: { invoice_id: inv.id, days_overdue: daysOverdue },
      });
      overdueSent++;
    }
  }

  // --- Auto-Approved Invoice Ready Emails ---
  let autoApprovedSent = 0;
  if (options.autoApprovedInvoiceIds.length > 0) {
    const { data: autoInvoices } = await supabase
      .from("invoices")
      .select("id, parent_id, club_id, total, due_date")
      .in("id", options.autoApprovedInvoiceIds);

    for (const inv of autoInvoices ?? []) {
      const email = await getParentEmail(inv.parent_id);
      if (!email) continue;

      const clubName = await getClubName(inv.club_id);
      const { subject, html } = invoiceReadyEmail(
        clubName,
        formatCLP(inv.total),
        formatDate(inv.due_date),
        baseUrl
      );

      await sendNotification({
        supabase,
        parentId: inv.parent_id,
        clubId: inv.club_id,
        email,
        type: "confirmation",
        subject,
        html,
        metadata: { invoice_id: inv.id, event: "invoice_ready" },
      });
      autoApprovedSent++;
    }
  }

  return {
    reminders_sent: remindersSent,
    overdue_sent: overdueSent,
    auto_approved_sent: autoApprovedSent,
  };
}
