"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markInvoicePaid } from "@/lib/actions/mark-invoice-paid";

interface MarkPaidButtonProps {
  invoiceId: string;
  amount: number;
}

export function MarkPaidButton({ invoiceId, amount }: MarkPaidButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleMarkPaid() {
    if (!confirm("¿Marcar esta factura como pagada por transferencia bancaria?")) return;
    setSaving(true);
    const result = await markInvoicePaid(invoiceId, amount);
    if (!result.success) {
      alert(result.error ?? "Error al marcar como pagado");
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return (
    <button onClick={handleMarkPaid} disabled={saving} className="text-sm text-success hover:text-success/80 font-medium disabled:opacity-50">
      {saving ? "Marcando..." : "Marcar pagado"}
    </button>
  );
}
