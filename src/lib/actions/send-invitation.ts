"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { invitationEmail } from "@/lib/email/templates";
import { sendNotification } from "@/lib/email/send-notification";

interface SendInvitationResult {
  success: boolean;
  error?: string;
}

export async function sendInvitation(
  clubId: string,
  email: string
): Promise<SendInvitationResult> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión expirada. Recarga la página." };

  if (!email.trim()) return { success: false, error: "El email es obligatorio" };

  // Insert invitation
  const { data: invitation, error: insertError } = await supabase
    .from("invitations")
    .insert({
      club_id: clubId,
      invited_by: user.id,
      email: email.trim(),
    })
    .select("id, token")
    .single();

  if (insertError) return { success: false, error: insertError.message };

  // Fetch club name for the email
  const serviceClient = createServiceRoleClient();
  const { data: club } = await serviceClient
    .from("clubs")
    .select("name")
    .eq("id", clubId)
    .single();

  const clubName = club?.name ?? "Tu club";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { subject, html } = invitationEmail(clubName, invitation.token, baseUrl);

  await sendNotification({
    supabase: serviceClient,
    parentId: user.id, // Use inviter's ID — invited parent may not have an account yet. parent_id is NOT NULL.
    clubId,
    email: email.trim(),
    type: "invitation",
    subject,
    html,
    metadata: { invitation_id: invitation.id, token: invitation.token },
  });

  return { success: true };
}
