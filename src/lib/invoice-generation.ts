import type { SupabaseClient } from "@supabase/supabase-js";

interface GenerationResult {
  overdue_marked: number;
  clubs_processed: number;
  invoices_generated: number;
  invoices_skipped: number;
  auto_approved_invoice_ids: string[];
}

interface EnrollmentRow {
  id: string;
  kid_id: string;
  sport_id: string;
  plan_id: string;
  kids: { id: string; parent_id: string };
  plans: { price: number };
}

interface DiscountRow {
  id: string;
  kid_id: string | null;
  parent_id: string | null;
  type: "percentage" | "fixed_amount";
  value: number;
  duration: "one_time" | "n_months" | "until_removed";
  remaining_months: number | null;
}

export async function markOverdueInvoices(
  supabase: SupabaseClient
): Promise<number> {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "overdue" })
    .eq("status", "pending")
    .lt("due_date", today)
    .select("id");

  if (error) throw new Error(`Failed to mark overdue: ${error.message}`);
  return data?.length ?? 0;
}

export async function generateInvoices(
  supabase: SupabaseClient
): Promise<GenerationResult> {
  const overdueMarked = await markOverdueInvoices(supabase);

  const today = new Date();
  const dayOfMonth = today.getDate();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  // Find clubs to bill today
  const { data: clubs, error: clubsError } = await supabase
    .from("clubs")
    .select("id, billing_day, due_day, auto_approve_invoices, platform_fee_fixed, platform_fee_percent")
    .eq("billing_day", dayOfMonth);

  if (clubsError) throw new Error(`Failed to fetch clubs: ${clubsError.message}`);
  if (!clubs || clubs.length === 0) {
    return { overdue_marked: overdueMarked, clubs_processed: 0, invoices_generated: 0, invoices_skipped: 0, auto_approved_invoice_ids: [] };
  }

  let totalGenerated = 0;
  let totalSkipped = 0;
  const allAutoApprovedIds: string[] = [];

  for (const club of clubs) {
    const result = await generateClubInvoices(
      supabase,
      club,
      currentMonth,
      currentYear
    );
    totalGenerated += result.generated;
    totalSkipped += result.skipped;
    allAutoApprovedIds.push(...result.autoApprovedIds);
  }

  return {
    overdue_marked: overdueMarked,
    clubs_processed: clubs.length,
    invoices_generated: totalGenerated,
    invoices_skipped: totalSkipped,
    auto_approved_invoice_ids: allAutoApprovedIds,
  };
}

async function generateClubInvoices(
  supabase: SupabaseClient,
  club: {
    id: string;
    billing_day: number;
    due_day: number;
    auto_approve_invoices: boolean;
  },
  periodMonth: number,
  periodYear: number
): Promise<{ generated: number; skipped: number; autoApprovedIds: string[] }> {
  // Find distinct parents with active enrollments
  const { data: enrollments, error: enrollError } = await supabase
    .from("enrollments")
    .select("id, kid_id, sport_id, plan_id, kids!inner(id, parent_id), plans!inner(price)")
    .eq("club_id", club.id)
    .eq("status", "active");

  if (enrollError) throw new Error(`Failed to fetch enrollments: ${enrollError.message}`);
  if (!enrollments || enrollments.length === 0) return { generated: 0, skipped: 0, autoApprovedIds: [] };

  // Group enrollments by parent
  const byParent = new Map<string, EnrollmentRow[]>();
  for (const e of enrollments as unknown as EnrollmentRow[]) {
    const parentId = e.kids.parent_id;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId)!.push(e);
  }

  let generated = 0;
  let skipped = 0;
  const autoApprovedIds: string[] = [];

  for (const [parentId, parentEnrollments] of byParent) {
    // Check idempotency
    const { data: existing } = await supabase
      .from("invoices")
      .select("id")
      .eq("parent_id", parentId)
      .eq("club_id", club.id)
      .eq("period_month", periodMonth)
      .eq("period_year", periodYear)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const invoiceId = await generateParentInvoice(
      supabase,
      club,
      parentId,
      parentEnrollments,
      periodMonth,
      periodYear
    );
    generated++;
    if (club.auto_approve_invoices) {
      autoApprovedIds.push(invoiceId);
    }
  }

  return { generated, skipped, autoApprovedIds };
}

async function generateParentInvoice(
  supabase: SupabaseClient,
  club: {
    id: string;
    billing_day: number;
    due_day: number;
    auto_approve_invoices: boolean;
  },
  parentId: string,
  enrollments: EnrollmentRow[],
  periodMonth: number,
  periodYear: number
): Promise<string> {
  const kidIds = [...new Set(enrollments.map((e) => e.kid_id))];

  // Fetch active discounts for this parent at this club
  const { data: discounts } = await supabase
    .from("discounts")
    .select("*")
    .eq("club_id", club.id)
    .eq("is_active", true)
    .or(`kid_id.in.(${kidIds.join(",")}),parent_id.eq.${parentId}`);

  const discountRows = (discounts ?? []) as DiscountRow[];
  // Mutually exclusive: kid discounts have kid_id only, parent discounts have parent_id only
  const kidDiscounts = discountRows.filter((d) => d.kid_id !== null && d.parent_id === null);
  const parentDiscounts = discountRows.filter((d) => d.parent_id !== null && d.kid_id === null);

  // Build invoice items with kid-level discounts
  const items: Array<{
    kid_id: string;
    sport_id: string;
    plan_id: string;
    amount: number;
    discount_amount: number;
  }> = [];

  for (const enrollment of enrollments) {
    const amount = enrollment.plans.price;
    let discountAmount = 0;

    // Apply kid-level discounts
    const applicableDiscounts = kidDiscounts.filter(
      (d) => d.kid_id === enrollment.kid_id
    );
    for (const discount of applicableDiscounts) {
      if (discount.type === "percentage") {
        discountAmount += Math.floor((amount * Number(discount.value)) / 100);
      } else {
        discountAmount += Math.min(Number(discount.value), amount);
      }
    }

    // Cap discount at item amount
    discountAmount = Math.min(discountAmount, amount);

    items.push({
      kid_id: enrollment.kid_id,
      sport_id: enrollment.sport_id,
      plan_id: enrollment.plan_id,
      amount,
      discount_amount: discountAmount,
    });
  }

  // Calculate subtotal and kid discount total
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const kidDiscountTotal = items.reduce((sum, item) => sum + item.discount_amount, 0);

  // Apply parent-level discounts sequentially to the remaining total
  let parentDiscountTotal = 0;
  let remaining = subtotal - kidDiscountTotal;

  for (const discount of parentDiscounts) {
    if (remaining <= 0) break;
    let amount = 0;
    if (discount.type === "percentage") {
      amount = Math.floor((remaining * Number(discount.value)) / 100);
    } else {
      amount = Math.min(Number(discount.value), remaining);
    }
    parentDiscountTotal += amount;
    remaining -= amount;
  }

  const discountTotal = kidDiscountTotal + parentDiscountTotal;
  const total = Math.max(subtotal - discountTotal, 0);

  // Determine due date
  const dueDate = calculateDueDate(
    club.billing_day,
    club.due_day,
    periodMonth,
    periodYear
  );

  // Determine initial status
  const status = club.auto_approve_invoices ? "pending" : "generated";

  // Insert invoice + items (not atomic — Supabase JS lacks transaction support.
  // If items insert fails, orphaned invoice is caught by idempotency on re-run.
  // TODO: wrap in RPC for atomicity when needed.)
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      parent_id: parentId,
      club_id: club.id,
      period_month: periodMonth,
      period_year: periodYear,
      subtotal,
      discount_total: discountTotal,
      total,
      due_date: dueDate,
      status,
    })
    .select("id")
    .single();

  if (invoiceError) throw new Error(`Failed to create invoice: ${invoiceError.message}`);

  // Insert invoice items
  const invoiceItems = items.map((item) => ({
    invoice_id: invoice.id,
    kid_id: item.kid_id,
    sport_id: item.sport_id,
    plan_id: item.plan_id,
    amount: item.amount,
    discount_amount: item.discount_amount,
  }));

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(invoiceItems);

  if (itemsError) throw new Error(`Failed to create invoice items: ${itemsError.message}`);

  // Update discount counters
  await updateDiscountCounters(supabase, [...kidDiscounts, ...parentDiscounts]);

  return invoice.id;
}

function calculateDueDate(
  billingDay: number,
  dueDay: number,
  periodMonth: number,
  periodYear: number
): string {
  let dueMonth = periodMonth;
  let dueYear = periodYear;

  if (dueDay < billingDay) {
    // Due date is in the next month
    dueMonth++;
    if (dueMonth > 12) {
      dueMonth = 1;
      dueYear++;
    }
  }

  // Format as YYYY-MM-DD
  const mm = String(dueMonth).padStart(2, "0");
  const dd = String(dueDay).padStart(2, "0");
  return `${dueYear}-${mm}-${dd}`;
}

async function updateDiscountCounters(
  supabase: SupabaseClient,
  discounts: DiscountRow[]
): Promise<void> {
  for (const discount of discounts) {
    if (discount.duration === "one_time") {
      await supabase
        .from("discounts")
        .update({ is_active: false })
        .eq("id", discount.id);
    } else if (discount.duration === "n_months") {
      const newRemaining = (discount.remaining_months ?? 1) - 1;
      await supabase
        .from("discounts")
        .update({
          remaining_months: newRemaining,
          is_active: newRemaining > 0,
        })
        .eq("id", discount.id);
    }
    // until_removed: no change
  }
}
