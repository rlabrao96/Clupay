import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { formatCLP } from "@/lib/format";
import { InvoiceTable } from "@/components/club/invoice-table";
import { BulkApproveButton } from "./bulk-approve-button";
import type { InvoiceStatus } from "@/types";

export default async function CobrosPage() {
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) redirect("/login");

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, profiles:parent_id(name, last_names, email)")
    .eq("club_id", clubId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  const rows = (invoices ?? []).map((inv: any) => ({
    id: inv.id,
    period_month: inv.period_month,
    period_year: inv.period_year,
    total: inv.total,
    discount_total: inv.discount_total,
    status: inv.status as InvoiceStatus,
    parentName: inv.profiles ? `${inv.profiles.name} ${inv.profiles.last_names}` : "—",
    parentEmail: inv.profiles?.email ?? "",
  }));

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentInvoices = rows.filter(
    (r) => r.period_month === currentMonth && r.period_year === currentYear
  );
  const collected = currentInvoices.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.total, 0);
  const pending = currentInvoices.filter((r) => r.status !== "paid").reduce((sum, r) => sum + r.total, 0);

  const generatedInvoices = rows.filter((r) => r.status === "generated");
  const hasGenerated = generatedInvoices.length > 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text mb-1">Cobros</h1>
        <p className="text-text-secondary">Gestión de facturas y pagos</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-sm text-text-secondary mb-1">Facturas mes actual</p>
          <p className="text-3xl font-bold text-text">{currentInvoices.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-sm text-text-secondary mb-1">Cobrado</p>
          <p className="text-3xl font-bold text-success">{formatCLP(collected)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-sm text-text-secondary mb-1">Pendiente</p>
          <p className="text-3xl font-bold text-warning">{formatCLP(pending)}</p>
        </div>
      </div>

      {hasGenerated && (
        <div className="mb-4 flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
          <p className="text-sm text-text-secondary">
            {generatedInvoices.length} {generatedInvoices.length === 1 ? "factura pendiente de aprobación" : "facturas pendientes de aprobación"}
          </p>
          <BulkApproveButton invoiceIds={generatedInvoices.map((i) => i.id)} />
        </div>
      )}

      <InvoiceTable invoices={rows} />
    </div>
  );
}
