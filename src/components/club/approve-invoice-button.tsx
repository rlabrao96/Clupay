"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveInvoice } from "@/lib/actions/approve-invoice";

interface ApproveInvoiceButtonProps {
  invoiceId: string;
}

export function ApproveInvoiceButton({ invoiceId }: ApproveInvoiceButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleApprove() {
    setSaving(true);
    const result = await approveInvoice(invoiceId);
    if (!result.success) {
      alert("Error al aprobar la factura");
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={handleApprove}
      disabled={saving}
      className="text-sm text-primary hover:text-primary/80 font-medium disabled:opacity-50"
    >
      {saving ? "Aprobando..." : "Aprobar"}
    </button>
  );
}
