"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFlowPayment } from "@/lib/actions/create-flow-payment";
import {
  getEnabledPaymentMethods,
  type FlowMethodKey,
} from "@/lib/club-payments";
import type { Club } from "@/types";

interface Props {
  invoiceId: string;
  club: Club;
}

export function PayNowButton({ invoiceId, club }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const methods = getEnabledPaymentMethods(club);

  function onClick() {
    setError(null);

    if (methods.length === 0) {
      setError("El club no tiene métodos de pago habilitados");
      return;
    }

    if (methods.length >= 2) {
      router.push(`/app/pagos/metodo/${invoiceId}`);
      return;
    }

    const only = methods[0];
    if (only.key === "direct_transfer") {
      router.push(`/app/pagos/transferencia/${invoiceId}`);
      return;
    }

    const flowKey = only.key as FlowMethodKey;
    startTransition(async () => {
      const result = await createFlowPayment(invoiceId, flowKey);
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
      {error && <p className="text-sm text-danger text-center">{error}</p>}
    </div>
  );
}
