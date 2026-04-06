"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DiscountType, DiscountDuration } from "@/types";

interface DiscountFormProps {
  clubId: string;
  onCancel: () => void;
}

export function DiscountForm({ clubId, onCancel }: DiscountFormProps) {
  const supabase = createClient();
  const router = useRouter();

  const [targetType, setTargetType] = useState<"kid" | "parent">("kid");
  const [searchEmail, setSearchEmail] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetLabel, setTargetLabel] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [value, setValue] = useState(0);
  const [duration, setDuration] = useState<DiscountDuration>("until_removed");
  const [remainingMonths, setRemainingMonths] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    setError(null);
    setTargetId(null);
    setTargetLabel("");

    if (!searchEmail.trim()) return;

    if (targetType === "parent") {
      const { data } = await supabase.from("profiles").select("id, name, last_names, email").eq("email", searchEmail.trim()).single();
      if (!data) { setError("No se encontró un apoderado con ese email"); return; }
      setTargetId(data.id);
      setTargetLabel(`${data.name} ${data.last_names} (${data.email})`);
    } else {
      const { data: parent } = await supabase.from("profiles").select("id").eq("email", searchEmail.trim()).single();
      if (!parent) { setError("No se encontró un apoderado con ese email"); return; }
      const { data: kids } = await supabase.from("kids").select("id, name, last_names").eq("parent_id", parent.id);
      if (!kids || kids.length === 0) { setError("Este apoderado no tiene hijos registrados"); return; }
      setTargetId(kids[0].id);
      setTargetLabel(`${kids[0].name} ${kids[0].last_names}`);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId) { setError("Primero busca y selecciona un destinatario"); return; }
    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from("discounts").insert({
      club_id: clubId,
      assigned_by: user!.id,
      kid_id: targetType === "kid" ? targetId : null,
      parent_id: targetType === "parent" ? targetId : null,
      type: discountType,
      value,
      duration,
      remaining_months: duration === "n_months" ? remainingMonths : null,
      is_active: true,
    });

    if (insertError) { setError(insertError.message); setSaving(false); return; }
    router.refresh();
    onCancel();
  }

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-4 space-y-4">
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="radio" name="targetType" checked={targetType === "kid"} onChange={() => { setTargetType("kid"); setTargetId(null); setTargetLabel(""); }} />
          Deportista (hijo)
        </label>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="radio" name="targetType" checked={targetType === "parent"} onChange={() => { setTargetType("parent"); setTargetId(null); setTargetLabel(""); }} />
          Apoderado
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-text mb-1">Email del apoderado</label>
        <div className="flex gap-2">
          <input type="email" value={searchEmail} onChange={(e) => setSearchEmail(e.target.value)} placeholder="email@ejemplo.cl" className={`flex-1 ${inputClass}`}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }} />
          <button type="button" onClick={handleSearch} className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors">Buscar</button>
        </div>
        {targetLabel && <p className="text-sm text-success mt-1">Seleccionado: {targetLabel}</p>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-text mb-1">Tipo</label>
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)} className={inputClass}>
            <option value="percentage">Porcentaje (%)</option>
            <option value="fixed_amount">Monto fijo (CLP)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">Valor {discountType === "percentage" ? "(%)" : "(CLP)"}</label>
          <input type="number" min={0} value={value} onChange={(e) => setValue(Number(e.target.value))} className={inputClass} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">Duración</label>
          <select value={duration} onChange={(e) => setDuration(e.target.value as DiscountDuration)} className={inputClass}>
            <option value="one_time">Una vez</option>
            <option value="n_months">N meses</option>
            <option value="until_removed">Hasta quitar</option>
          </select>
        </div>
      </div>

      {duration === "n_months" && (
        <div>
          <label className="block text-sm font-medium text-text mb-1">Meses restantes</label>
          <input type="number" min={1} value={remainingMonths} onChange={(e) => setRemainingMonths(Number(e.target.value))} className={inputClass} />
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50">
          {saving ? "Guardando..." : "Crear descuento"}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-200 text-sm font-medium text-text-secondary rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  );
}
