import { createServerSupabaseClient } from "@/lib/supabase/server";
import { InvitationClient } from "./invitation-client";
import type { Sport, Plan } from "@/types";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();

  // Fetch invitation with club info
  const { data: invitation } = await supabase
    .from("invitations")
    .select("*, clubs:club_id(id, name, logo_url, contact_email)")
    .eq("token", token)
    .single();

  // Token not found
  if (!invitation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-danger-light rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-danger text-xl">✕</span>
          </div>
          <h1 className="text-lg font-bold text-text mb-2">Invitación no encontrada</h1>
          <p className="text-sm text-text-secondary mb-6">
            El enlace de invitación no es válido. Verifica que el enlace sea correcto.
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            Ir al inicio de sesión
          </a>
        </div>
      </div>
    );
  }

  // Token expired or already used
  const isExpired = new Date(invitation.expires_at) < new Date();
  const isUsed = invitation.status === "accepted";

  if (isExpired || isUsed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-warning-light rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-warning text-xl">⚠</span>
          </div>
          <h1 className="text-lg font-bold text-text mb-2">
            {isUsed ? "Invitación ya utilizada" : "Invitación expirada"}
          </h1>
          <p className="text-sm text-text-secondary mb-6">
            {isUsed
              ? "Esta invitación ya fue aceptada."
              : "Esta invitación ha expirado. Contacta al club para una nueva invitación."}
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            Ir al inicio de sesión
          </a>
        </div>
      </div>
    );
  }

  // Fetch sports and plans for the club
  const club = invitation.clubs as { id: string; name: string; logo_url: string | null; contact_email: string | null };

  const { data: sports } = await supabase
    .from("sports")
    .select("*")
    .eq("club_id", club.id)
    .order("name");

  const sportIds = (sports ?? []).map((s: Sport) => s.id);
  const { data: plans } =
    sportIds.length > 0
      ? await supabase
          .from("plans")
          .select("*")
          .in("sport_id", sportIds)
          .eq("is_active", true)
          .order("price")
      : { data: [] };

  return (
    <InvitationClient
      token={token}
      clubId={club.id}
      clubName={club.name}
      clubLogoUrl={club.logo_url}
      sports={(sports ?? []) as Sport[]}
      plans={(plans ?? []) as Plan[]}
    />
  );
}
