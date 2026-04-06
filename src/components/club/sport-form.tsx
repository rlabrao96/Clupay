"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Sport } from "@/types";

interface SportFormProps {
  clubId: string;
  sport?: Sport;
  onCancel: () => void;
}

export function SportForm({ clubId, sport, onCancel }: SportFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const isEditing = !!sport;

  const [name, setName] = useState(sport?.name ?? "");
  const [description, setDescription] = useState(sport?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      club_id: clubId,
      name: name.trim(),
      description: description.trim() || null,
    };

    if (!payload.name) {
      setError("El nombre es obligatorio");
      setSaving(false);
      return;
    }

    if (isEditing) {
      const { error: updateError } = await supabase
        .from("sports")
        .update({ name: payload.name, description: payload.description })
        .eq("id", sport.id);
      if (updateError) { setError(updateError.message); setSaving(false); return; }
    } else {
      const { error: insertError } = await supabase.from("sports").insert(payload);
      if (insertError) { setError(insertError.message); setSaving(false); return; }
    }

    router.refresh();
    onCancel();
  }

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-4 space-y-4">
      {error && <p className="text-sm text-danger">{error}</p>}
      <div>
        <label htmlFor="sportName" className="block text-sm font-medium text-text mb-1">Nombre *</label>
        <input id="sportName" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label htmlFor="sportDesc" className="block text-sm font-medium text-text mb-1">Descripción</label>
        <input id="sportDesc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50">
          {saving ? "Guardando..." : isEditing ? "Guardar" : "Crear deporte"}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-200 text-sm font-medium text-text-secondary rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  );
}
