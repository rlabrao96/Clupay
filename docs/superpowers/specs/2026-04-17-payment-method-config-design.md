# Payment Method Configuration per Club — Design Spec

**Date:** 2026-04-17
**Status:** Approved design, pending implementation plan
**Scope:** Let each club admin choose which payment methods are offered to parents, and enable a "direct bank transfer" flow (outside Flow.cl, with manual reconciliation).

## Motivation

Today, when a parent clicks "Pagar Ahora", CluPay calls Flow's `payment/create` without specifying a payment method, so Flow shows every method the merchant (CluPay) has activated in its account. Club admins have no control over which methods their parents see.

Different clubs have different preferences — some want to avoid transfers (slower settlement, fixed cost), some want to offer a direct bank transfer to their own account (outside Flow) with manual reconciliation. This spec introduces per-club configuration.

Recurring payments (cargo automático / subscriptions) are out of scope for this iteration; they are tracked as a separate initiative.

## Flow.cl reference

Flow's `payment/create` accepts an optional `paymentMethod` integer param. If absent or `9`, Flow shows all merchant-active methods. If a specific ID is passed, the parent is sent directly to that method.

IDs currently active in CluPay's Flow account:

- `1` — Webpay (credit / debit card)
- `22` — Khipu (transferencia bancaria)
- `17` — etpay (transferencia bancaria)
- `15` — MachBank (billetera)
- `5`  — Billeteras digitales / Onepay (billetera)
- `164` — banca.me (cuotas sin tarjeta)

**Constraint:** Flow only accepts one ID (or "all"), never a list. So the per-club filter happens on our side: we pick one ID based on the parent's choice, then pass it to Flow.

## Concepts

### Payment method categories

Five user-facing categories map to five DB toggles and (for the four Flow categories) one Flow ID each:

| Key               | DB column           | Flow ID (default) | Label                      |
|-------------------|---------------------|-------------------|----------------------------|
| `card`            | `pm_card`           | 1 (Webpay)        | Tarjeta de crédito / débito |
| `flow_transfer`   | `pm_flow_transfer`  | 22 (Khipu)        | Transferencia bancaria Flow |
| `wallet`          | `pm_wallet`         | 15 (MachBank)     | Billetera digital           |
| `installments`    | `pm_installments`   | 164 (banca.me)    | Cuotas sin tarjeta          |
| `direct_transfer` | `pm_direct_transfer`| —                 | Transferencia directa al club |

The Flow ID per key lives in code (`src/lib/club-payments.ts`), not in the DB. If we ever swap Khipu for etpay, it's a constant change, not a migration.

### Webpay cuotas

Webpay cuotas sin interés (IDs 130 / 131 / 132) are currently inactive in the Flow account and are not modeled here. The `card` toggle uses Webpay ID 1, which supports cuotas con interés (customer pays the interest, club receives full amount upfront). If we later activate cuotas sin interés at the Flow account level, we'll add a sub-toggle inside the `card` category.

## Data model

New migration `supabase/migrations/00032_add_club_payment_config.sql`:

```sql
ALTER TABLE clubs
  ADD COLUMN pm_card                 BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pm_flow_transfer        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pm_wallet               BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pm_installments         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pm_direct_transfer      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN bank_holder_name        TEXT,
  ADD COLUMN bank_holder_rut         TEXT,
  ADD COLUMN bank_name               TEXT,
  ADD COLUMN bank_account_type       TEXT,
  ADD COLUMN bank_account_number     TEXT,
  ADD COLUMN bank_notification_email TEXT;

ALTER TABLE clubs
  ADD CONSTRAINT clubs_has_at_least_one_payment_method CHECK (
    pm_card OR pm_flow_transfer OR pm_wallet OR pm_installments OR pm_direct_transfer
  ),
  ADD CONSTRAINT clubs_direct_transfer_requires_bank_data CHECK (
    NOT pm_direct_transfer OR (
      bank_holder_name    IS NOT NULL AND
      bank_holder_rut     IS NOT NULL AND
      bank_name           IS NOT NULL AND
      bank_account_type   IN ('corriente', 'vista', 'ahorro') AND
      bank_account_number IS NOT NULL
    )
  );

-- Extend the payment_method enum so payments.method reflects the real channel.
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'flow_transfer';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'flow_wallet';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'flow_installments';
-- Existing values kept: 'card_automatic' (reserved for future cargo automático),
-- 'card_link' (used for Flow Webpay), 'bank_transfer' (used for direct transfer).
```

**Enum mapping from `PaymentMethodKey` to `payments.method`:**

| Key               | Stored as            |
|-------------------|----------------------|
| `card`            | `card_link`          |
| `flow_transfer`   | `flow_transfer`      |
| `wallet`          | `flow_wallet`        |
| `installments`    | `flow_installments`  |
| `direct_transfer` | `bank_transfer`      |

`card_automatic` stays reserved for the future cargo automático flow.

**Defaults preserve current behavior**: all four Flow categories are enabled by default, so existing clubs keep showing every active Flow method to parents after the migration. `pm_direct_transfer` defaults to `false` because no club has bank data yet.

**RUT** validation (Chilean modulo 11) is enforced in the form and the server action, not in the DB. The DB only checks NOT NULL on the column.

**`bank_notification_email`** is nullable; if empty, the parent-facing direct-transfer page omits the "send proof to ..." line.

## Architecture

```
Club admin                      Parent                         Flow
─────────                       ──────                         ────
/club/configuracion             /app (dashboard)
  ↓ toggles + bank data           ↓ Pagar Ahora (PayNowButton)
  ↓                               ↓
clubs (DB) <── getEnabledPaymentMethods(club) ──
                                  ↓
                                  decide route:
                                    · 1 method enabled, Flow → createFlowPayment
                                    · 1 method enabled, direct → /app/pagos/transferencia/:id
                                    · 2+ methods → /app/pagos/metodo/:id (selector)
                                  ↓
                                  createFlowPayment(invoiceId, methodKey)
                                  ↓
                                  Flow hosted checkout ──────────→ existing webhook
```

### New pieces

- `src/lib/club-payments.ts` — helper with `PaymentMethodKey`, `PAYMENT_METHOD_FLOW_ID`, `getEnabledPaymentMethods(club)`.
- `src/lib/banks.ts` — constant array of Chilean banks for the dropdown.
- `src/app/(app)/app/pagos/metodo/[invoiceId]/page.tsx` — method selector page.
- `src/app/(app)/app/pagos/transferencia/[invoiceId]/page.tsx` — direct transfer display page.
- `src/components/club/payment-methods-section.tsx` — new section inside `ClubConfigForm`.
- `src/lib/actions/update-club-payment-config.ts` — server action for the new section.
- One DB migration.

### Extended pieces

- `src/lib/flow/client.ts` — `FlowCreatePaymentInput.paymentMethod?: number`. Real client forwards it as a string in the signed body; mock client ignores it.
- `src/lib/actions/create-flow-payment.ts` — new required arg `methodKey`; validates the method is still enabled on the club before calling Flow; maps key → Flow ID; stores the mapped enum value (per the Data Model mapping table) in `payments.method`, replacing the hardcoded `"card_link"`.
- `src/components/app/pay-now-button.tsx` — routing logic based on number and kind of enabled methods.
- `src/components/club/club-config-form.tsx` — mount the new section.

### Unchanged

Flow webhook, signature helper, invoice generation engine, `MarkPaidButton`, email templates, `confirm-payment.ts`. The only behavioral change for Flow-paid invoices is that `payments.method` now reflects the actual channel (`card_link`, `flow_transfer`, `flow_wallet`, `flow_installments`) instead of the previous placeholder where everything was stored as `card_link`.

## Server-side contracts

### `getEnabledPaymentMethods(club: Club): EnabledMethod[]`

Returns enabled methods in a fixed order: `card`, `flow_transfer`, `wallet`, `installments`, `direct_transfer`. Each entry has `{ key, label, description }`. Callable from both server and client components (pure function, no IO).

### `createFlowPayment(invoiceId: string, methodKey: FlowMethodKey)`

`FlowMethodKey = Exclude<PaymentMethodKey, "direct_transfer">`. Behavior additions on top of today's action:

1. Load the club (via `invoice.club_id`) and verify the requested `methodKey` is still enabled. If not, return `{ success: false, error: "Método no disponible" }`.
2. Translate `methodKey` → Flow ID via `PAYMENT_METHOD_FLOW_ID[methodKey]`.
3. Pass `paymentMethod: <id>` to `flow.createPayment`.
4. Insert the `payments` row with `method` mapped from the `methodKey` (see the enum mapping table in the Data Model section). The previous hardcoded `"card_link"` is replaced.

All existing guards (ownership, invoice status, 30-min dedupe, email lookup, post-create token update) are preserved.

### `updateClubPaymentConfig(formData)`

New server action. Validates:

1. At least one toggle is `true`.
2. If `pm_direct_transfer`, all required bank fields are present and `bank_account_type ∈ {corriente, vista, ahorro}`.
3. RUT passes `validateRut` when `bank_holder_rut` is provided.
4. Email, when provided, matches a simple shape.

On success, updates `clubs` and revalidates `/club/configuracion`. DB CHECKs act as a second line of defense.

## UI — Club admin

A new section "Medios de pago" is added to `ClubConfigForm` below the existing config. Five toggles with tooltips `(?)` on the non-obvious categories (`flow_transfer`, `wallet`, `installments`). When `pm_direct_transfer` is on, a sub-panel "Datos bancarios" expands with:

- Titular (text)
- RUT (using existing `RutInput` — auto-formats with dots + validates modulo 11)
- Banco (dropdown from `src/lib/banks.ts`)
- Tipo de cuenta (dropdown: corriente / vista / ahorro)
- Número de cuenta (text)
- Email de notificación (optional)

Client-side validation mirrors the server action; the form disables submit if any rule fails.

Visual polish is delegated to `frontend-design` at implementation time.

## UI — Parent

### Pay Now routing

```
methods = getEnabledPaymentMethods(club)

if methods.length === 1:
  if methods[0].key === "direct_transfer":
    router.push(`/app/pagos/transferencia/${invoiceId}`)
  else:
    createFlowPayment(invoiceId, methods[0].key) → window.location = url

if methods.length >= 2:
  router.push(`/app/pagos/metodo/${invoiceId}`)
```

### Method selector page

Renders a stacked list, one card per enabled method, with icon, label, description, and a trailing chevron. Tapping a Flow card triggers `createFlowPayment(invoiceId, key)` and redirects on success. Tapping the direct-transfer card navigates to the bank details page.

### Direct-transfer page

Shows each bank field with a copy-to-clipboard button, a "transfer the exact amount" instruction, the notification email (if set), and a 24-48h confirmation note. No "Ya transferí" button. No `payments` row is created. The admin uses the existing `MarkPaidButton` when the bank transfer arrives, which creates the payment with `method = "bank_transfer"` and marks the invoice paid.

Flow-paid invoices remain fully automatic via the existing webhook.

## Error handling

- Parent picks a method that was just disabled by the admin → server action returns a friendly error; the parent is sent back to the selector.
- Direct-transfer page loads for a club with incomplete bank data → impossible by the DB CHECK, but defensive guard redirects to the selector with an error toast.
- Admin tries to save with zero methods or incomplete bank data → form error inline; server action returns a structured error; DB CHECK is the last fence.
- Flow API call failure → unchanged (existing action marks `payments` row failed).

## Testing plan

### Unit (Jest)

- `__tests__/lib/club-payments.test.ts`
  - `getEnabledPaymentMethods` filters correctly for each combination.
  - Order is stable: card → flow_transfer → wallet → installments → direct_transfer.
  - All-false input (defensive) returns `[]`.
- `__tests__/lib/flow/client.test.ts` (extend)
  - `createPayment` with `paymentMethod` includes it in the signed body and signature.
  - `createPayment` without `paymentMethod` omits the field entirely.
- `__tests__/lib/actions/create-flow-payment.test.ts` (new)
  - Mocks Supabase + Flow client.
  - `methodKey = "card"` sends `paymentMethod: 1` to Flow.
  - Disabled `methodKey` returns `"Método no disponible"` and inserts no row.
  - `payments.method` is persisted with the correct enum value per the mapping table.
- `__tests__/lib/actions/update-club-payment-config.test.ts` (new)
  - Rejects when all toggles are false.
  - Rejects when `pm_direct_transfer = true` and bank fields are missing / RUT invalid.
  - Happy path persists toggles + bank data.

### Manual (documented, not automated)

Run with `FLOW_MOCK=true`:

1. Club with only `card` enabled → PayNow goes straight to Flow mock for Webpay.
2. Club with `card` + `direct_transfer` → selector shows 2 cards; each routes correctly.
3. Admin unchecks all methods → form blocks save with a clear message.
4. Admin toggles direct transfer on without bank data → form blocks save.
5. Parent uses direct transfer page → sees club's bank data, no `payments` row is created.
6. Admin clicks `MarkPaidButton` → invoice paid, email sent (existing behavior).

### Unchanged tests

Webhook, signature, confirm-payment, RUT, email templates, invoice generation.

## Open questions intentionally deferred

- **Cargo automático (recurring charges).** Separate initiative. Requires Flow authorization and `customer/register` + `customer/charge`.
- **Webpay cuotas sin interés** sub-toggle. Add when the merchant activates IDs 130 / 131 / 132 in Flow.
- **Multiple bank accounts per club.** One account per club is enough for now.
- **"Ya transferí" tracking / proof upload.** Explicitly rejected in favor of the simple UX; revisit if admins request it.

## Transition

Next step: invoke `writing-plans` to turn this spec into a sequenced implementation plan.
