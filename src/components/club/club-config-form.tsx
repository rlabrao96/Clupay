"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Club } from "@/types";

interface ClubConfigFormProps {
  club: Club;
}

export function ClubConfigForm({ club }: ClubConfigFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(club.name);
  const [contactEmail, setContactEmail] = useState(club.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(club.contact_phone ?? "");
  const [billingDay, setBillingDay] = useState(club.billing_day);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    if (!name.trim()) { setError("El nombre es obligatorio"); setSaving(false); return; }

    const { error: updateError } = await supabase.from("clubs").update({
      name: name.trim(),
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      billing_day: billingDay,
    }).eq("id", club.id);

    if (updateError) { setError(updateError.message); setSaving(false); return; }

    setSaving(false);
    setSuccess(true);
    router.refresh();
  }

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
  const labelClass = "block text-sm font-medium text-text mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      {error && <div className="bg-danger-light text-danger text-sm px-4 py-3 rounded-lg">{error}</div>}
      {success && <div className="bg-success-light text-success text-sm px-4 py-3 rounded-lg">Configuración guardada exitosamente</div>}
      <div>
        <label htmlFor="clubName" className={labelClass}>Nombre del club *</label>
        <input id="clubName" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label htmlFor="clubEmail" className={labelClass}>Email de contacto</label>
        <input id="clubEmail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="clubPhone" className={labelClass}>Teléfono de contacto</label>
        <input id="clubPhone" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputClass} placeholder="+56 9 1234 5678" />
      </div>
      <div>
        <label htmlFor="clubBilling" className={labelClass}>Día de facturación (1-28)</label>
        <input id="clubBilling" type="number" min={1} max={28} value={billingDay} onChange={(e) => setBillingDay(Number(e.target.value))} className={inputClass} />
      </div>
      <button type="submit" disabled={saving} className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50">
        {saving ? "Guardando..." : "Guardar configuración"}
      </button>
    </form>
  );
}
