import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { ClubConfigForm } from "@/components/club/club-config-form";
import type { Club } from "@/types";

export default async function ConfiguracionPage() {
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) redirect("/login");

  const { data: club } = await supabase.from("clubs").select("*").eq("id", clubId).single();
  if (!club) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Configuración</h1>
      <p className="text-text-secondary mb-8">Ajustes de tu club</p>
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <ClubConfigForm club={club as Club} />
      </div>
    </div>
  );
}
