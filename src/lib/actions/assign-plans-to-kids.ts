"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

interface AssignArgs {
  batchId: string;
  kidIds: string[];
  sportId: string;
  planId: string;
}

export async function assignPlansToKids({
  batchId,
  kidIds,
  sportId,
  planId,
}: AssignArgs): Promise<{ created: number; skipped: number }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión expirada");

  const service = createServiceRoleClient();

  const { data: batch } = await service
    .from("import_batches")
    .select("club_id")
    .eq("id", batchId)
    .single();
  if (!batch) throw new Error("Batch no encontrado");

  const { data: admin } = await supabase
    .from("club_admins")
    .select("club_id")
    .eq("profile_id", user.id)
    .eq("club_id", (batch as { club_id: string }).club_id)
    .single();
  if (!admin) throw new Error("No autorizado");

  const clubId = (batch as { club_id: string }).club_id;

  let created = 0;
  let skipped = 0;
  for (const kidId of kidIds) {
    const { error } = await service.from("enrollments").insert({
      kid_id: kidId,
      club_id: clubId,
      sport_id: sportId,
      plan_id: planId,
    });
    if (error) skipped++;
    else created++;
  }
  return { created, skipped };
}
