import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ReturnClient } from "./retorno-client";

interface PageProps {
  searchParams: Promise<{ token?: string; paymentId?: string }>;
}

export default async function RetornoPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Flow's hosted checkout does not reliably append ?token=<t> when
  // redirecting the browser to urlReturn, so we cannot depend on query
  // params alone. Fall back to the most recent Flow payment for the
  // authenticated parent — the one that just went through checkout.
  let paymentId: string | null = params.paymentId ?? null;
  let token: string | null = params.token ?? null;

  if (!token && !paymentId) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: recent } = await supabase
      .from("payments")
      .select("id, invoices!inner(parent_id)")
      .eq("invoices.parent_id", user.id)
      .not("flow_transaction_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent?.id) {
      paymentId = recent.id;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Pago</h1>
        <p className="text-text-secondary">Verificando el resultado del pago</p>
      </div>
      <ReturnClient token={token} paymentId={paymentId} />
    </div>
  );
}
