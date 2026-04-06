"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RutInput } from "@/components/shared/rut-input";
import { cleanRut } from "@/lib/rut/validate";

export function KidForm() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [lastNames, setLastNames] = useState("");
  const [rut, setRut] = useState("");
  const [rutValid, setRutValid] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!name.trim() || !lastNames.trim()) {
      setError("Nombre y apellidos son obligatorios");
      setSaving(false);
      return;
    }
    if (!rutValid) {
      setError("RUT inválido");
      setSaving(false);
      return;
    }
    if (!dateOfBirth) {
      setError("Fecha de nacimiento es obligatoria");
      setSaving(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("kids").insert({
      parent_id: user.id,
      name: name.trim(),
      last_names: lastNames.trim(),
      rut: cleanRut(rut),
      date_of_birth: dateOfBirth,
    });

    if (insertError) {
      if (insertError.message.includes("duplicate")) {
        setError("Ya existe un hijo registrado con ese RUT");
      } else {
        setError(insertError.message);
      }
      setSaving(false);
      return;
    }

    router.push("/app/hijos");
    router.refresh();
  }

  const inputClass =
    "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
  const labelClass = "block text-sm font-medium text-text mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-danger-light text-danger text-sm px-4 py-3 rounded-lg">{error}</div>
      )}
      <div>
        <label htmlFor="kidName" className={labelClass}>Nombre *</label>
        <input id="kidName" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label htmlFor="kidLastNames" className={labelClass}>Apellidos *</label>
        <input id="kidLastNames" type="text" value={lastNames} onChange={(e) => setLastNames(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label className={labelClass}>RUT *</label>
        <RutInput value={rut} onChange={(val, valid) => { setRut(val); setRutValid(valid); }} required />
      </div>
      <div>
        <label htmlFor="kidDob" className={labelClass}>Fecha de nacimiento *</label>
        <input id="kidDob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputClass} required />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50">
          {saving ? "Guardando..." : "Agregar hijo"}
        </button>
        <button type="button" onClick={() => router.push("/app/hijos")} className="px-4 py-2.5 border border-gray-200 text-sm font-medium text-text-secondary rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  );
}
