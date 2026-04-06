# Invoice Generation Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily cron job that generates monthly invoices per club per parent, applies discounts, and marks overdue invoices — with club admin review/approve workflow.

**Architecture:** Vercel Cron triggers a Next.js API route daily at midnight Chile time. The route uses a Supabase service-role client to bypass RLS. Core invoice logic is in a separate `src/lib/invoice-generation.ts` module for testability. Club admin UI updated with approve buttons and new config fields.

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL + service role client), TypeScript, Vercel Cron, Tailwind CSS 4.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/00021_add_club_invoice_settings.sql` | Add `due_day` and `auto_approve_invoices` to clubs |
| `src/lib/supabase/service.ts` | Supabase service role client (bypasses RLS) |
| `src/lib/invoice-generation.ts` | Core invoice generation logic |
| `src/app/api/cron/generate-invoices/route.ts` | Cron handler: auth, overdue marking, invoice generation |
| `src/components/club/approve-invoice-button.tsx` | "Aprobar" button for single invoice |
| `vercel.json` | Vercel Cron configuration |

### Modified Files
| File | Change |
|------|--------|
| `src/types/index.ts` | Add `due_day` and `auto_approve_invoices` to `Club` interface |
| `src/components/club/club-config-form.tsx` | Add `due_day` and `auto_approve_invoices` fields |
| `src/app/(club)/club/cobros/page.tsx` | Add approve buttons for `generated` invoices + bulk approve |
| `.env.example` | Add `CRON_SECRET` |

---

### Task 1: Database Migration — Club Invoice Settings

**Files:**
- Create: `supabase/migrations/00021_add_club_invoice_settings.sql`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/00021_add_club_invoice_settings.sql`:

```sql
ALTER TABLE clubs ADD COLUMN due_day INTEGER NOT NULL DEFAULT 10
  CHECK (due_day >= 1 AND due_day <= 28);

ALTER TABLE clubs ADD COLUMN auto_approve_invoices BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Update the Club interface in types**

In `src/types/index.ts`, add the two new fields to the `Club` interface. Find the `Club` interface and add after the `platform_fee_percent` field:

```typescript
  due_day: number;
  auto_approve_invoices: boolean;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00021_add_club_invoice_settings.sql src/types/index.ts
git commit -m "feat(db): add due_day and auto_approve_invoices to clubs table"
```

---

### Task 2: Supabase Service Role Client

**Files:**
- Create: `src/lib/supabase/service.ts`

The cron job needs to bypass RLS since it runs as a system operation, not as a user. The existing `server.ts` uses the anon key with cookie-based auth. We need a separate client using the service role key.

- [ ] **Step 1: Create the service role client**

Create `src/lib/supabase/service.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase/service.ts
git commit -m "feat(supabase): create service role client for system operations"
```

---

### Task 3: Core Invoice Generation Logic

**Files:**
- Create: `src/lib/invoice-generation.ts`

This module contains all the business logic for invoice generation, separated from the route handler for testability.

- [ ] **Step 1: Create the invoice generation module**

Create `src/lib/invoice-generation.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

interface GenerationResult {
  overdue_marked: number;
  clubs_processed: number;
  invoices_generated: number;
  invoices_skipped: number;
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
    return { overdue_marked: overdueMarked, clubs_processed: 0, invoices_generated: 0, invoices_skipped: 0 };
  }

  let totalGenerated = 0;
  let totalSkipped = 0;

  for (const club of clubs) {
    const result = await generateClubInvoices(
      supabase,
      club,
      currentMonth,
      currentYear
    );
    totalGenerated += result.generated;
    totalSkipped += result.skipped;
  }

  return {
    overdue_marked: overdueMarked,
    clubs_processed: clubs.length,
    invoices_generated: totalGenerated,
    invoices_skipped: totalSkipped,
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
): Promise<{ generated: number; skipped: number }> {
  // Find distinct parents with active enrollments
  const { data: enrollments, error: enrollError } = await supabase
    .from("enrollments")
    .select("id, kid_id, sport_id, plan_id, kids!inner(id, parent_id), plans!inner(price)")
    .eq("club_id", club.id)
    .eq("status", "active");

  if (enrollError) throw new Error(`Failed to fetch enrollments: ${enrollError.message}`);
  if (!enrollments || enrollments.length === 0) return { generated: 0, skipped: 0 };

  // Group enrollments by parent
  const byParent = new Map<string, EnrollmentRow[]>();
  for (const e of enrollments as unknown as EnrollmentRow[]) {
    const parentId = e.kids.parent_id;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId)!.push(e);
  }

  let generated = 0;
  let skipped = 0;

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

    await generateParentInvoice(
      supabase,
      club,
      parentId,
      parentEnrollments,
      periodMonth,
      periodYear
    );
    generated++;
  }

  return { generated, skipped };
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
): Promise<void> {
  const kidIds = [...new Set(enrollments.map((e) => e.kid_id))];

  // Fetch active discounts for this parent at this club
  const { data: discounts } = await supabase
    .from("discounts")
    .select("*")
    .eq("club_id", club.id)
    .eq("is_active", true)
    .or(`kid_id.in.(${kidIds.join(",")}),parent_id.eq.${parentId}`);

  const discountRows = (discounts ?? []) as DiscountRow[];
  const kidDiscounts = discountRows.filter((d) => d.kid_id !== null);
  const parentDiscounts = discountRows.filter((d) => d.parent_id !== null);

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

  // Apply parent-level discounts to the remaining total
  let parentDiscountTotal = 0;
  const remaining = subtotal - kidDiscountTotal;

  for (const discount of parentDiscounts) {
    if (discount.type === "percentage") {
      parentDiscountTotal += Math.floor((remaining * Number(discount.value)) / 100);
    } else {
      parentDiscountTotal += Math.min(Number(discount.value), remaining);
    }
  }
  parentDiscountTotal = Math.min(parentDiscountTotal, remaining);

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

  // Insert invoice
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/invoice-generation.ts
git commit -m "feat(invoices): create core invoice generation logic"
```

---

### Task 4: Cron Route Handler

**Files:**
- Create: `src/app/api/cron/generate-invoices/route.ts`
- Create: `vercel.json`
- Modify: `.env.example`

- [ ] **Step 1: Create the cron route handler**

Create `src/app/api/cron/generate-invoices/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { generateInvoices } from "@/lib/invoice-generation";

export async function POST(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await generateInvoices(supabase);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create vercel.json**

Create `vercel.json` in the project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/generate-invoices",
      "schedule": "0 4 * * *"
    }
  ]
}
```

- [ ] **Step 3: Add CRON_SECRET to .env.example**

Add to `.env.example`:

```
CRON_SECRET=your_cron_secret
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/generate-invoices/route.ts vercel.json .env.example
git commit -m "feat(cron): add invoice generation cron route with Vercel config"
```

---

### Task 5: Club Config Form — Add Due Day and Auto-Approve

**Files:**
- Modify: `src/components/club/club-config-form.tsx`

- [ ] **Step 1: Update the club config form**

Read the existing file first, then replace the full content of `src/components/club/club-config-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Club } from "@/types";

interface ClubConfigFormProps {
  club: Club;
}

export function ClubConfigForm({ club }: ClubConfigFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(club.name);
  const [contactEmail, setContactEmail] = useState(club.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(club.contact_phone ?? "");
  const [billingDay, setBillingDay] = useState(club.billing_day);
  const [dueDay, setDueDay] = useState(club.due_day);
  const [autoApprove, setAutoApprove] = useState(club.auto_approve_invoices);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    if (!name.trim()) { setError("El nombre es obligatorio"); setSaving(false); return; }

    const { error: updateError } = await supabase.from("clubs").update({
      name: name.trim(),
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      billing_day: billingDay,
      due_day: dueDay,
      auto_approve_invoices: autoApprove,
    }).eq("id", club.id);

    if (updateError) { setError(updateError.message); setSaving(false); return; }

    setSaving(false);
    setSuccess(true);
    router.refresh();
  }

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
  const labelClass = "block text-sm font-medium text-text mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      {error && <div className="bg-danger-light text-danger text-sm px-4 py-3 rounded-lg">{error}</div>}
      {success && <div className="bg-success-light text-success text-sm px-4 py-3 rounded-lg">Configuración guardada exitosamente</div>}
      <div>
        <label htmlFor="clubName" className={labelClass}>Nombre del club *</label>
        <input id="clubName" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label htmlFor="clubEmail" className={labelClass}>Email de contacto</label>
        <input id="clubEmail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="clubPhone" className={labelClass}>Teléfono de contacto</label>
        <input id="clubPhone" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputClass} placeholder="+56 9 1234 5678" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="clubBilling" className={labelClass}>Día de facturación (1-28)</label>
          <input id="clubBilling" type="number" min={1} max={28} value={billingDay} onChange={(e) => setBillingDay(Number(e.target.value))} className={inputClass} />
        </div>
        <div>
          <label htmlFor="clubDueDay" className={labelClass}>Día de vencimiento (1-28)</label>
          <input id="clubDueDay" type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} className={inputClass} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          id="autoApprove"
          type="checkbox"
          checked={autoApprove}
          onChange={(e) => setAutoApprove(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/20"
        />
        <label htmlFor="autoApprove" className="text-sm text-text">
          Aprobar facturas automáticamente
        </label>
      </div>
      <button type="submit" disabled={saving} className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50">
        {saving ? "Guardando..." : "Guardar configuración"}
      </button>
    </form>
  );
}
```

**Changes from original:**
- Added `dueDay` state initialized from `club.due_day`
- Added `autoApprove` state initialized from `club.auto_approve_invoices`
- Added both to the `update` call
- Added `due_day` number input in a 2-column grid alongside `billing_day`
- Added `auto_approve_invoices` checkbox

- [ ] **Step 2: Commit**

```bash
git add src/components/club/club-config-form.tsx
git commit -m "feat(club): add due_day and auto_approve_invoices to config form"
```

---

### Task 6: Approve Invoice Button Component

**Files:**
- Create: `src/components/club/approve-invoice-button.tsx`

- [ ] **Step 1: Create the approve button component**

Create `src/components/club/approve-invoice-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ApproveInvoiceButtonProps {
  invoiceId: string;
}

export function ApproveInvoiceButton({ invoiceId }: ApproveInvoiceButtonProps) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleApprove() {
    setSaving(true);
    await supabase
      .from("invoices")
      .update({ status: "pending" })
      .eq("id", invoiceId);
    router.refresh();
  }

  return (
    <button
      onClick={handleApprove}
      disabled={saving}
      className="text-sm text-primary hover:text-primary/80 font-medium disabled:opacity-50"
    >
      {saving ? "Aprobando..." : "Aprobar"}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/club/approve-invoice-button.tsx
git commit -m "feat(club): create approve invoice button component"
```

---

### Task 7: Update Cobros Page — Approve Buttons + Bulk Approve

**Files:**
- Modify: `src/app/(club)/club/cobros/page.tsx`

- [ ] **Step 1: Update the cobros page**

Read the existing file first, then replace the full content of `src/app/(club)/club/cobros/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { formatCLP } from "@/lib/format";
import { MarkPaidButton } from "@/components/club/mark-paid-button";
import { ApproveInvoiceButton } from "@/components/club/approve-invoice-button";
import { BulkApproveButton } from "./bulk-approve-button";
import type { InvoiceStatus } from "@/types";

const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const statusBadge: Record<InvoiceStatus, string> = {
  generated: "bg-gray-100 text-gray-600",
  pending: "bg-warning-light text-warning",
  paid: "bg-success-light text-success",
  overdue: "bg-danger-light text-danger",
};

const statusLabel: Record<InvoiceStatus, string> = {
  generated: "Generada",
  pending: "Pendiente",
  paid: "Pagada",
  overdue: "Vencida",
};

export default async function CobrosPage() {
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) redirect("/login");

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, profiles:parent_id(name, last_names, email)")
    .eq("club_id", clubId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  const rows = invoices ?? [];

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentInvoices = rows.filter(
    (r) => r.period_month === currentMonth && r.period_year === currentYear
  );
  const collected = currentInvoices.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.total, 0);
  const pending = currentInvoices.filter((r) => r.status !== "paid").reduce((sum, r) => sum + r.total, 0);

  const generatedInvoices = rows.filter((r) => r.status === "generated");
  const hasGenerated = generatedInvoices.length > 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text mb-1">Cobros</h1>
        <p className="text-text-secondary">Gestión de facturas y pagos</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-sm text-text-secondary mb-1">Facturas mes actual</p>
          <p className="text-3xl font-bold text-text">{currentInvoices.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-sm text-text-secondary mb-1">Cobrado</p>
          <p className="text-3xl font-bold text-success">{formatCLP(collected)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-sm text-text-secondary mb-1">Pendiente</p>
          <p className="text-3xl font-bold text-warning">{formatCLP(pending)}</p>
        </div>
      </div>

      {hasGenerated && (
        <div className="mb-4 flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
          <p className="text-sm text-text-secondary">
            {generatedInvoices.length} {generatedInvoices.length === 1 ? "factura pendiente de aprobación" : "facturas pendientes de aprobación"}
          </p>
          <BulkApproveButton invoiceIds={generatedInvoices.map((i) => i.id)} />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Apoderado</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-text-secondary">Período</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Total</th>
              <th className="text-center px-6 py-4 text-sm font-medium text-text-secondary">Estado</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-text-secondary">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-text-secondary">No hay facturas registradas</td></tr>
            ) : (
              rows.map((invoice) => {
                const parent = invoice.profiles as { name: string; last_names: string; email: string } | null;
                const status = invoice.status as InvoiceStatus;
                return (
                  <tr key={invoice.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-text">{parent ? `${parent.name} ${parent.last_names}` : "—"}</p>
                      <p className="text-xs text-text-secondary">{parent?.email ?? ""}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">{monthNames[invoice.period_month - 1]} {invoice.period_year}</td>
                    <td className="px-6 py-4 text-sm font-medium text-text text-right">{formatCLP(invoice.total)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${statusBadge[status]}`}>{statusLabel[status]}</span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-3">
                      {status === "generated" && (
                        <ApproveInvoiceButton invoiceId={invoice.id} />
                      )}
                      {(status === "pending" || status === "overdue") && (
                        <MarkPaidButton invoiceId={invoice.id} amount={invoice.total} />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the bulk approve button component**

Create `src/app/(club)/club/cobros/bulk-approve-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface BulkApproveButtonProps {
  invoiceIds: string[];
}

export function BulkApproveButton({ invoiceIds }: BulkApproveButtonProps) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleBulkApprove() {
    if (!confirm(`¿Aprobar ${invoiceIds.length} facturas?`)) return;
    setSaving(true);
    await supabase
      .from("invoices")
      .update({ status: "pending" })
      .in("id", invoiceIds);
    router.refresh();
  }

  return (
    <button
      onClick={handleBulkApprove}
      disabled={saving}
      className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
    >
      {saving ? "Aprobando..." : "Aprobar todos"}
    </button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(club)/club/cobros/page.tsx" "src/app/(club)/club/cobros/bulk-approve-button.tsx" src/components/club/approve-invoice-button.tsx
git commit -m "feat(club): add approve and bulk approve buttons to cobros page"
```

---

### Task 8: Verify Build

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript type check**

```bash
npx tsc --noEmit
```

Expected: No new errors (pre-existing test type errors are OK).

- [ ] **Step 2: Run Next.js build**

```bash
npm run build
```

Expected: Build succeeds. The new `/api/cron/generate-invoices` route should appear in the output.

- [ ] **Step 3: Commit any fixes**

If any issues found, fix and commit.

---

### Task 9: Update Project Documentation

**Files:**
- Modify: `NEXT-STEPS.md`

- [ ] **Step 1: Update NEXT-STEPS.md**

Remove the "Invoice generation engine" bullet from Phase 1:
```
- **Invoice generation engine** — Supabase Edge Function (cron) that runs monthly per club, generates one invoice per parent aggregating all kid enrollments, and applies active discounts.
```

- [ ] **Step 2: Commit**

```bash
git add NEXT-STEPS.md
git commit -m "docs: update NEXT-STEPS.md — mark invoice generation engine as complete"
```
