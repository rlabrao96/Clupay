"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface BulkApproveButtonProps {
  invoiceIds: string[];
}

export function BulkApproveButton({ invoiceIds }: BulkApproveButtonProps) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleBulkApprove() {
    if (!confirm(`¿Aprobar ${invoiceIds.length} facturas?`)) return;
    setSaving(true);
    await supabase
      .from("invoices")
      .update({ status: "pending" })
      .in("id", invoiceIds);
    router.refresh();
  }

  return (
    <button
      onClick={handleBulkApprove}
      disabled={saving}
      className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
    >
      {saving ? "Aprobando..." : "Aprobar todos"}
    </button>
  );
}
