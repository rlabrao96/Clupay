import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCLP, formatPercent } from "@/lib/format";

async function getClubsWithCounts() {
  const supabase = await createServerSupabaseClient();

  const { data: clubs, error } = await supabase
    .from("clubs")
    .select("*")
    .order("name");

  if (error || !clubs) return [];

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("club_id")
    .eq("status", "active");

  const countByClub: Record<string, number> = {};
  for (const e of enrollments ?? []) {
    countByClub[e.club_id] = (countByClub[e.club_id] ?? 0) + 1;
  }

  return clubs.map((club) => ({
    ...club,
    athleteCount: countByClub[club.id] ?? 0,
  }));
}

export default async function ClubesPage() {
  const clubs = await getClubsWithCounts();

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">Clubes</h1>
          <p className="text-text-secondary">
            {clubs.length} {clubs.length === 1 ? "club" : "clubes"} registrados
          </p>
        </div>
        <Link
          href="/admin/clubes/nuevo"
          className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
        >
          + Nuevo Club
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Nombre</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Email de contacto</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Deportistas</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Tarifa fija</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Comisión</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clubs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-text-secondary">
                  No hay clubes registrados
                </td>
              </tr>
            ) : (
              clubs.map((club) => (
                <tr key={club.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-text">{club.name}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{club.contact_email ?? "—"}</td>
                  <td className="px-6 py-4 text-sm text-text text-right">{club.athleteCount}</td>
                  <td className="px-6 py-4 text-sm text-text text-right">{formatCLP(club.platform_fee_fixed)}</td>
                  <td className="px-6 py-4 text-sm text-text text-right">{formatPercent(club.platform_fee_percent)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/admin/clubes/${club.id}`} className="text-sm text-primary hover:text-primary-dark font-medium">
                      Ver / Editar
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
