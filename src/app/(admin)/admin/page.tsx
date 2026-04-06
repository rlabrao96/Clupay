import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/format";

async function getKPIs() {
  const supabase = await createServerSupabaseClient();

  const [clubsResult, enrollmentsResult, invoicesPaidResult, invoicesOverdueResult] =
    await Promise.all([
      supabase.from("clubs").select("id", { count: "exact", head: true }),
      supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("invoices")
        .select("total")
        .eq("status", "paid"),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue"),
    ]);

  const totalRevenue = (invoicesPaidResult.data ?? []).reduce(
    (sum, inv) => sum + inv.total,
    0
  );

  return {
    totalClubs: clubsResult.count ?? 0,
    totalAthletes: enrollmentsResult.count ?? 0,
    totalRevenue,
    overdueInvoices: invoicesOverdueResult.count ?? 0,
  };
}

export default async function AdminDashboardPage() {
  const kpis = await getKPIs();

  const cards = [
    {
      label: "Clubes",
      value: kpis.totalClubs.toString(),
      color: "bg-primary-light text-primary",
    },
    {
      label: "Deportistas activos",
      value: kpis.totalAthletes.toString(),
      color: "bg-primary-light text-primary",
    },
    {
      label: "Recaudación total",
      value: formatCLP(kpis.totalRevenue),
      color: "bg-success-light text-success",
    },
    {
      label: "Facturas vencidas",
      value: kpis.overdueInvoices.toString(),
      color: kpis.overdueInvoices > 0
        ? "bg-danger-light text-danger"
        : "bg-success-light text-success",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Dashboard</h1>
      <p className="text-text-secondary mb-8">Resumen de la plataforma</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-2xl p-6 border border-gray-100"
          >
            <p className="text-sm text-text-secondary mb-1">{card.label}</p>
            <p className={`text-3xl font-bold ${card.color} inline-block px-2 py-1 rounded-lg`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
