import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { InscribirClient } from "./inscribir-client";
import type { Sport, Plan, Club } from "@/types";

export default async function InscribirPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get parent's clubs via club_parents
  const { data: clubParents } = await supabase
    .from("club_parents")
    .select("club_id, clubs:club_id(id, name, logo_url)")
    .eq("parent_id", user.id);

  const clubs = (clubParents ?? [])
    .map((cp: any) => cp.clubs as Club)
    .filter(Boolean);

  if (clubs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary text-sm mb-2">
          No estás asociado a ningún club aún.
        </p>
        <p className="text-text-secondary text-xs">
          Acepta una invitación de un club para comenzar.
        </p>
      </div>
    );
  }

  // Fetch all sports and plans for the parent's clubs
  const clubIds = clubs.map((c: Club) => c.id);

  const { data: sports } = await supabase
    .from("sports")
    .select("*")
    .in("club_id", clubIds)
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
        <h1 className="text-2xl font-bold text-text mb-1">Inscribir en Deporte</h1>
        <p className="text-text-secondary text-sm">
          Inscribe a tus hijos en deportes y planes
        </p>
      </div>

      <InscribirClient
        clubs={clubs as Club[]}
        sports={(sports ?? []) as Sport[]}
        plans={(plans ?? []) as Plan[]}
      />
    </div>
  );
}
