"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";

interface ClubAdminManagerProps {
  clubId: string;
}

interface AdminWithProfile {
  id: string;
  profile: Profile;
}

export function ClubAdminManager({ clubId }: ClubAdminManagerProps) {
  const supabase = createClient();
  const [admins, setAdmins] = useState<AdminWithProfile[]>([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResult, setSearchResult] = useState<Profile | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadAdmins() {
    const { data } = await supabase
      .from("club_admins")
      .select("id, profile_id, profiles:profile_id(id, name, last_names, email, rut, date_of_birth, phone, role, created_at, updated_at)")
      .eq("club_id", clubId);

    if (data) {
      setAdmins(
        data.map((row: Record<string, unknown>) => ({
          id: row.id as string,
          profile: row.profiles as unknown as Profile,
        }))
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  async function handleSearch() {
    setSearchError(null);
    setSearchResult(null);

    if (!searchEmail.trim()) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", searchEmail.trim())
      .single();

    if (error || !data) {
      setSearchError("No se encontró un usuario con ese email");
      return;
    }

    if (admins.some((a) => a.profile.id === data.id)) {
      setSearchError("Este usuario ya es administrador de este club");
      return;
    }

    setSearchResult(data as Profile);
  }

  async function handleAssign() {
    if (!searchResult) return;

    if (searchResult.role === "parent") {
      await supabase
        .from("profiles")
        .update({ role: "club_admin" })
        .eq("id", searchResult.id);
    }

    const { error } = await supabase
      .from("club_admins")
      .insert({ club_id: clubId, profile_id: searchResult.id });

    if (error) {
      setSearchError(error.message);
      return;
    }

    setSearchEmail("");
    setSearchResult(null);
    loadAdmins();
  }

  async function handleRemove(adminId: string) {
    await supabase.from("club_admins").delete().eq("id", adminId);
    loadAdmins();
  }

  if (loading) {
    return <p className="text-sm text-text-secondary">Cargando administradores...</p>;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-text">Administradores del club</h3>

      {admins.length === 0 ? (
        <p className="text-sm text-text-secondary">No hay administradores asignados</p>
      ) : (
        <ul className="space-y-2">
          {admins.map((admin) => (
            <li
              key={admin.id}
              className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg"
            >
              <div>
                <p className="text-sm font-medium text-text">
                  {admin.profile.name} {admin.profile.last_names}
                </p>
                <p className="text-xs text-text-secondary">{admin.profile.email}</p>
              </div>
              <button
                onClick={() => handleRemove(admin.id)}
                className="text-xs text-danger hover:text-danger/80 font-medium"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          Asignar administrador por email
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            placeholder="email@ejemplo.cl"
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
          />
          <button
            type="button"
            onClick={handleSearch}
            className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            Buscar
          </button>
        </div>

        {searchError && (
          <p className="text-sm text-danger mt-2">{searchError}</p>
        )}

        {searchResult && (
          <div className="mt-3 flex items-center justify-between px-4 py-3 bg-primary-light rounded-lg">
            <div>
              <p className="text-sm font-medium text-text">
                {searchResult.name} {searchResult.last_names}
              </p>
              <p className="text-xs text-text-secondary">
                {searchResult.email} · Rol actual: {searchResult.role}
              </p>
            </div>
            <button
              onClick={handleAssign}
              className="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary-dark transition-colors"
            >
              Asignar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
