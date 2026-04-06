import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves the club_id for the currently authenticated club_admin user.
 * Returns the first club the user is assigned to admin.
 * Returns null if no club assignment found.
 */
export async function getClubForUser(
  supabase: SupabaseClient
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("club_admins")
    .select("club_id")
    .eq("profile_id", user.id)
    .limit(1)
    .single();

  return data?.club_id ?? null;
}
