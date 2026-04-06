"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ApproveInvoiceButtonProps {
  invoiceId: string;
}

export function ApproveInvoiceButton({ invoiceId }: ApproveInvoiceButtonProps) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleApprove() {
    setSaving(true);
    await supabase
      .from("invoices")
      .update({ status: "pending" })
      .eq("id", invoiceId);
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
