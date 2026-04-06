# Invoice Generation Engine — Design Spec

_2026-04-06_

## Overview

A daily cron job (Vercel Cron → Next.js API route) that generates monthly invoices for each club on their configured billing day. Aggregates all active enrollments per parent, applies discounts, and creates invoice + invoice_items records. Invoices start as `generated` (for club admin review) or `pending` (if auto-approve is enabled). A second pass marks overdue invoices.

## Goals

- Automate monthly invoice creation per club per parent
- Apply kid-level and parent-level discounts with proper duration tracking
- Support club admin review before invoices become visible to parents
- Mark overdue invoices automatically
- Idempotent — safe to re-run without creating duplicates

## Non-Goals

- Email notifications (separate spec — Phase 1 email integration)
- PDF generation (Phase 2)
- Payment processing via Flow.cl (Phase 2)
- Platform billing automation (Phase 2 — depends on payment data)

## Database Changes

### New columns on `clubs` table

```sql
ALTER TABLE clubs ADD COLUMN due_day INTEGER NOT NULL DEFAULT 10
  CHECK (due_day >= 1 AND due_day <= 28);

ALTER TABLE clubs ADD COLUMN auto_approve_invoices BOOLEAN NOT NULL DEFAULT false;
```

- `due_day`: day of month when invoices are due (1-28). Default: 10.
- `auto_approve_invoices`: if true, invoices are created with status `pending` (visible to parents immediately). If false (default), created as `generated` (club admin must approve).

## API Route

### `POST /api/cron/generate-invoices`

**Location:** `src/app/api/cron/generate-invoices/route.ts`

**Authentication:** Vercel Cron sends an `Authorization: Bearer <CRON_SECRET>` header. The route validates this against the `CRON_SECRET` environment variable. Rejects unauthorized requests with 401.

**Uses:** Supabase service role client (bypasses RLS — this is a system operation, not a user request).

### Execution Flow

**Step 1: Mark overdue invoices**

```sql
UPDATE invoices
SET status = 'overdue', updated_at = now()
WHERE status = 'pending'
  AND due_date < CURRENT_DATE
```

Any `pending` invoice past its `due_date` transitions to `overdue`.

**Step 2: Find clubs to bill today**

```sql
SELECT * FROM clubs WHERE billing_day = extract(day from CURRENT_DATE)
```

**Step 3: For each club, generate invoices**

For each club where `billing_day` matches today:

1. **Find all parents with active enrollments:**
   ```sql
   SELECT DISTINCT k.parent_id
   FROM enrollments e
   JOIN kids k ON k.id = e.kid_id
   WHERE e.club_id = :club_id AND e.status = 'active'
   ```

2. **For each parent:**

   a. **Check idempotency:** Skip if invoice already exists for `(parent_id, club_id, period_month, period_year)`.

   b. **Fetch active enrollments with plan prices:**
   ```sql
   SELECT e.*, k.id as kid_id, k.name as kid_name, p.price, p.name as plan_name, s.id as sport_id
   FROM enrollments e
   JOIN kids k ON k.id = e.kid_id
   JOIN plans p ON p.id = e.plan_id
   JOIN sports s ON s.id = e.sport_id
   WHERE e.club_id = :club_id AND e.status = 'active' AND k.parent_id = :parent_id
   ```

   c. **Fetch active discounts for this parent at this club:**
   ```sql
   SELECT * FROM discounts
   WHERE club_id = :club_id AND is_active = true
     AND (kid_id IN (:kid_ids) OR parent_id = :parent_id)
   ```

   d. **Build invoice items and apply discounts:**

   For each enrollment:
   - Base amount = `plan.price`
   - Apply kid-level discounts (discounts where `kid_id` matches this enrollment's kid):
     - `percentage`: `discount_amount = floor(amount * value / 100)`
     - `fixed_amount`: `discount_amount = min(value, amount)`
   - Create invoice_item: `{ kid_id, sport_id, plan_id, amount: plan.price, discount_amount }`

   After all items, apply parent-level discounts (discounts where `parent_id` matches):
   - Calculate remaining subtotal after kid discounts: `subtotal - sum(kid_discount_amounts)`
   - Apply parent discount to the remaining total:
     - `percentage`: `parent_discount = floor(remaining * value / 100)`
     - `fixed_amount`: `parent_discount = min(value, remaining)`
   **Parent discount handling:** Parent-level discounts are applied as a lump sum on the invoice level only — stored in `invoices.discount_total` alongside the kid-level discounts. Individual `invoice_items.discount_amount` only reflects kid-level discounts. This keeps the logic simple.

   e. **Calculate totals:**
   ```
   subtotal = sum(item.amount for all items)
   kid_discount_total = sum(item.discount_amount for all items)
   parent_discount_total = calculated above (from parent-level discounts)
   discount_total = kid_discount_total + parent_discount_total
   total = max(subtotal - discount_total, 0)
   ```

   f. **Determine due date:**
   - If `due_day >= billing_day`: due date = `due_day` of current month
   - If `due_day < billing_day`: due date = `due_day` of next month

   g. **Determine initial status:**
   - If `club.auto_approve_invoices` is true: `'pending'`
   - Otherwise: `'generated'`

   h. **Insert invoice + invoice_items** in a single transaction (service role client).

   i. **Update discount counters:**
   - `one_time`: set `is_active = false`
   - `n_months`: `remaining_months -= 1`. If `remaining_months = 0`, set `is_active = false`
   - `until_removed`: no change

**Step 4: Return summary**

```json
{
  "overdue_marked": 5,
  "clubs_processed": 3,
  "invoices_generated": 12,
  "invoices_skipped": 2
}
```

## Vercel Cron Configuration

Add `vercel.json` to project root:

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

Runs daily at 04:00 UTC (midnight Chile time, UTC-4).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CRON_SECRET` | Yes | Secret token for authenticating cron requests. Vercel sets this automatically for Vercel Cron jobs. |

## Club Admin UI Changes

### Cobros Page (`/club/cobros`)

**New: "Aprobar" button** for invoices with status `generated`:
- Single invoice: "Aprobar" button in the actions column (next to existing "Marcar pagado")
- Bulk: "Aprobar todos" button above the table when there are `generated` invoices
- On approve: updates invoice status from `generated` to `pending`

**Updated status badge:** The existing status badges already include `generated` (gray). No visual changes needed.

### Club Config Page (`/club/configuracion`)

**New fields in the config form:**
- `due_day`: number input (1-28), label "Día de vencimiento", default 10
- `auto_approve_invoices`: toggle/checkbox, label "Aprobar facturas automáticamente", default off

## Edge Cases

| Case | Behavior |
|------|----------|
| Club has no active enrollments | Skip — no invoices generated |
| Parent has no active enrollments at club | Skip — no invoice for this parent |
| Invoice already exists for period | Skip (idempotent) — unique index prevents duplicates |
| Discount value exceeds item amount | Cap at item amount (no negative items) |
| Total after discounts is negative | Floor at 0 |
| Discount is `one_time` and already used | `is_active = false` from previous run — won't be fetched |
| Club billing_day = 29/30/31 | Not possible — constrained to 1-28 |
| Cron runs twice in same day | Idempotent — second run skips all already-generated invoices |
| No clubs with today's billing_day | Returns `{ clubs_processed: 0 }` |
| Enrollment created mid-month after billing | Included in next month's invoice |

## Files

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/00021_add_club_invoice_settings.sql` | Add `due_day` and `auto_approve_invoices` to clubs |
| `src/app/api/cron/generate-invoices/route.ts` | Cron handler: overdue marking + invoice generation |
| `src/lib/invoice-generation.ts` | Core invoice generation logic (testable, separated from route handler) |
| `vercel.json` | Vercel Cron configuration |

### Modified Files
| File | Change |
|------|--------|
| `src/app/(club)/club/cobros/page.tsx` | Add "Aprobar" and "Aprobar todos" buttons for `generated` invoices |
| `src/components/club/club-config-form.tsx` | Add `due_day` and `auto_approve_invoices` fields |
| `src/types/index.ts` | Update `Club` interface with new fields |
