import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import type { EnrollmentStatus } from "@/types";

const statusBadge: Record<EnrollmentStatus, string> = {
  active: "bg-success-light text-success",
  paused: "bg-warning-light text-warning",
  cancelled: "bg-danger-light text-danger",
};

const statusLabel: Record<EnrollmentStatus, string> = {
  active: "Activo",
  paused: "Pausado",
  cancelled: "Cancelado",
};

export default async function DeportistasPage() {
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) redirect("/login");

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select(
      "id, status, kids:kid_id(name, last_names, parent_id, profiles:parent_id(name, last_names, email)), sports:sport_id(name), plans:plan_id(name)"
    )
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  const rows = (enrollments ?? []).map((e: any) => ({
    id: e.id,
    kidName: `${e.kids?.name ?? ""} ${e.kids?.last_names ?? ""}`.trim(),
    parentName: `${e.kids?.profiles?.name ?? ""} ${e.kids?.profiles?.last_names ?? ""}`.trim(),
    parentEmail: e.kids?.profiles?.email ?? "—",
    sport: e.sports?.name ?? "—",
    plan: e.plans?.name ?? "—",
    status: e.status as EnrollmentStatus,
  }));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text mb-1">Deportistas</h1>
        <p className="text-text-secondary">
          {rows.length} {rows.length === 1 ? "inscripción" : "inscripciones"}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Deportista</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Apoderado</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Email</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Deporte</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Plan</th>
              <th className="text-center px-6 py-4 text-sm font-medium text-text-secondary">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-text-secondary">No hay deportistas inscritos</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-text">{row.kidName}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{row.parentName}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{row.parentEmail}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{row.sport}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{row.plan}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${statusBadge[row.status]}`}>
                      {statusLabel[row.status]}
                    </span>
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
