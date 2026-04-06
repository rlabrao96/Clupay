"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { invoiceReadyEmail } from "@/lib/email/templates";
import { sendNotification } from "@/lib/email/send-notification";
import { formatCLP, formatDate } from "@/lib/format";

interface ApproveResult {
  success: boolean;
  error?: string;
}

export async function approveInvoice(invoiceId: string): Promise<ApproveResult> {
  const supabase = await createServerSupabaseClient();

  // Verify authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión expirada" };

  // Update invoice status
  const { error: updateError } = await supabase
    .from("invoices")
    .update({ status: "pending" })
    .eq("id", invoiceId);

  if (updateError) return { success: false, error: "Error al aprobar la factura" };

  // Fetch invoice + parent + club details for email
  const serviceClient = createServiceRoleClient();
  const { data: invoice } = await serviceClient
    .from("invoices")
    .select("id, parent_id, club_id, total, due_date, clubs(name), profiles(email)")
    .eq("id", invoiceId)
    .single();

  if (invoice) {
    const clubName = (invoice.clubs as any)?.name ?? "Tu club";
    const parentEmail = (invoice.profiles as any)?.email;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (parentEmail) {
      const { subject, html } = invoiceReadyEmail(
        clubName,
        formatCLP(invoice.total),
        formatDate(invoice.due_date),
        baseUrl
      );

      await sendNotification({
        supabase: serviceClient,
        parentId: invoice.parent_id,
        clubId: invoice.club_id,
        email: parentEmail,
        type: "confirmation",
        subject,
        html,
        metadata: { invoice_id: invoice.id, event: "invoice_ready" },
      });
    }
  }

  return { success: true };
}

interface BulkApproveResult {
  success: boolean;
  approved?: number;
  error?: string;
}

export async function bulkApproveInvoices(invoiceIds: string[]): Promise<BulkApproveResult> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión expirada" };

  // Update all invoices
  const { error: updateError } = await supabase
    .from("invoices")
    .update({ status: "pending" })
    .in("id", invoiceIds);

  if (updateError) return { success: false, error: "Error al aprobar las facturas" };

  // Fetch all approved invoices for email
  const serviceClient = createServiceRoleClient();
  const { data: invoices } = await serviceClient
    .from("invoices")
    .select("id, parent_id, club_id, total, due_date, clubs(name), profiles(email)")
    .in("id", invoiceIds);

  if (invoices && invoices.length > 0) {
    // Group by parent to send one email per parent
    const byParent = new Map<string, typeof invoices>();
    for (const inv of invoices) {
      const parentId = inv.parent_id;
      if (!byParent.has(parentId)) byParent.set(parentId, []);
      byParent.get(parentId)!.push(inv);
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    for (const [parentId, parentInvoices] of byParent) {
      const first = parentInvoices[0];
      const parentEmail = (first.profiles as any)?.email;
      if (!parentEmail) continue;

      const clubName = (first.clubs as any)?.name ?? "Tu club";

      // Sum totals and find earliest due date
      const totalSum = parentInvoices.reduce((sum, inv) => sum + inv.total, 0);
      const earliestDue = parentInvoices
        .map((inv) => inv.due_date)
        .sort()[0];

      const { subject, html } = invoiceReadyEmail(
        clubName,
        formatCLP(totalSum),
        formatDate(earliestDue),
        baseUrl
      );

      await sendNotification({
        supabase: serviceClient,
        parentId,
        clubId: first.club_id,
        email: parentEmail,
        type: "confirmation",
        subject,
        html,
        metadata: {
          invoice_ids: parentInvoices.map((inv) => inv.id),
          event: "invoice_ready",
        },
      });
    }
  }

  return { success: true, approved: invoiceIds.length };
}
