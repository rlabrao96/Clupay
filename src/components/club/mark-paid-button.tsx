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
    await supabase.from("payments").insert({
      invoice_id: invoiceId,
      method: "bank_transfer",
      amount,
      status: "completed",
      paid_at: new Date().toISOString(),
    });
    await supabase.from("invoices").update({ status: "paid" }).eq("id", invoiceId);
    router.refresh();
  }

  return (
    <button onClick={handleMarkPaid} disabled={saving} className="text-sm text-success hover:text-success/80 font-medium disabled:opacity-50">
      {saving ? "Marcando..." : "Marcar pagado"}
    </button>
  );
}
