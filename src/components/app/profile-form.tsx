"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatRut } from "@/lib/rut/validate";
import type { Profile } from "@/types";

interface ProfileFormProps {
  profile: Profile;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(profile.name);
  const [lastNames, setLastNames] = useState(profile.last_names);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    if (!name.trim() || !lastNames.trim()) {
      setError("Nombre y apellidos son obligatorios");
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        name: name.trim(),
        last_names: lastNames.trim(),
        phone: phone.trim() || null,
      })
      .eq("id", profile.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSuccess(true);
    router.refresh();
  }

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
  const readonlyClass = "w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm text-text-secondary bg-gray-50";
  const labelClass = "block text-sm font-medium text-text mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="bg-danger-light text-danger text-sm px-4 py-3 rounded-lg">{error}</div>}
      {success && <div className="bg-success-light text-success text-sm px-4 py-3 rounded-lg">Perfil actualizado</div>}

      <div>
        <label htmlFor="profName" className={labelClass}>Nombre *</label>
        <input id="profName" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label htmlFor="profLastNames" className={labelClass}>Apellidos *</label>
        <input id="profLastNames" type="text" value={lastNames} onChange={(e) => setLastNames(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label className={labelClass}>Email</label>
        <input type="email" value={profile.email} className={readonlyClass} readOnly />
      </div>
      <div>
        <label className={labelClass}>RUT</label>
        <input type="text" value={formatRut(profile.rut)} className={readonlyClass} readOnly />
      </div>
      <div>
        <label className={labelClass}>Fecha de nacimiento</label>
        <input type="text" value={profile.date_of_birth} className={readonlyClass} readOnly />
      </div>
      <div>
        <label htmlFor="profPhone" className={labelClass}>Teléfono</label>
        <input id="profPhone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="+56 9 1234 5678" />
      </div>
      <button type="submit" disabled={saving} className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50">
        {saving ? "Guardando..." : "Guardar cambios"}
      </button>
    </form>
  );
}
