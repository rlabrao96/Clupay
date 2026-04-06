import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCLP, formatPercent } from "@/lib/format";

const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

async function getBillingData() {
  const supabase = await createServerSupabaseClient();

  const { data: records } = await supabase
    .from("platform_billing")
    .select("*, clubs:club_id(name)")
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  return records ?? [];
}

export default async function FacturacionPage() {
  const records = await getBillingData();

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentRecords = records.filter(
    (r) => r.period_month === currentMonth && r.period_year === currentYear
  );

  const totalRevenue = currentRecords.reduce(
    (sum, r) => sum + r.platform_revenue,
    0
  );
  const totalCollected = currentRecords.reduce(
    (sum, r) => sum + r.total_collected,
    0
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text mb-1">Facturación</h1>
        <p className="text-text-secondary">Ingresos de la plataforma por club y período</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-sm text-text-secondary mb-1">Clubes facturados (mes actual)</p>
          <p className="text-3xl font-bold text-text">{currentRecords.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-sm text-text-secondary mb-1">Total recaudado (mes actual)</p>
          <p className="text-3xl font-bold text-primary">{formatCLP(totalCollected)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-sm text-text-secondary mb-1">Ingresos plataforma (mes actual)</p>
          <p className="text-3xl font-bold text-success">{formatCLP(totalRevenue)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Club</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Período</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Total recaudado</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Tarifa fija</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Comisión</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Monto comisión</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Ingreso plataforma</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-text-secondary">
                  No hay registros de facturación
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={record.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-text">
                    {(record.clubs as { name: string } | null)?.name ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
                    {monthNames[record.period_month - 1]} {record.period_year}
                  </td>
                  <td className="px-6 py-4 text-sm text-text text-right">{formatCLP(record.total_collected)}</td>
                  <td className="px-6 py-4 text-sm text-text text-right">{formatCLP(record.fixed_fee)}</td>
                  <td className="px-6 py-4 text-sm text-text text-right">{formatPercent(record.commission_percent)}</td>
                  <td className="px-6 py-4 text-sm text-text text-right">{formatCLP(record.commission_amount)}</td>
                  <td className="px-6 py-4 text-sm font-medium text-success text-right">{formatCLP(record.platform_revenue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
