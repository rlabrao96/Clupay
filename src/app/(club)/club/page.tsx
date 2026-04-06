import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { formatCLP } from "@/lib/format";

export default async function ClubDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) redirect("/login");

  const [enrollmentsResult, invoicesThisMonth, invoicesPaid, invoicesOverdue] =
    await Promise.all([
      supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId)
        .eq("status", "active"),
      supabase
        .from("invoices")
        .select("id, status")
        .eq("club_id", clubId)
        .eq("period_month", new Date().getMonth() + 1)
        .eq("period_year", new Date().getFullYear()),
      supabase
        .from("invoices")
        .select("total")
        .eq("club_id", clubId)
        .eq("status", "paid"),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId)
        .eq("status", "overdue"),
    ]);

  const monthlyInvoices = invoicesThisMonth.data ?? [];
  const paidThisMonth = monthlyInvoices.filter((i) => i.status === "paid").length;
  const totalThisMonth = monthlyInvoices.length;
  const pctAlDia = totalThisMonth > 0 ? Math.round((paidThisMonth / totalThisMonth) * 100) : 100;
  const totalRevenue = (invoicesPaid.data ?? []).reduce((sum, inv) => sum + inv.total, 0);

  const cards = [
    {
      label: "Deportistas activos",
      value: (enrollmentsResult.count ?? 0).toString(),
      color: "bg-primary-light text-primary",
    },
    {
      label: "Al día",
      value: `${pctAlDia}%`,
      color: pctAlDia >= 80 ? "bg-success-light text-success" : "bg-warning-light text-warning",
    },
    {
      label: "Facturas vencidas",
      value: (invoicesOverdue.count ?? 0).toString(),
      color: (invoicesOverdue.count ?? 0) > 0 ? "bg-danger-light text-danger" : "bg-success-light text-success",
    },
    {
      label: "Recaudación total",
      value: formatCLP(totalRevenue),
      color: "bg-success-light text-success",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Dashboard</h1>
      <p className="text-text-secondary mb-8">Resumen de tu club</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl p-6 border border-gray-100">
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
