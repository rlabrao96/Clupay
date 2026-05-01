import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { AsignarClient } from "./asignar-client";
import type { Sport, Plan } from "@/types";

interface RawBatchKid {
  kids: {
    id: string;
    name: string;
    last_names: string;
    parent_id: string;
    profiles: { name: string; last_names: string } | null;
  };
}

export default async function AsignarPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) redirect("/login");

  const { data: batch } = await supabase
    .from("import_batches")
    .select("id, club_id")
    .eq("id", batchId)
    .single();
  if (!batch || (batch as { club_id: string }).club_id !== clubId) notFound();

  const { data: kidRows } = await supabase
    .from("import_batch_kids")
    .select(
      "kid_id, kids:kid_id(id, name, last_names, parent_id, profiles:parent_id(name, last_names))"
    )
    .eq("batch_id", batchId);

  const kids = ((kidRows ?? []) as unknown as RawBatchKid[])
    .filter((r) => r.kids)
    .map((r) => ({
      id: r.kids.id,
      name: `${r.kids.name} ${r.kids.last_names}`,
      parentName: `${r.kids.profiles?.name ?? ""} ${
        r.kids.profiles?.last_names ?? ""
      }`.trim(),
    }));

  const { data: sports } = await supabase
    .from("sports")
    .select("*")
    .eq("club_id", clubId)
    .order("name");
  const sportIds = (sports ?? []).map((s: Sport) => s.id);
  const { data: plans } =
    sportIds.length > 0
      ? await supabase
          .from("plans")
          .select("*")
          .in("sport_id", sportIds)
          .eq("is_active", true)
          .order("price")
      : { data: [] };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text mb-1">Asignar planes</h1>
        <p className="text-text-secondary text-sm">
          Selecciona los hijos y asígnales un deporte y plan en lote.
        </p>
      </div>
      <AsignarClient
        batchId={batchId}
        kids={kids}
        sports={(sports ?? []) as Sport[]}
        plans={(plans ?? []) as Plan[]}
      />
    </div>
  );
}
