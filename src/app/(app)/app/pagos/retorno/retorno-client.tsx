"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Phase = "checking" | "success" | "failed" | "timeout";

interface Props {
  token: string | null;
  paymentId: string | null;
}

export function ReturnClient({ token, paymentId }: Props) {
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const startedAt = Date.now();
    const TIMEOUT_MS = 30_000;
    const POLL_MS = 2_000;

    async function pollOnce() {
      if (cancelled) return;

      // Build query: prefer token (real Flow flow), fall back to paymentId (mock flow)
      let query = supabase.from("payments").select("status");
      if (token) {
        query = query.eq("flow_transaction_id", token);
      } else if (paymentId) {
        query = query.eq("id", paymentId);
      } else {
        setPhase("failed");
        return;
      }
      const { data } = await query.maybeSingle();

      if (cancelled) return;

      if (data?.status === "completed") {
        setPhase("success");
        return;
      }
      if (data?.status === "failed") {
        setPhase("failed");
        return;
      }

      if (Date.now() - startedAt >= TIMEOUT_MS) {
        setPhase("timeout");
        return;
      }

      setTimeout(pollOnce, POLL_MS);
    }

    pollOnce();

    return () => {
      cancelled = true;
    };
  }, [token, paymentId]);

  if (phase === "checking") {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
        <p className="text-text-secondary">Procesando tu pago…</p>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
        <div className="inline-block px-3 py-1.5 bg-success-light text-success text-sm font-medium rounded-full mb-2">
          Pago confirmado
        </div>
        <p className="text-text-secondary text-sm mb-4">
          Gracias, tu pago fue recibido.
        </p>
        <Link
          href="/app"
          className="inline-block py-3 px-6 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
        <div className="inline-block px-3 py-1.5 bg-danger-light text-danger text-sm font-medium rounded-full mb-2">
          Pago rechazado
        </div>
        <p className="text-text-secondary text-sm mb-4">
          El pago no se pudo procesar. Puedes intentarlo nuevamente.
        </p>
        <Link
          href="/app"
          className="inline-block py-3 px-6 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  // timeout
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
      <p className="text-text-secondary text-sm mb-4">
        Tu pago está siendo procesado. Te notificaremos por email cuando se
        confirme.
      </p>
      <Link
        href="/app"
        className="inline-block py-3 px-6 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
