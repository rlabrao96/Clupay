"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { ParsedRow, ValidatedRow } from "@/lib/import/types";
import { validateImportRows } from "@/lib/import/validate";

export async function validateImportRowsAction(
  clubId: string,
  rows: ParsedRow[]
): Promise<ValidatedRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión expirada");
  const { data: admin } = await supabase
    .from("club_admins")
    .select("club_id")
    .eq("profile_id", user.id)
    .eq("club_id", clubId)
    .single();
  if (!admin) throw new Error("No autorizado");

  const service = createServiceRoleClient();
  return validateImportRows(service, clubId, rows);
}
