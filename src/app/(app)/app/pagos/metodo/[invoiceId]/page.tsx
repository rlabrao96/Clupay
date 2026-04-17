import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getEnabledPaymentMethods } from "@/lib/club-payments";
import { formatCLP } from "@/lib/format";
import { MethodList } from "./method-list";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default async function PaymentMethodSelectorPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, parent_id, total, period_month, period_year, status, clubs(*)")
    .eq("id", invoiceId)
    .single();

  if (!invoice || invoice.parent_id !== user.id) redirect("/app");
  if (invoice.status !== "pending" && invoice.status !== "overdue") redirect("/app");

  const club = invoice.clubs as unknown as import("@/types").Club;
  const methods = getEnabledPaymentMethods(club);
  if (methods.length === 0) redirect("/app");

  const periodLabel = `${MONTH_NAMES[invoice.period_month - 1]} ${invoice.period_year}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">¿Cómo quieres pagar?</h1>
        <p className="text-text-secondary">
          Factura {periodLabel} · {formatCLP(invoice.total)}
        </p>
      </div>
      <MethodList invoiceId={invoiceId} methods={methods} />
    </div>
  );
}
