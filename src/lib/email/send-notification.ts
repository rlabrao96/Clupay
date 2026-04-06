import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationType } from "@/types";
import { sendEmail } from "@/lib/email/resend";

interface SendNotificationParams {
  supabase: SupabaseClient;
  parentId: string;
  clubId: string;
  email: string;
  type: NotificationType;
  subject: string;
  html: string;
  metadata?: Record<string, unknown>;
}

export async function sendNotification(params: SendNotificationParams): Promise<void> {
  const { supabase, parentId, clubId, email, type, subject, html, metadata } = params;

  const result = await sendEmail(email, subject, html);

  const now = new Date().toISOString();
  const { error: dbError } = await supabase.from("notifications").insert({
    parent_id: parentId,
    club_id: clubId,
    channel: "email" as const,
    type,
    subject,
    body: html,
    status: result.success ? "sent" : "failed",
    sent_at: result.success ? now : null,
    metadata: result.success
      ? (metadata ?? null)
      : { ...(metadata ?? {}), error: result.error },
  });

  if (dbError) {
    console.error("Failed to log notification:", dbError.message);
  }
}
