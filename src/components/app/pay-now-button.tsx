"use client";

import { useState, useTransition } from "react";
import { createFlowPayment } from "@/lib/actions/create-flow-payment";

interface Props {
  invoiceId: string;
}

export function PayNowButton({ invoiceId }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await createFlowPayment(invoiceId);
      if (!result.success || !result.url) {
        setError(result.error ?? "Error al iniciar el pago");
        return;
      }
      window.location.href = result.url;
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Procesando…" : "Pagar Ahora"}
      </button>
      {error && (
        <p className="text-sm text-danger text-center">{error}</p>
      )}
    </div>
  );
}
