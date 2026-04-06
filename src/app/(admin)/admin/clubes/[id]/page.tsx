import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ClubForm } from "@/components/admin/club-form";
import { ClubAdminManager } from "@/components/admin/club-admin-manager";
import type { Club } from "@/types";

export default async function ClubDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("id", id)
    .single();

  if (!club) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Editar Club</h1>
      <p className="text-text-secondary mb-8">{club.name}</p>

      <div className="space-y-8">
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <h2 className="text-lg font-semibold text-text mb-6">Datos del club</h2>
          <ClubForm club={club as Club} />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <ClubAdminManager clubId={club.id} />
        </div>
      </div>
    </div>
  );
}
