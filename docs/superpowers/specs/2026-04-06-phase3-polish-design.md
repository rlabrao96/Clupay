# Phase 3 — Polish & Robustness (Items 1–4)

_2026-04-06_

## Scope

Four high/medium-priority fixes from NEXT-STEPS.md Phase 3. Low-priority polish items (5–9) are deferred.

> **Parallel work:** Phase 1 invoice generation is being developed concurrently. Migration files must use high sequence numbers (00030+) to avoid conflicts.

---

## 1. Plans query security

**Problem:** `src/app/(club)/club/planes/page.tsx` fetches all plans via `supabase.from("plans").select("*, sports:sport_id(name, club_id)")` with no club filter, then filters client-side. This exposes other clubs' plan data to the network response.

**Fix:** Add `.eq("sports.club_id", clubId)` to the query so filtering happens at the database level. Remove the client-side `.filter()` call. No migration needed — the join on `sports` already exists.

---

## 2. Mark-as-paid atomicity

**Problem:** `src/components/club/mark-paid-button.tsx` inserts a payment row and then updates the invoice status in two independent calls. If the second fails, the database is left inconsistent.

**Fix:** Create a PostgreSQL RPC function `mark_invoice_paid(p_invoice_id UUID, p_amount INT, p_method TEXT)` that:
1. Inserts into `payments` (invoice_id, amount, method, paid_at = now())
2. Updates `invoices` set status = 'paid', paid_at = now()
3. Runs inside a single transaction (implicit for a single function call)
4. Returns the new payment row

The client calls `supabase.rpc("mark_invoice_paid", { ... })` instead of two separate operations.

**Migration:** `00030_create_mark_invoice_paid_rpc.sql`

---

## 3. Non-null assertion guards

**Problem:** `src/components/club/invitation-form.tsx` and `src/components/club/discount-form.tsx` use `user!.id` after `supabase.auth.getUser()` without checking for null. If the session expired, this crashes.

**Fix:** In both files, after `getUser()`, check `if (!user)` → set a user-facing error ("Sesión expirada. Recarga la página."), set saving to false, and return early. Remove the `!` non-null assertion.

---

## 4. Error handling on delete operations

**Problem:** Four components perform delete/deactivate operations without checking for errors:
- `src/app/(club)/club/planes/page.tsx` — `handleDelete`
- `src/app/(club)/club/deportes/page.tsx` — `handleDelete`
- `src/components/admin/club-admin-manager.tsx` — `handleRemove`
- `src/app/(club)/club/descuentos/page.tsx` — `handleDeactivate`

**Fix:** In each case, destructure `{ error }` from the Supabase call. If error exists, show `alert(error.message)` and return without calling `loadData()`. Only refresh data on success.
