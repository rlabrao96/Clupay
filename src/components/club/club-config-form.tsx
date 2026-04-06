"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Club } from "@/types";

interface ClubConfigFormProps {
  club: Club;
}

export function ClubConfigForm({ club }: ClubConfigFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(club.name);
  const [contactEmail, setContactEmail] = useState(club.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(club.contact_phone ?? "");
  const [billingDay, setBillingDay] = useState(club.billing_day);
  const [dueDay, setDueDay] = useState(club.due_day);
  const [autoApprove, setAutoApprove] = useState(club.auto_approve_invoices);
  const [logoUrl, setLogoUrl] = useState(club.logo_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Solo se permiten archivos de imagen");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("La imagen no puede superar 2 MB");
      return;
    }

    setUploading(true);
    setError(null);

    const ext = file.name.split(".").pop();
    const path = `${club.id}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("club-logos")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setError(`Error al subir: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("club-logos").getPublicUrl(path);
    setLogoUrl(publicUrl);
    setUploading(false);
  }

  async function handleRemoveLogo() {
    setLogoUrl("");
  }

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
      due_day: dueDay,
      auto_approve_invoices: autoApprove,
      logo_url: logoUrl || null,
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

      {/* Logo upload */}
      <div>
        <label className={labelClass}>Logo del club</label>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo del club"
              className="w-16 h-16 rounded-lg object-contain border border-gray-200 bg-white"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-sm text-primary hover:text-primary-dark font-medium disabled:opacity-50"
            >
              {uploading ? "Subiendo..." : logoUrl ? "Cambiar logo" : "Subir logo"}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="text-sm text-danger hover:text-danger/80 font-medium"
              >
                Quitar logo
              </button>
            )}
            <p className="text-xs text-text-secondary">PNG, JPG o SVG. Máx 2 MB.</p>
          </div>
        </div>
      </div>

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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="clubBilling" className={labelClass}>Día de facturación (1-28)</label>
          <input id="clubBilling" type="number" min={1} max={28} value={billingDay} onChange={(e) => setBillingDay(Number(e.target.value))} className={inputClass} />
        </div>
        <div>
          <label htmlFor="clubDueDay" className={labelClass}>Día de vencimiento (1-28)</label>
          <input id="clubDueDay" type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} className={inputClass} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          id="autoApprove"
          type="checkbox"
          checked={autoApprove}
          onChange={(e) => setAutoApprove(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/20"
        />
        <label htmlFor="autoApprove" className="text-sm text-text">
          Aprobar facturas automáticamente
        </label>
      </div>
      <button type="submit" disabled={saving} className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50">
        {saving ? "Guardando..." : "Guardar configuración"}
      </button>
    </form>
  );
}
