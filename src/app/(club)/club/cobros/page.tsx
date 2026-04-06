import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { formatCLP } from "@/lib/format";
import { MarkPaidButton } from "@/components/club/mark-paid-button";
import { ApproveInvoiceButton } from "@/components/club/approve-invoice-button";
import { BulkApproveButton } from "./bulk-approve-button";
import type { InvoiceStatus } from "@/types";

const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const statusBadge: Record<InvoiceStatus, string> = {
  generated: "bg-gray-100 text-gray-600",
  pending: "bg-warning-light text-warning",
  paid: "bg-success-light text-success",
  overdue: "bg-danger-light text-danger",
};

const statusLabel: Record<InvoiceStatus, string> = {
  generated: "Generada",
  pending: "Pendiente",
  paid: "Pagada",
  overdue: "Vencida",
};

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

  const rows = invoices ?? [];

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

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Apoderado</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Período</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Total</th>
              <th className="text-center px-6 py-4 text-sm font-medium text-text-secondary">Estado</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-text-secondary">No hay facturas registradas</td></tr>
            ) : (
              rows.map((invoice) => {
                const parent = invoice.profiles as { name: string; last_names: string; email: string } | null;
                const status = invoice.status as InvoiceStatus;
                return (
                  <tr key={invoice.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-text">{parent ? `${parent.name} ${parent.last_names}` : "—"}</p>
                      <p className="text-xs text-text-secondary">{parent?.email ?? ""}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">{monthNames[invoice.period_month - 1]} {invoice.period_year}</td>
                    <td className="px-6 py-4 text-sm font-medium text-text text-right">{formatCLP(invoice.total)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${statusBadge[status]}`}>{statusLabel[status]}</span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-3">
                      {status === "generated" && (
                        <ApproveInvoiceButton invoiceId={invoice.id} />
                      )}
                      {(status === "pending" || status === "overdue") && (
                        <MarkPaidButton invoiceId={invoice.id} amount={invoice.total} />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
