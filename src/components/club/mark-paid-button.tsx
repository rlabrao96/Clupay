"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface MarkPaidButtonProps {
  invoiceId: string;
  amount: number;
}

export function MarkPaidButton({ invoiceId, amount }: MarkPaidButtonProps) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleMarkPaid() {
    if (!confirm("¿Marcar esta factura como pagada por transferencia bancaria?")) return;
    setSaving(true);
    const { error } = await supabase.rpc("mark_invoice_paid", {
      p_invoice_id: invoiceId,
      p_amount: amount,
      p_method: "bank_transfer",
    });
    if (error) {
      alert(error.message);
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
