"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Club } from "@/types";

interface ClubFormProps {
  club?: Club;
}

export function ClubForm({ club }: ClubFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const isEditing = !!club;

  const [name, setName] = useState(club?.name ?? "");
  const [contactEmail, setContactEmail] = useState(club?.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(club?.contact_phone ?? "");
  const [billingDay, setBillingDay] = useState(club?.billing_day ?? 1);
  const [feeFixed, setFeeFixed] = useState(club?.platform_fee_fixed ?? 0);
  const [feePercent, setFeePercent] = useState(club?.platform_fee_percent ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      billing_day: billingDay,
      platform_fee_fixed: feeFixed,
      platform_fee_percent: feePercent,
    };

    if (!payload.name) {
      setError("El nombre del club es obligatorio");
      setSaving(false);
      return;
    }

    if (isEditing) {
      const { error: updateError } = await supabase
        .from("clubs")
        .update(payload)
        .eq("id", club.id);
      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("clubs")
        .insert(payload);
      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
    }

    router.push("/admin/clubes");
    router.refresh();
  }

  const inputClass =
    "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
  const labelClass = "block text-sm font-medium text-text mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      {error && (
        <div className="bg-danger-light text-danger text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className={labelClass}>
          Nombre del club *
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          required
        />
      </div>

      <div>
        <label htmlFor="contactEmail" className={labelClass}>
          Email de contacto
        </label>
        <input
          id="contactEmail"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="contactPhone" className={labelClass}>
          Teléfono de contacto
        </label>
        <input
          id="contactPhone"
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          className={inputClass}
          placeholder="+56 9 1234 5678"
        />
      </div>

      <div>
        <label htmlFor="billingDay" className={labelClass}>
          Día de facturación (1-28)
        </label>
        <input
          id="billingDay"
          type="number"
          min={1}
          max={28}
          value={billingDay}
          onChange={(e) => setBillingDay(Number(e.target.value))}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="feeFixed" className={labelClass}>
            Tarifa fija mensual (CLP)
          </label>
          <input
            id="feeFixed"
            type="number"
            min={0}
            value={feeFixed}
            onChange={(e) => setFeeFixed(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="feePercent" className={labelClass}>
            Comisión (%)
          </label>
          <input
            id="feePercent"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={feePercent}
            onChange={(e) => setFeePercent(Number(e.target.value))}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear club"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/clubes")}
          className="px-6 py-2.5 border border-gray-200 text-sm font-medium text-text-secondary rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
