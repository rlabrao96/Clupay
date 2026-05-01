import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { ImportClient } from "./import-client";

export default async function ImportarPage() {
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) redirect("/login");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text mb-1">Importar deportistas</h1>
        <p className="text-text-secondary text-sm">
          Sube un archivo Excel o CSV con apoderados e hijos.
        </p>
      </div>
      <ImportClient clubId={clubId} />
    </div>
  );
}
