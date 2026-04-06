"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SportForm } from "@/components/club/sport-form";
import type { Sport } from "@/types";

export default function DeportesPage() {
  const supabase = createClient();
  const [clubId, setClubId] = useState<string | null>(null);
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSport, setEditingSport] = useState<Sport | undefined>(undefined);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: clubAdmin } = await supabase.from("club_admins").select("club_id").eq("profile_id", user.id).limit(1).single();
    if (!clubAdmin) return;
    setClubId(clubAdmin.club_id);
    const { data } = await supabase.from("sports").select("*").eq("club_id", clubAdmin.club_id).order("name");
    setSports((data as Sport[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleDelete(sportId: string) {
    if (!confirm("¿Eliminar este deporte? Se eliminarán también sus planes asociados.")) return;
    const { error } = await supabase.from("sports").delete().eq("id", sportId);
    if (error) { alert(`Error al eliminar: ${error.message}`); return; }
    loadData();
  }

  function handleEdit(sport: Sport) { setEditingSport(sport); setShowForm(true); }
  function handleCancel() { setShowForm(false); setEditingSport(undefined); loadData(); }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">Deportes</h1>
          <p className="text-text-secondary">{sports.length} {sports.length === 1 ? "deporte" : "deportes"}</p>
        </div>
        {!showForm && (
          <button onClick={() => { setEditingSport(undefined); setShowForm(true); }} className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors">
            + Nuevo Deporte
          </button>
        )}
      </div>

      {showForm && clubId && (
        <div className="mb-6">
          <SportForm clubId={clubId} sport={editingSport} onCancel={handleCancel} />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Nombre</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Descripción</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sports.length === 0 ? (
              <tr><td colSpan={3} className="px-6 py-12 text-center text-text-secondary">No hay deportes registrados</td></tr>
            ) : (
              sports.map((sport) => (
                <tr key={sport.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-text">{sport.name}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{sport.description ?? "—"}</td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button onClick={() => handleEdit(sport)} className="text-sm text-primary hover:text-primary-dark font-medium">Editar</button>
                    <button onClick={() => handleDelete(sport.id)} className="text-sm text-danger hover:text-danger/80 font-medium">Eliminar</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
