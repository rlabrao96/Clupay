"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Plan, Sport } from "@/types";

interface PlanFormProps {
  sports: Sport[];
  plan?: Plan;
  onCancel: () => void;
  hideSportSelect?: boolean;
}

export function PlanForm({ sports, plan, onCancel, hideSportSelect }: PlanFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const isEditing = !!plan;

  const [sportId, setSportId] = useState(plan?.sport_id ?? sports[0]?.id ?? "");
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [price, setPrice] = useState(plan?.price ?? 0);
  const [frequency, setFrequency] = useState(plan?.frequency ?? "");
  const [isActive, setIsActive] = useState(plan?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!name.trim()) { setError("El nombre es obligatorio"); setSaving(false); return; }
    if (!frequency.trim()) { setError("La frecuencia es obligatoria"); setSaving(false); return; }

    const payload = {
      sport_id: sportId,
      name: name.trim(),
      description: description.trim() || null,
      price,
      frequency: frequency.trim(),
      is_active: isActive,
    };

    if (isEditing) {
      const { error: err } = await supabase.from("plans").update(payload).eq("id", plan.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { error: err } = await supabase.from("plans").insert(payload);
      if (err) { setError(err.message); setSaving(false); return; }
    }

    router.refresh();
    onCancel();
  }

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-4 space-y-4">
      {error && <p className="text-sm text-danger">{error}</p>}
      {!hideSportSelect && (
        <div>
          <label htmlFor="planSport" className="block text-sm font-medium text-text mb-1">Deporte *</label>
          <select id="planSport" value={sportId} onChange={(e) => setSportId(e.target.value)} className={inputClass} disabled={isEditing}>
            {sports.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="planName" className="block text-sm font-medium text-text mb-1">Nombre *</label>
          <input id="planName" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
        </div>
        <div>
          <label htmlFor="planFreq" className="block text-sm font-medium text-text mb-1">Frecuencia *</label>
          <input id="planFreq" type="text" value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputClass} placeholder="ej: 3x/semana" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="planPrice" className="block text-sm font-medium text-text mb-1">Precio (CLP) *</label>
          <input id="planPrice" type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} className={inputClass} required />
        </div>
        <div>
          <label htmlFor="planDesc" className="block text-sm font-medium text-text mb-1">Descripción</label>
          <input id="planDesc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>
      </div>
      {isEditing && (
        <div className="flex items-center gap-2">
          <input id="planActive" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-gray-300" />
          <label htmlFor="planActive" className="text-sm text-text">Activo</label>
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50">
          {saving ? "Guardando..." : isEditing ? "Guardar" : "Crear plan"}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-200 text-sm font-medium text-text-secondary rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  );
}
