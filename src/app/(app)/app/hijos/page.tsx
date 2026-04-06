import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { formatRut } from "@/lib/rut/validate";
import type { EnrollmentStatus } from "@/types";

const statusLabel: Record<EnrollmentStatus, string> = {
  active: "Activo",
  paused: "Pausado",
  cancelled: "Cancelado",
};

const statusClass: Record<EnrollmentStatus, string> = {
  active: "text-success",
  paused: "text-warning",
  cancelled: "text-danger",
};

export default async function HijosPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: kids } = await supabase
    .from("kids")
    .select("*")
    .eq("parent_id", user.id)
    .order("name");

  const kidList = kids ?? [];

  // Fetch enrollments for all kids
  const kidIds = kidList.map((k) => k.id);
  const { data: enrollments } = kidIds.length > 0
    ? await supabase
        .from("enrollments")
        .select("*, clubs:club_id(name), sports:sport_id(name), plans:plan_id(name)")
        .in("kid_id", kidIds)
    : { data: [] };

  const enrollmentsByKid: Record<string, any[]> = {};
  for (const e of enrollments ?? []) {
    if (!enrollmentsByKid[e.kid_id]) enrollmentsByKid[e.kid_id] = [];
    enrollmentsByKid[e.kid_id].push(e);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Mis Hijos</h1>
          <p className="text-text-secondary text-sm">{kidList.length} {kidList.length === 1 ? "hijo" : "hijos"}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/inscribir" className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors">
            Inscribir en deporte
          </Link>
          <Link href="/app/hijos/nuevo" className="px-4 py-2 border border-gray-200 text-text-secondary text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
            + Agregar hijo
          </Link>
        </div>
      </div>

      {kidList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
          <p className="text-text-secondary text-sm">No tienes hijos registrados</p>
          <Link href="/app/hijos/nuevo" className="inline-block mt-3 text-sm text-primary font-medium">
            Agregar tu primer hijo
          </Link>
        </div>
      ) : (
        kidList.map((kid) => {
          const kidEnrollments = enrollmentsByKid[kid.id] ?? [];
          return (
            <div key={kid.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-text">{kid.name} {kid.last_names}</h3>
                <span className="text-xs text-text-secondary font-mono">{formatRut(kid.rut)}</span>
              </div>
              <p className="text-xs text-text-secondary mb-3">Nacimiento: {formatDate(kid.date_of_birth)}</p>

              {kidEnrollments.length === 0 ? (
                <p className="text-xs text-text-secondary italic">Sin inscripciones activas</p>
              ) : (
                <div className="space-y-2">
                  {kidEnrollments.map((enrollment: any) => (
                    <div key={enrollment.id} className="bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-text">{enrollment.sports?.name ?? "—"}</p>
                          <p className="text-xs text-text-secondary">{enrollment.clubs?.name ?? "—"} · {enrollment.plans?.name ?? "—"}</p>
                        </div>
                        <span className={`text-xs font-medium ${statusClass[enrollment.status as EnrollmentStatus] ?? ""}`}>
                          {statusLabel[enrollment.status as EnrollmentStatus] ?? enrollment.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
