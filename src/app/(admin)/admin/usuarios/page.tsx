import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import type { UserRole } from "@/types";

const roleBadgeStyles: Record<UserRole, string> = {
  super_admin: "bg-primary-light text-primary",
  club_admin: "bg-warning-light text-warning",
  parent: "bg-success-light text-success",
};

const roleLabels: Record<UserRole, string> = {
  super_admin: "Super Admin",
  club_admin: "Admin Club",
  parent: "Apoderado",
};

export default async function UsuariosPage() {
  const supabase = await createServerSupabaseClient();

  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  const profiles = users ?? [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text mb-1">Usuarios</h1>
        <p className="text-text-secondary">
          {profiles.length} {profiles.length === 1 ? "usuario" : "usuarios"} en la plataforma
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Nombre</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Email</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">RUT</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Rol</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Registro</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-text-secondary">
                  No hay usuarios registrados
                </td>
              </tr>
            ) : (
              profiles.map((user) => (
                <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-text">
                    {user.name} {user.last_names}
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{user.email}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary font-mono">{user.rut}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${
                      roleBadgeStyles[user.role as UserRole] ?? "bg-gray-100 text-gray-600"
                    }`}>
                      {roleLabels[user.role as UserRole] ?? user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{formatDate(user.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
