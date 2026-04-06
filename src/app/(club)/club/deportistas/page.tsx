import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { formatCLP } from "@/lib/format";
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

interface Enrollment {
  id: string;
  sport: string;
  plan: string;
  price: number;
  status: EnrollmentStatus;
}

interface KidRow {
  kidId: string;
  kidName: string;
  parentName: string;
  parentEmail: string;
  enrollments: Enrollment[];
  monthlyTotal: number;
}

export default async function DeportistasPage() {
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) redirect("/login");

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select(
      "id, status, kid_id, kids:kid_id(name, last_names, parent_id, profiles:parent_id(name, last_names, email)), sports:sport_id(name), plans:plan_id(name, price)"
    )
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  const kidsMap = new Map<string, KidRow>();
  for (const e of (enrollments ?? []) as any[]) {
    const kidId = e.kid_id as string;
    const price = e.plans?.price ?? 0;
    if (!kidsMap.has(kidId)) {
      kidsMap.set(kidId, {
        kidId,
        kidName: `${e.kids?.name ?? ""} ${e.kids?.last_names ?? ""}`.trim(),
        parentName: `${e.kids?.profiles?.name ?? ""} ${e.kids?.profiles?.last_names ?? ""}`.trim(),
        parentEmail: e.kids?.profiles?.email ?? "—",
        enrollments: [],
        monthlyTotal: 0,
      });
    }
    const kid = kidsMap.get(kidId)!;
    kid.enrollments.push({
      id: e.id,
      sport: e.sports?.name ?? "—",
      plan: e.plans?.name ?? "—",
      price,
      status: e.status as EnrollmentStatus,
    });
    if (e.status === "active") {
      kid.monthlyTotal += price;
    }
  }

  const kids = Array.from(kidsMap.values());
  const totalEnrollments = kids.reduce((sum, k) => sum + k.enrollments.length, 0);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text mb-1">Deportistas</h1>
        <p className="text-text-secondary">
          {kids.length} {kids.length === 1 ? "deportista" : "deportistas"} · {totalEnrollments} {totalEnrollments === 1 ? "inscripción" : "inscripciones"}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Deportista</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Apoderado</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Email</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Inscripciones</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Total mensual</th>
            </tr>
          </thead>
          <tbody>
            {kids.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-text-secondary">No hay deportistas inscritos</td></tr>
            ) : (
              kids.map((kid) => (
                <tr key={kid.kidId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors align-top">
                  <td className="px-6 py-4 text-sm font-medium text-text">{kid.kidName}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{kid.parentName}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{kid.parentEmail}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {kid.enrollments.map((en) => (
                        <span
                          key={en.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${statusBadge[en.status]}`}
                        >
                          {en.sport} · {en.plan}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-text text-right">{formatCLP(kid.monthlyTotal)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
