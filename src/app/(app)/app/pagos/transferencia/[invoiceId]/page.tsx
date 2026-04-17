import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/format";
import { BANK_ACCOUNT_TYPES } from "@/lib/banks";
import { CopyableField } from "./copyable-field";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default async function DirectTransferPage({
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
  if (
    !club.pm_direct_transfer ||
    !club.bank_holder_name ||
    !club.bank_holder_rut ||
    !club.bank_name ||
    !club.bank_account_type ||
    !club.bank_account_number
  ) {
    redirect("/app");
  }

  const periodLabel = `${MONTH_NAMES[invoice.period_month - 1]} ${invoice.period_year}`;
  const accountTypeLabel =
    BANK_ACCOUNT_TYPES.find((t) => t.value === club.bank_account_type)?.label ?? club.bank_account_type;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Transferencia directa</h1>
        <p className="text-text-secondary">
          Factura {periodLabel} · {formatCLP(invoice.total)}
        </p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
        <CopyableField label="Titular" value={club.bank_holder_name} />
        <CopyableField label="RUT" value={club.bank_holder_rut} />
        <CopyableField label="Banco" value={club.bank_name} />
        <CopyableField label="Tipo de cuenta" value={accountTypeLabel} />
        <CopyableField label="Número de cuenta" value={club.bank_account_number} />
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 text-sm text-text">
        <p className="font-medium mb-1">Instrucciones</p>
        <p>
          Transfiere el monto exacto de <strong>{formatCLP(invoice.total)}</strong>
          {club.bank_notification_email
            ? <> y envía el comprobante a <strong>{club.bank_notification_email}</strong></>
            : null}.
        </p>
        <p className="mt-2 text-text-secondary">
          El club confirmará tu pago en 24-48 horas hábiles.
        </p>
      </div>

      <Link
        href="/app"
        className="inline-block px-5 py-2.5 border border-gray-200 text-sm text-text rounded-lg hover:bg-gray-50"
      >
        Volver
      </Link>
    </div>
  );
}
