"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function deleteInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión expirada." };

  const { error } = await supabase.from("invitations").delete().eq("id", invitationId);
  if (error) return { success: false, error: error.message };

  return { success: true };
}
