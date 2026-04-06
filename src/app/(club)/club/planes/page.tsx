"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCLP } from "@/lib/format";
import { PlanForm } from "@/components/club/plan-form";
import type { Plan, Sport } from "@/types";

interface PlanWithSport extends Plan {
  sports: { name: string; club_id: string };
}

export default function PlanesPage() {
  const supabase = createClient();
  const [sports, setSports] = useState<Sport[]>([]);
  const [plans, setPlans] = useState<PlanWithSport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | undefined>(undefined);
  const [collapsedSports, setCollapsedSports] = useState<Set<string>>(new Set());

  const plansBySport = useMemo(() => {
    const grouped = new Map<string, { sportName: string; plans: PlanWithSport[] }>();
    for (const plan of plans) {
      const sportName = plan.sports?.name ?? "Sin deporte";
      const sportId = plan.sport_id;
      if (!grouped.has(sportId)) {
        grouped.set(sportId, { sportName, plans: [] });
      }
      grouped.get(sportId)!.plans.push(plan);
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
    const clubId = clubAdmin.club_id;

    const [sportsRes, plansRes] = await Promise.all([
      supabase.from("sports").select("*").eq("club_id", clubId).order("name"),
      supabase.from("plans").select("*, sports:sport_id!inner(name, club_id)").eq("sports.club_id", clubId).order("name"),
    ]);

    setSports((sportsRes.data as Sport[]) ?? []);
    setPlans((plansRes.data ?? []) as PlanWithSport[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleDelete(planId: string) {
    if (!confirm("¿Eliminar este plan?")) return;
    const { error } = await supabase.from("plans").delete().eq("id", planId);
    if (error) { alert(`Error al eliminar: ${error.message}`); return; }
    loadData();
  }

  function handleCancel() { setShowForm(false); setEditingPlan(undefined); loadData(); }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">Planes</h1>
          <p className="text-text-secondary">{plans.length} {plans.length === 1 ? "plan" : "planes"}</p>
        </div>
        {!showForm && sports.length > 0 && (
          <button onClick={() => { setEditingPlan(undefined); setShowForm(true); }} className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors">
            + Nuevo Plan
          </button>
        )}
      </div>

      {sports.length === 0 && (
        <div className="bg-warning-light text-warning text-sm px-4 py-3 rounded-lg mb-6">
          Primero debes crear al menos un deporte antes de agregar planes.
        </div>
      )}

      {showForm && (
        <div className="mb-6"><PlanForm sports={sports} plan={editingPlan} onCancel={handleCancel} /></div>
      )}

      {plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 px-6 py-12 text-center text-text-secondary">
          No hay planes registrados
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(plansBySport.entries()).map(([sportId, { sportName, plans: sportPlans }]) => {
            const isCollapsed = collapsedSports.has(sportId);
            return (
              <div key={sportId} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <button
                  onClick={() => toggleSport(sportId)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className={`w-4 h-4 text-text-secondary transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <h2 className="text-base font-semibold text-text">{sportName}</h2>
                    <span className="text-xs text-text-secondary bg-gray-100 px-2 py-0.5 rounded-full">
                      {sportPlans.length} {sportPlans.length === 1 ? "plan" : "planes"}
                    </span>
                  </div>
                </button>

                {!isCollapsed && (
                  <table className="w-full">
                    <thead>
                      <tr className="border-t border-gray-100">
                        <th className="text-left px-6 py-3 text-xs font-medium text-text-secondary">Plan</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-text-secondary">Precio</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-text-secondary">Frecuencia</th>
                        <th className="text-center px-6 py-3 text-xs font-medium text-text-secondary">Estado</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-text-secondary">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sportPlans.map((plan) => (
                        <tr key={plan.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-text">{plan.name}</td>
                          <td className="px-6 py-4 text-sm text-text text-right">{formatCLP(plan.price)}</td>
                          <td className="px-6 py-4 text-sm text-text-secondary">{plan.frequency}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${plan.is_active ? "bg-success-light text-success" : "bg-gray-100 text-gray-500"}`}>
                              {plan.is_active ? "Activo" : "Inactivo"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right space-x-3">
                            <button onClick={() => { setEditingPlan(plan); setShowForm(true); }} className="text-sm text-primary hover:text-primary-dark font-medium">Editar</button>
                            <button onClick={() => handleDelete(plan.id)} className="text-sm text-danger hover:text-danger/80 font-medium">Eliminar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
