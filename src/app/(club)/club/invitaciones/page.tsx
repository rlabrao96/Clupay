import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { formatDate } from "@/lib/format";
import { InvitationForm } from "@/components/club/invitation-form";
import { DeleteInvitationButton } from "@/components/club/delete-invitation-button";

const statusBadge: Record<string, string> = {
  pending: "bg-warning-light text-warning",
  accepted: "bg-success-light text-success",
  expired: "bg-gray-100 text-gray-500",
};

const statusLabel: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  expired: "Expirada",
};

export default async function InvitacionesPage() {
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) redirect("/login");

  const { data: invitations } = await supabase
    .from("invitations")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  const rows = invitations ?? [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text mb-1">Invitaciones</h1>
        <p className="text-text-secondary">Invita apoderados a unirse al club</p>
      </div>

      <div className="mb-6">
        <InvitationForm clubId={clubId} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[25%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Email</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Fecha envío</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Expira</th>
              <th className="text-center px-6 py-4 text-sm font-medium text-text-secondary">Estado</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-text-secondary">No hay invitaciones enviadas</td></tr>
            ) : (
              rows.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-text">{inv.email ?? inv.phone ?? "—"}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{formatDate(inv.created_at)}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{formatDate(inv.expires_at)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${statusBadge[inv.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {statusLabel[inv.status] ?? inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <DeleteInvitationButton invitationId={inv.id} />
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
