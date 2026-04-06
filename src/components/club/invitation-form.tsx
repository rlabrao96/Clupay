"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendInvitation } from "@/lib/actions/send-invitation";

interface InvitationFormProps {
  clubId: string;
}

export function InvitationForm({ clubId }: InvitationFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const result = await sendInvitation(clubId, email);

    if (!result.success) {
      setError(result.error ?? "Error al enviar invitación");
      setSaving(false);
      return;
    }

    setEmail("");
    setSuccess(true);
    setSaving(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-text mb-3">Enviar invitación</h3>
      {error && <p className="text-sm text-danger mb-2">{error}</p>}
      {success && <p className="text-sm text-success mb-2">Invitación enviada exitosamente</p>}
      <div className="flex gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@ejemplo.cl"
          className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" required />
        <button type="submit" disabled={saving}
          className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50">
          {saving ? "Enviando..." : "Invitar"}
        </button>
      </div>
    </form>
  );
}
