"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function finishImportBatch(batchId: string): Promise<void> {
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

  await service
    .from("import_batches")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", batchId);
}
