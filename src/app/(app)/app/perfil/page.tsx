import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/app/profile-form";
import type { Profile } from "@/types";

export default async function PerfilPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-text">Mi Perfil</h1>
        <p className="text-text-secondary text-sm">Tus datos personales</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <ProfileForm profile={profile as Profile} />
      </div>
    </div>
  );
}
