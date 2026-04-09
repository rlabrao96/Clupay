import { ReturnClient } from "./retorno-client";

interface PageProps {
  searchParams: Promise<{ token?: string; paymentId?: string }>;
}

export default async function RetornoPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Pago</h1>
        <p className="text-text-secondary">Verificando el resultado del pago</p>
      </div>
      <ReturnClient
        token={params.token ?? null}
        paymentId={params.paymentId ?? null}
      />
    </div>
  );
}
