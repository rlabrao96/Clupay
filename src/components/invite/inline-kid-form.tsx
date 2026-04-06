"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RutInput } from "@/components/shared/rut-input";
import { cleanRut } from "@/lib/rut/validate";
import type { Kid } from "@/types";

interface InlineKidFormProps {
  onCreated: (kid: Kid) => void;
  onCancel: () => void;
}

export function InlineKidForm({ onCreated, onCancel }: InlineKidFormProps) {
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

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada");
      setSaving(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("kids")
      .insert({
        parent_id: user.id,
        name: name.trim(),
        last_names: lastNames.trim(),
        rut: cleanRut(rut),
        date_of_birth: dateOfBirth,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.message.includes("duplicate")) {
        setError("Ya existe un hijo registrado con ese RUT");
      } else {
        setError(insertError.message);
      }
      setSaving(false);
      return;
    }

    onCreated(data as Kid);
  }

  const inputClass =
    "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-text">Nuevo hijo</p>
      {error && (
        <div className="bg-danger-light text-danger text-xs px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          required
          className={inputClass}
        />
        <input
          type="text"
          value={lastNames}
          onChange={(e) => setLastNames(e.target.value)}
          placeholder="Apellidos"
          required
          className={inputClass}
        />
      </div>
      <RutInput
        value={rut}
        onChange={(val, valid) => {
          setRut(val);
          setRutValid(valid);
        }}
        required
      />
      <input
        type="date"
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
        required
        className={inputClass}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-200 text-sm font-medium text-text-secondary rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
