"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCLP } from "@/lib/format";
import { MarkPaidButton } from "@/components/club/mark-paid-button";
import { ApproveInvoiceButton } from "@/components/club/approve-invoice-button";
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

interface InvoiceRow {
  id: string;
  period_month: number;
  period_year: number;
  total: number;
  discount_total: number;
  status: InvoiceStatus;
  parentName: string;
  parentEmail: string;
}

interface InvoiceItem {
  id: string;
  kidName: string;
  sportName: string;
  planName: string;
  amount: number;
  discount_amount: number;
}

export function InvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<Map<string, InvoiceItem[]>>(new Map());
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function toggleExpand(invoiceId: string) {
    if (expandedId === invoiceId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(invoiceId);

    if (!items.has(invoiceId)) {
      setLoadingId(invoiceId);
      const supabase = createClient();
      const { data } = await supabase
        .from("invoice_items")
        .select("id, amount, discount_amount, kids:kid_id(name, last_names), sports:sport_id(name), plans:plan_id(name)")
        .eq("invoice_id", invoiceId);

      const parsed = (data ?? []).map((item: any) => ({
        id: item.id,
        kidName: `${item.kids?.name ?? ""} ${item.kids?.last_names ?? ""}`.trim(),
        sportName: item.sports?.name ?? "—",
        planName: item.plans?.name ?? "—",
        amount: item.amount,
        discount_amount: item.discount_amount,
      }));

      setItems((prev) => new Map(prev).set(invoiceId, parsed));
      setLoadingId(null);
    }
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 px-6 py-12 text-center text-text-secondary">
        No hay facturas registradas
      </div>
    );
  }

  return (
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
          {invoices.map((invoice) => {
            const isExpanded = expandedId === invoice.id;
            const invoiceItems = items.get(invoice.id);
            const isLoading = loadingId === invoice.id;

            return (
              <InvoiceRowGroup
                key={invoice.id}
                invoice={invoice}
                isExpanded={isExpanded}
                isLoading={isLoading}
                items={invoiceItems}
                onToggle={() => toggleExpand(invoice.id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InvoiceRowGroup({
  invoice,
  isExpanded,
  isLoading,
  items,
  onToggle,
}: {
  invoice: InvoiceRow;
  isExpanded: boolean;
  isLoading: boolean;
  items?: InvoiceItem[];
  onToggle: () => void;
}) {
  return (
    <>
      <tr onClick={onToggle} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer ${isExpanded ? "bg-gray-50/50" : ""}`}>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2 group">
            <svg
              className={`w-3.5 h-3.5 text-text-secondary transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <div>
              <p className="text-sm font-medium text-primary group-hover:text-primary-dark">{invoice.parentName}</p>
              <p className="text-xs text-text-secondary">{invoice.parentEmail}</p>
            </div>
          </div>
        </td>
        <td className="px-6 py-4 text-sm text-text-secondary">{monthNames[invoice.period_month - 1]} {invoice.period_year}</td>
        <td className="px-6 py-4 text-sm font-medium text-text text-right">{formatCLP(invoice.total)}</td>
        <td className="px-6 py-4 text-center">
          <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${statusBadge[invoice.status]}`}>{statusLabel[invoice.status]}</span>
        </td>
        <td className="px-6 py-4 text-right space-x-3" onClick={(e) => e.stopPropagation()}>
          {invoice.status === "generated" && (
            <ApproveInvoiceButton invoiceId={invoice.id} />
          )}
          {(invoice.status === "pending" || invoice.status === "overdue") && (
            <MarkPaidButton invoiceId={invoice.id} amount={invoice.total} />
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={5} className="bg-gray-50/80 px-6 py-0">
            {isLoading ? (
              <div className="py-4 text-center text-sm text-text-secondary">Cargando detalle...</div>
            ) : items && items.length > 0 ? (
              (() => {
                const subtotal = items.reduce((s, i) => s + i.amount, 0);
                const totalDiscount = items.reduce((s, i) => s + i.discount_amount, 0);
                const total = subtotal - totalDiscount;
                return (
                  <table className="w-full my-3">
                    <thead>
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-text-secondary">Deportista</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-text-secondary">Deporte</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-text-secondary">Plan</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-text-secondary">Monto</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-text-secondary">Descuento</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-text-secondary">Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-t border-gray-200/50">
                          <td className="px-4 py-2 text-xs text-text">{item.kidName}</td>
                          <td className="px-4 py-2 text-xs text-text-secondary">{item.sportName}</td>
                          <td className="px-4 py-2 text-xs text-text-secondary">{item.planName}</td>
                          <td className="px-4 py-2 text-xs text-text text-right">{formatCLP(item.amount)}</td>
                          <td className="px-4 py-2 text-xs text-text-secondary text-right">{item.discount_amount > 0 ? `-${formatCLP(item.discount_amount)}` : "—"}</td>
                          <td className="px-4 py-2 text-xs text-text text-right">{formatCLP(item.amount - item.discount_amount)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-gray-300">
                        <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-text text-right">Total</td>
                        <td className="px-4 py-2 text-xs font-semibold text-text text-right">{formatCLP(subtotal)}</td>
                        <td className="px-4 py-2 text-xs font-semibold text-text-secondary text-right">{totalDiscount > 0 ? `-${formatCLP(totalDiscount)}` : "—"}</td>
                        <td className="px-4 py-2 text-xs font-bold text-text text-right">{formatCLP(total)}</td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()
            ) : (
              <div className="py-4 text-center text-sm text-text-secondary">Sin detalle</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
