"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DiscountForm } from "@/components/club/discount-form";
import type { DiscountType, DiscountDuration } from "@/types";

interface DiscountRow {
  id: string;
  type: DiscountType;
  value: number;
  duration: DiscountDuration;
  remaining_months: number | null;
  is_active: boolean;
  kid_name: string | null;
  parent_name: string | null;
}

const durationLabel: Record<DiscountDuration, string> = {
  one_time: "Una vez",
  n_months: "N meses",
  until_removed: "Hasta quitar",
};

export default function DescuentosPage() {
  const supabase = createClient();
  const [clubId, setClubId] = useState<string | null>(null);
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: clubAdmin } = await supabase.from("club_admins").select("club_id").eq("profile_id", user.id).limit(1).single();
    if (!clubAdmin) return;
    setClubId(clubAdmin.club_id);

    const { data } = await supabase
      .from("discounts")
      .select("*, kids:kid_id(name, last_names), profiles:parent_id(name, last_names)")
      .eq("club_id", clubAdmin.club_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    const rows: DiscountRow[] = (data ?? []).map((d: any) => ({
      id: d.id,
      type: d.type,
      value: Number(d.value),
      duration: d.duration,
      remaining_months: d.remaining_months,
      is_active: d.is_active,
      kid_name: d.kids ? `${d.kids.name} ${d.kids.last_names}` : null,
      parent_name: d.profiles ? `${d.profiles.name} ${d.profiles.last_names}` : null,
    }));

    setDiscounts(rows);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleDeactivate(discountId: string) {
    if (!confirm("¿Desactivar este descuento?")) return;
    const { error } = await supabase.from("discounts").update({ is_active: false }).eq("id", discountId);
    if (error) { alert(`Error al desactivar: ${error.message}`); return; }
    loadData();
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">Descuentos</h1>
          <p className="text-text-secondary">{discounts.length} descuentos activos</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors">
            + Nuevo Descuento
          </button>
        )}
      </div>

      {showForm && clubId && (
        <div className="mb-6">
          <DiscountForm clubId={clubId} onCancel={() => { setShowForm(false); loadData(); }} />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Destinatario</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Tipo</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Valor</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Duración</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {discounts.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-text-secondary">No hay descuentos activos</td></tr>
            ) : (
              discounts.map((d) => (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-text">
                    {d.kid_name ?? d.parent_name ?? "—"}
                    <span className="text-xs text-text-secondary ml-1">({d.kid_name ? "deportista" : "apoderado"})</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{d.type === "percentage" ? "Porcentaje" : "Monto fijo"}</td>
                  <td className="px-6 py-4 text-sm font-medium text-text text-right">
                    {d.type === "percentage" ? `${d.value}%` : `$${d.value.toLocaleString("es-CL")}`}
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
                    {durationLabel[d.duration]}{d.duration === "n_months" && d.remaining_months != null && ` (${d.remaining_months} restantes)`}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleDeactivate(d.id)} className="text-sm text-danger hover:text-danger/80 font-medium">Desactivar</button>
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
