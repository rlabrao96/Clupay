"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFlowPayment } from "@/lib/actions/create-flow-payment";
import {
  type EnabledMethod,
  type FlowMethodKey,
} from "@/lib/club-payments";

interface Props {
  invoiceId: string;
  methods: EnabledMethod[];
}

export function MethodList({ invoiceId, methods }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSelect(method: EnabledMethod) {
    setError(null);
    if (method.key === "direct_transfer") {
      router.push(`/app/pagos/transferencia/${invoiceId}`);
      return;
    }
    const flowKey = method.key as FlowMethodKey;
    startTransition(async () => {
      const result = await createFlowPayment(invoiceId, flowKey);
      if (!result.success || !result.url) {
        setError(result.error ?? "No pudimos iniciar el pago");
        return;
      }
      window.location.href = result.url;
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-danger bg-danger-light rounded-lg px-4 py-3">
          {error}
        </p>
      )}
      {methods.map((method) => (
        <button
          key={method.key}
          type="button"
          onClick={() => handleSelect(method)}
          disabled={pending}
          className="w-full bg-white border border-gray-100 rounded-2xl p-5 text-left flex items-center gap-4 hover:border-primary transition-colors disabled:opacity-60"
        >
          <div className="flex-1">
            <p className="text-sm font-semibold text-text">{method.label}</p>
            <p className="text-xs text-text-secondary mt-0.5">{method.description}</p>
          </div>
          <span className="text-text-secondary">›</span>
        </button>
      ))}
    </div>
  );
}
