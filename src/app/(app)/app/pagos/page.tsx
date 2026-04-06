import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCLP, formatDate } from "@/lib/format";
import type { InvoiceStatus } from "@/types";

const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const statusConfig: Record<InvoiceStatus, { class: string; label: string }> = {
  overdue: { class: "bg-danger-light text-danger", label: "Atrasado" },
  pending: { class: "bg-warning-light text-warning", label: "Pendiente" },
  generated: { class: "bg-gray-100 text-gray-600", label: "Generada" },
  paid: { class: "bg-success-light text-success", label: "Pagada" },
};

export default async function PagosPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, clubs:club_id(name)")
    .eq("parent_id", user.id)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  const rows = invoices ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-text">Pagos</h1>
        <p className="text-text-secondary text-sm">Historial de facturas</p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
          <p className="text-text-secondary text-sm">No tienes facturas aún</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((invoice) => {
            const status = invoice.status as InvoiceStatus;
            const config = statusConfig[status];
            return (
              <div key={invoice.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-text">
                      {(invoice.clubs as { name: string } | null)?.name ?? "Club"}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {monthNames[invoice.period_month - 1]} {invoice.period_year}
                    </p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Vence: {formatDate(invoice.due_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-text">{formatCLP(invoice.total)}</p>
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full mt-1 ${config.class}`}>
                      {config.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
