"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCLP } from "@/lib/format";
import { PlanForm } from "@/components/club/plan-form";
import { SportForm } from "@/components/club/sport-form";
import type { Plan, Sport } from "@/types";

interface PlanWithSport extends Plan {
  sports: { name: string; club_id: string };
}

export default function DeportesYPlanesPage() {
  const supabase = createClient();
  const [clubId, setClubId] = useState<string | null>(null);
  const [sports, setSports] = useState<Sport[]>([]);
  const [plans, setPlans] = useState<PlanWithSport[]>([]);
  const [enrollmentCounts, setEnrollmentCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [collapsedSports, setCollapsedSports] = useState<Set<string>>(new Set());

  // Sport form state
  const [showSportForm, setShowSportForm] = useState(false);
  const [editingSport, setEditingSport] = useState<Sport | undefined>(undefined);

  // Plan form state — tracks which sport the form is for
  const [planFormSportId, setPlanFormSportId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<Plan | undefined>(undefined);

  const plansBySport = useMemo(() => {
    const grouped = new Map<string, PlanWithSport[]>();
    for (const plan of plans) {
      const sportId = plan.sport_id;
      if (!grouped.has(sportId)) grouped.set(sportId, []);
      grouped.get(sportId)!.push(plan);
    }
    return grouped;
  }, [plans]);

  function toggleSport(sportId: string) {
    setCollapsedSports((prev) => {
      const next = new Set(prev);
      if (next.has(sportId)) next.delete(sportId);
      else next.add(sportId);
      return next;
    });
  }

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: clubAdmin } = await supabase.from("club_admins").select("club_id").eq("profile_id", user.id).limit(1).single();
    if (!clubAdmin) return;
    setClubId(clubAdmin.club_id);

    const [sportsRes, plansRes, enrollRes] = await Promise.all([
      supabase.from("sports").select("*").eq("club_id", clubAdmin.club_id).order("name"),
      supabase.from("plans").select("*, sports:sport_id!inner(name, club_id)").eq("sports.club_id", clubAdmin.club_id).order("name"),
      supabase.from("enrollments").select("plan_id").eq("club_id", clubAdmin.club_id).eq("status", "active"),
    ]);

    const counts = new Map<string, number>();
    for (const e of (enrollRes.data ?? []) as { plan_id: string }[]) {
      counts.set(e.plan_id, (counts.get(e.plan_id) ?? 0) + 1);
    }

    setSports((sportsRes.data as Sport[]) ?? []);
    setPlans((plansRes.data ?? []) as PlanWithSport[]);
    setEnrollmentCounts(counts);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleDeleteSport(sportId: string) {
    const sportPlans = plansBySport.get(sportId);
    const msg = sportPlans?.length
      ? `¿Eliminar este deporte y sus ${sportPlans.length} plan(es) asociados?`
      : "¿Eliminar este deporte?";
    if (!confirm(msg)) return;
    const { error } = await supabase.from("sports").delete().eq("id", sportId);
    if (error) { alert(`Error al eliminar: ${error.message}`); return; }
    loadData();
  }

  async function handleDeletePlan(planId: string) {
    if (!confirm("¿Eliminar este plan?")) return;
    const { error } = await supabase.from("plans").delete().eq("id", planId);
    if (error) { alert(`Error al eliminar: ${error.message}`); return; }
    loadData();
  }

  function handleSportFormCancel() { setShowSportForm(false); setEditingSport(undefined); loadData(); }
  function handlePlanFormCancel() { setPlanFormSportId(null); setEditingPlan(undefined); loadData(); }

  function openAddPlan(sportId: string) {
    setEditingPlan(undefined);
    setPlanFormSportId(sportId);
    // Make sure the sport section is expanded
    setCollapsedSports((prev) => {
      const next = new Set(prev);
      next.delete(sportId);
      return next;
    });
  }

  function openEditPlan(plan: Plan) {
    setEditingPlan(plan);
    setPlanFormSportId(plan.sport_id);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  const totalPlans = plans.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">Deportes y Planes</h1>
          <p className="text-text-secondary">
            {sports.length} {sports.length === 1 ? "deporte" : "deportes"} · {totalPlans} {totalPlans === 1 ? "plan" : "planes"}
          </p>
        </div>
        {!showSportForm && (
          <button
            onClick={() => { setEditingSport(undefined); setShowSportForm(true); }}
            className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            + Nuevo Deporte
          </button>
        )}
      </div>

      {showSportForm && clubId && (
        <div className="mb-6">
          <SportForm clubId={clubId} sport={editingSport} onCancel={handleSportFormCancel} />
        </div>
      )}

      {sports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 px-6 py-12 text-center text-text-secondary">
          No hay deportes registrados. Crea uno para empezar a agregar planes.
        </div>
      ) : (
        <div className="space-y-4">
          {sports.map((sport) => {
            const sportPlans = plansBySport.get(sport.id) ?? [];
            const isCollapsed = collapsedSports.has(sport.id);
            const isAddingPlanHere = planFormSportId === sport.id && !editingPlan;
            const isEditingPlanHere = planFormSportId === sport.id && !!editingPlan;

            return (
              <div key={sport.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {/* Sport header */}
                <div className="flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 transition-colors">
                  <button
                    onClick={() => toggleSport(sport.id)}
                    className="flex items-center gap-3 min-w-0"
                  >
                    <svg
                      className={`w-4 h-4 text-text-secondary transition-transform shrink-0 ${isCollapsed ? "" : "rotate-90"}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <h2 className="text-base font-semibold text-text">{sport.name}</h2>
                    {sport.description && (
                      <span className="text-xs text-text-secondary truncate hidden sm:inline">— {sport.description}</span>
                    )}
                    <span className="text-xs text-text-secondary bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                      {sportPlans.length} {sportPlans.length === 1 ? "plan" : "planes"}
                    </span>
                  </button>

                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <button
                      onClick={() => openAddPlan(sport.id)}
                      className="text-xs text-primary hover:text-primary-dark font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      + Plan
                    </button>
                    <button
                      onClick={() => { setEditingSport(sport); setShowSportForm(true); }}
                      className="text-xs text-text-secondary hover:text-primary font-medium px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDeleteSport(sport.id)}
                      className="text-xs text-text-secondary hover:text-danger font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                {/* Plan form (add/edit) — shown inside the sport card */}
                {!isCollapsed && (isAddingPlanHere || isEditingPlanHere) && (
                  <div className="px-6 pb-4">
                    <PlanForm
                      sports={[sport]}
                      plan={editingPlan}
                      onCancel={handlePlanFormCancel}
                      hideSportSelect
                    />
                  </div>
                )}

                {/* Plans table */}
                {!isCollapsed && sportPlans.length > 0 && (
                  <table className="w-full table-fixed">
                    <colgroup>
                      <col className="w-[20%]" />
                      <col className="w-[11%]" />
                      <col className="w-[10%]" />
                      <col className="w-[8%]" />
                      <col className="w-[9%]" />
                      <col className="w-[12%]" />
                      <col className="w-[9%]" />
                      <col className="w-[21%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-t border-gray-100">
                        <th className="text-left px-6 py-3 text-xs font-medium text-text-secondary">Plan</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-text-secondary">Frecuencia</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-text-secondary">Precio</th>
                        <th className="text-center px-6 py-3 text-xs font-medium text-text-secondary">Inscritos</th>
                        <th className="text-center px-6 py-3 text-xs font-medium text-text-secondary">Capacidad</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-text-secondary">Est. mensual</th>
                        <th className="text-center px-6 py-3 text-xs font-medium text-text-secondary">Estado</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-text-secondary">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sportPlans.map((plan) => {
                        const count = enrollmentCounts.get(plan.id) ?? 0;
                        const isFull = plan.max_slots != null && count >= plan.max_slots;
                        return (
                          <tr key={plan.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 text-sm font-medium text-text">{plan.name}</td>
                            <td className="px-6 py-4 text-sm text-text-secondary">{plan.frequency}</td>
                            <td className="px-6 py-4 text-sm text-text text-right">{formatCLP(plan.price)}</td>
                            <td className={`px-6 py-4 text-sm text-center ${isFull ? "text-danger font-medium" : "text-text-secondary"}`}>{count}</td>
                            <td className="px-6 py-4 text-sm text-text-secondary text-center">{plan.max_slots ?? "—"}</td>
                            <td className="px-6 py-4 text-sm text-text font-medium text-right">{formatCLP(plan.price * count)}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${plan.is_active ? "bg-success-light text-success" : "bg-gray-100 text-gray-500"}`}>
                                {plan.is_active ? "Activo" : "Inactivo"}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right space-x-3">
                              <button onClick={() => openEditPlan(plan)} className="text-sm text-primary hover:text-primary-dark font-medium">Editar</button>
                              <button onClick={() => handleDeletePlan(plan.id)} className="text-sm text-danger hover:text-danger/80 font-medium">Eliminar</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {/* Empty state for sport with no plans */}
                {!isCollapsed && sportPlans.length === 0 && !isAddingPlanHere && (
                  <div className="border-t border-gray-100 px-6 py-6 text-center text-sm text-text-secondary">
                    Sin planes.{" "}
                    <button onClick={() => openAddPlan(sport.id)} className="text-primary hover:text-primary-dark font-medium">
                      Agregar uno
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
