import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCLP, formatDate } from "@/lib/format";
import { PayNowButton } from "@/components/app/pay-now-button";

const statusBadge: Record<string, { class: string; label: string }> = {
  overdue: { class: "bg-danger-light text-danger", label: "Atrasado" },
  pending: { class: "bg-warning-light text-warning", label: "Pendiente" },
  generated: { class: "bg-gray-100 text-gray-600", label: "Generada" },
  paid: { class: "bg-success-light text-success", label: "Al día" },
};

export default async function AppHomePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch profile, unpaid invoices, kids count, and kid IDs for enrollment count
  const [profileRes, invoicesRes, kidsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single(),
    supabase
      .from("invoices")
      .select("*, clubs:club_id(name)")
      .eq("parent_id", user.id)
      .in("status", ["overdue", "pending", "generated"])
      .order("due_date"),
    supabase
      .from("kids")
      .select("id")
      .eq("parent_id", user.id),
  ]);

  const parentName = profileRes.data?.name ?? "";
  const unpaidInvoices = invoicesRes.data ?? [];
  const kidList = kidsRes.data ?? [];
  const totalKids = kidList.length;

  // Count active enrollments for this parent's kids
  let activeEnrollments = 0;
  if (kidList.length > 0) {
    const { count } = await supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .in("kid_id", kidList.map((k) => k.id))
      .eq("status", "active");
    activeEnrollments = count ?? 0;
  }

  // Sort: overdue first, then by due date
  const sorted = unpaidInvoices.sort((a, b) => {
    if (a.status === "overdue" && b.status !== "overdue") return -1;
    if (b.status === "overdue" && a.status !== "overdue") return 1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  const nextInvoice = sorted[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Hola{parentName ? `, ${parentName}` : ""}</h1>
        <p className="text-text-secondary">Resumen de tus pagos</p>
      </div>

      {nextInvoice ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-secondary">Próximo pago</p>
            <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${statusBadge[nextInvoice.status]?.class ?? "bg-gray-100 text-gray-600"}`}>
              {statusBadge[nextInvoice.status]?.label ?? nextInvoice.status}
            </span>
          </div>
          <p className="text-sm font-medium text-text mb-1">
            {(nextInvoice.clubs as { name: string } | null)?.name ?? "Club"}
          </p>
          <p className="text-3xl font-bold text-text mb-1">{formatCLP(nextInvoice.total)}</p>
          <p className="text-sm text-text-secondary mb-4">Vence: {formatDate(nextInvoice.due_date)}</p>
          <PayNowButton invoiceId={nextInvoice.id} />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
          <div className="inline-block px-3 py-1.5 bg-success-light text-success text-sm font-medium rounded-full mb-2">Al día</div>
          <p className="text-text-secondary text-sm">No tienes pagos pendientes</p>
        </div>
      )}

      {unpaidInvoices.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-sm text-text-secondary mb-2">Tienes {unpaidInvoices.length} facturas pendientes en total</p>
          {sorted.slice(1, 4).map((inv) => (
            <div key={inv.id} className="flex items-center justify-between py-2 border-t border-gray-50">
              <div>
                <p className="text-sm text-text">{(inv.clubs as { name: string } | null)?.name ?? "Club"}</p>
                <p className="text-xs text-text-secondary">Vence: {formatDate(inv.due_date)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-text">{formatCLP(inv.total)}</p>
                <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge[inv.status]?.class ?? ""}`}>
                  {statusBadge[inv.status]?.label ?? inv.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-primary">{totalKids}</p>
          <p className="text-xs text-text-secondary">{totalKids === 1 ? "Hijo" : "Hijos"}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-primary">{activeEnrollments}</p>
          <p className="text-xs text-text-secondary">{activeEnrollments === 1 ? "Inscripción activa" : "Inscripciones activas"}</p>
        </div>
      </div>
    </div>
  );
}
