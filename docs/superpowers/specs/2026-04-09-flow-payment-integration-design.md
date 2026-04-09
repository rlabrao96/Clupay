# Flow.cl Payment Integration — Design Spec

_Date: 2026-04-09_
_Status: Approved, ready for implementation plan_

## Summary

Enable parents to pay pending invoices online via Flow.cl. Parent clicks "Pagar Ahora" on the parent portal dashboard, gets redirected to Flow's hosted checkout, pays with whatever method Flow offers on our merchant account, and returns to a confirmation page. A server-to-server webhook from Flow is the authoritative source for marking the invoice as paid and sending the payment confirmation email.

This is the first iteration of Flow integration and intentionally covers only the one-time payment happy path. Recurring subscriptions, refunds, bank transfer tracking, platform billing automation, and club settlement are explicitly out of scope.

## Business context

- CluPay is the merchant of record on Flow.cl. A single Flow account owned by CluPay processes all payments; settlement to individual clubs happens manually/externally and is out of scope for this spec.
- Production-only. No sandbox environment will be used — the Flow merchant account was created directly as production. Local development uses a mock mode (see below) to avoid real charges during iteration.
- Flow's checkout decides which payment methods to offer (Webpay, Servipag, etc.); we do not restrict methods from code. Method selection happens in the Flow dashboard.

## In scope

- Parent clicks "Pagar Ahora" on a single unpaid invoice → creates a Flow payment → redirects to Flow checkout.
- Flow webhook confirms payment → marks invoice paid → sends existing payment-confirmation email.
- Browser return page for UX feedback after payment.
- `payments` row created on initiation, updated by webhook.
- Invoices must be paid in full (no partial payments).
- Production Flow API only; local mock mode via `FLOW_MOCK` env flag.

## Out of scope (future specs)

- Recurring subscriptions / auto-charge.
- Refunds and chargebacks (handled manually via Flow dashboard for now).
- Bank transfer manual tracking.
- Platform billing automation (already pending in NEXT-STEPS).
- Settlement from CluPay to clubs.
- Paying multiple invoices in one checkout.

## Architecture

```
Parent portal (browser)
        │
        │ 1. Click "Pagar Ahora"
        ▼
┌───────────────────────────────┐
│ Server Action:                │
│ createFlowPayment(invoiceId)  │
└───────────────────────────────┘
        │
        │ 2. Insert payments row (status: pending)
        │ 3. Call Flow payment/create
        │ 4. Receive { url, token, flowOrder }
        │ 5. Store flow_transaction_id on payments row
        │ 6. Return redirect URL to client
        ▼
Browser redirected to Flow checkout
        │
        │ 7. Parent pays on Flow's page
        │
        ├─── 8a. Browser redirects to /app/pagos/retorno?token=...
        │         (UX only — shows "verificando...")
        │
        └─── 8b. Flow POSTs to /api/webhooks/flow/confirm
                 with token (server-to-server, authoritative)
                 │
                 ▼
        ┌───────────────────────────────┐
        │ Webhook handler:              │
        │ - Verify by calling           │
        │   payment/getStatus           │
        │ - Idempotency check on        │
        │   flow_transaction_id         │
        │ - Mark payments.status=paid   │
        │ - Call mark_invoice_paid RPC  │
        │ - Send confirmation email     │
        └───────────────────────────────┘
```

**Source of truth is the webhook.** The return URL only polls our own database for status to give the parent immediate visual feedback; it never trusts query params from Flow.

## Environment configuration

Four new environment variables:

| Variable | Required | Value | Notes |
|---|---|---|---|
| `FLOW_API_BASE` | Yes | `https://www.flow.cl/api` | Production endpoint. |
| `FLOW_API_KEY` | Yes | Public API key from Flow dashboard | Sent in request body. |
| `FLOW_SECRET_KEY` | Yes | Secret key from Flow dashboard | Used for HMAC-SHA256 signing, never sent over the wire. |
| `FLOW_MOCK` | No | `true` in local `.env.local` only | Short-circuits network calls and auto-confirms payments through the normal confirmation path. |

**Safety guard:** The Flow client throws if `FLOW_MOCK=true` AND `VERCEL_ENV === "production"`. A misconfigured prod deploy cannot silently mock payments.

Preview deploys on Vercel will hit real Flow by default. If desired, `FLOW_MOCK=true` can be set as a Preview-only env var in Vercel so PR previews do not charge real money.

## Components

### New files

| File | Purpose |
|---|---|
| `src/lib/flow/client.ts` | Flow API client — `createPayment()`, `getPaymentStatus()`. Handles HMAC-SHA256 signing, mock-mode short-circuit, prod-safety guard. |
| `src/lib/flow/signature.ts` | HMAC-SHA256 signing helper. Flow requires params sorted alphabetically, concatenated, then signed with the secret key. Isolated so it is unit-testable. |
| `src/lib/actions/create-flow-payment.ts` | Server action. Input: `invoiceId`. Validates parent owns invoice and invoice is payable, inserts `payments` row, calls Flow, updates row with `flow_transaction_id`, returns `{ url }`. |
| `src/lib/flow/confirm-payment.ts` | Shared confirmation logic used by both the webhook and the mock return route. Idempotent on `flow_transaction_id`. Marks payment paid, calls `mark_invoice_paid` RPC, sends confirmation email. |
| `src/app/api/webhooks/flow/confirm/route.ts` | `POST` handler. Reads `token` from form body, calls `getPaymentStatus(token)`, delegates to `confirm-payment.ts`. Returns `200` after processing (including already-confirmed) so Flow stops retrying. |
| `src/app/(app)/app/pagos/retorno/page.tsx` | Browser return page. Reads `token` query param, polls our `payments` table (not Flow directly) for status, shows "Procesando…" → "Pago confirmado" / "Pago rechazado". |
| `src/app/(app)/app/pagos/retorno/mock/route.ts` | Mock-mode only. Triggered by the mock `createPayment` URL. Calls `confirmPayment` directly, then redirects to the normal return page. Guarded so it only runs when `FLOW_MOCK=true`. |
| `src/components/app/pay-now-button.tsx` | Client component. Handles loading state and browser redirect after calling the server action. Extracted because the dashboard page is a server component. |
| `__tests__/lib/flow/signature.test.ts` | Unit tests for signing (known-answer vectors, alphabetical param ordering, deterministic output). |
| `__tests__/lib/flow/confirm-payment.test.ts` | Idempotency tests (happy path, double-call, already-paid, amount mismatch, rejected, email failure). |
| `__tests__/lib/flow/client.test.ts` | Mock-mode short-circuit, prod-safety guard, request body shape, response parsing. |
| `__tests__/app/api/webhooks/flow/confirm.test.ts` | Webhook handler: valid token, unknown token, Flow error, missing token. |

### Modified files

| File | Change |
|---|---|
| `src/app/(app)/app/page.tsx` (line ~81) | Replace placeholder `<button>` with `<PayNowButton invoiceId={nextInvoice.id} />`. |
| `.env.example` | Add `FLOW_API_BASE`, `FLOW_API_KEY`, `FLOW_SECRET_KEY`, `FLOW_MOCK`. |
| `README.md` | Add Flow vars to the env var table. |
| `ARCHITECTURE.md` | Note Flow integration in external integrations section. |
| `NEXT-STEPS.md` | Move one-time Flow payment out of "Pending", leave recurring/bank/platform billing items. |

### No schema changes needed

The `payments` table already has `invoice_id`, `method`, `amount`, `flow_transaction_id`, `status`, and `paid_at`. The `payment_method` enum already includes `card_link`, which is what we will store for Flow one-time payments.

## Data flow — the three critical paths

### Path A: Parent initiates payment (happy path)

1. Parent clicks **Pagar Ahora** on `/app`.
2. Client component calls `createFlowPayment(invoiceId)` server action.
3. Action validates:
   - User is authenticated and `invoice.parent_id === user.id`.
   - Invoice status is `pending` or `overdue` (not `paid`, `generated`, or `cancelled`).
   - No existing `payments` row with `status='pending'` AND `flow_transaction_id IS NOT NULL` less than 30 minutes old for this invoice (prevents spamming Flow with duplicate checkouts).
4. Insert `payments` row: `{ invoice_id, amount: invoice.total, method: 'card_link', status: 'pending' }` → returns `paymentId`.
5. Call `flowClient.createPayment({ commerceOrder: paymentId, amount, email: parent.email, subject: "CluPay - <club> - <month>", urlConfirmation, urlReturn })`.
6. Update `payments` row: `flow_transaction_id = response.token`.
7. Return `{ url: response.url + "?token=" + response.token }` to the client.
8. Client does `window.location.href = url`.

If step 5 fails: mark the `payments` row as `failed`, return an error message to the client, show toast.

### Path B: Webhook confirms payment (authoritative)

1. Flow POSTs `token=xxx` to `/api/webhooks/flow/confirm` (form-encoded).
2. Handler calls `flowClient.getPaymentStatus(token)` → gets `{ status, commerceOrder, amount, payer, ... }`.
3. Load `payments` row by `flow_transaction_id = token`.
4. **Idempotency check:** if `payments.status === 'paid'`, return `200` immediately.
5. **Amount check:** if `response.amount !== payments.amount`, log a critical error and return `200` without marking paid. Flag for manual review.
6. Branch on Flow status code:
   - `2` (paid) → delegate to `confirmPayment(paymentId)`:
     - Update `payments`: `status='paid', paid_at=now()`.
     - Call `mark_invoice_paid` RPC (existing logic; sets invoice status and creates related rows).
     - Send payment confirmation email (reuse `sendPaymentConfirmation` from existing `mark-invoice-paid.ts`).
   - `3` (rejected) or `4` (cancelled) → mark `payments.status='failed'`, leave invoice alone.
   - `1` (pending) → do nothing; Flow will webhook again when settled.
7. Return `200 OK` always (including already-processed) so Flow stops retrying.

### Path C: Browser return (UX only)

1. Flow redirects browser to `/app/pagos/retorno?token=xxx`.
2. Page reads token, queries our `payments` table (not Flow) for the matching row.
3. Poll every 2 seconds for up to 30 seconds:
   - `status='paid'` → show success, link back to `/app`.
   - `status='failed'` → show failure, link to retry.
   - Still `pending` → keep polling.
4. After 30-second timeout → show "Tu pago está siendo procesado. Te notificaremos por email cuando se confirme." (The webhook will eventually land.)

### Mock mode variant

In mock mode, `createPayment()` returns `url = /app/pagos/retorno/mock?paymentId=xxx` without calling Flow. That route calls `confirmPayment(paymentId)` directly and redirects to the normal return page, which then sees `status='paid'` immediately and shows the success state. The webhook is never exercised in mock mode — its behavior is covered by unit tests instead.

## Error handling and edge cases

| Failure | Handling |
|---|---|
| Flow API unreachable or error on `createPayment` | Mark the `payments` row as `failed`, return `{ error: "No pudimos iniciar el pago. Intenta nuevamente." }` to client, log error. |
| Parent closes tab mid-checkout | `payments` row stays `pending`. Flow may eventually webhook with a result or nothing happens. Next click creates a new payment (protected by the 30-min dedupe). |
| Webhook arrives before browser return | Return page queries DB, finds `paid`, shows success immediately. |
| Webhook arrives after browser return 30s timeout | Parent sees "procesando" message. Webhook runs, email is sent, next dashboard load reflects paid state. |
| Webhook fires twice (Flow retry) | Idempotency check on `flow_transaction_id` + `payments.status='paid'` short-circuits. Returns 200, no double email. |
| Webhook fires for invoice already paid manually | `mark_invoice_paid` RPC no-ops on already-paid invoices. Payment row still updates to `paid` to reflect Flow's record. Confirmation email is sent (accurate). |
| `getPaymentStatus` returns amount ≠ our `payments.amount` | Log critical, do not mark paid, return 200. Requires manual review. Should never happen unless tampering. |
| Webhook signature spoofing | We do not trust the inbound POST body. We only read `token` and call `getPaymentStatus(token)` back to Flow over HTTPS with our API key. Authenticity comes from that round-trip. Unknown tokens return 200 with no side effects. |
| `confirmPayment` succeeds but email send fails | Email wrapped in try/catch; does not roll back payment. Notification row logged with `status='failed'` per existing pattern. |
| `mark_invoice_paid` RPC fails after payment row updated | Log critical. Return 500 so Flow retries webhook; idempotency guards subsequent attempts. Not wrapped in a transaction — matches existing `mark-invoice-paid.ts` pattern. Atomicity is a separate, cross-cutting concern tracked in NEXT-STEPS. |
| User double-clicks "Pagar Ahora" | Button enters loading state immediately. Server action also has the 30-min dedupe. |
| User tries to pay someone else's invoice | Server action validates `parent_id === user.id`. |

## Testing strategy

### Unit tests (Jest, no network)

**`__tests__/lib/flow/signature.test.ts`**
- Known-answer vectors from Flow's documentation.
- Params sorted alphabetically before signing.
- Signing is deterministic.

**`__tests__/lib/flow/confirm-payment.test.ts`** (mocked Supabase client)
- Happy path: pending payment → marks paid, calls RPC, sends email.
- Idempotent: already-paid payment → no DB writes, no email.
- Amount mismatch: Flow amount ≠ payment.amount → logs critical, does not mark paid.
- Rejected status (Flow status 3): marks payment failed, invoice untouched.
- Email send failure: payment still marked paid, notification logged as failed.

**`__tests__/lib/flow/client.test.ts`**
- Mock mode short-circuits network.
- Prod safety guard throws if `FLOW_MOCK=true` AND `VERCEL_ENV === "production"`.
- `createPayment` sends correct body with signature.
- `getPaymentStatus` parses response correctly.

**`__tests__/app/api/webhooks/flow/confirm.test.ts`**
- Valid token → calls `getPaymentStatus`, delegates to `confirmPayment`, returns 200.
- Unknown token → returns 200 without side effects.
- Flow API error during `getPaymentStatus` → returns 500 so Flow retries.
- Missing token in body → returns 400.

### Manual local tests (mock mode)

Run with `npm run dev` and `FLOW_MOCK=true`:
1. Login as `parent@clupay.test`, click Pagar Ahora → redirects through mock return → shows "Pago confirmado".
2. Verify invoice status changed to `paid`.
3. Verify `payments` row has `status='paid'`, `flow_transaction_id` set, `paid_at` populated.
4. Verify notification row created with `status='sent'`.
5. Click Pagar Ahora twice rapidly → only one `payments` row created.
6. Refresh dashboard → button gone, invoice reflects paid state.

### Production smoke test (after deploy, one-time)

1. Create a test invoice at Flow's minimum amount (~$350 CLP).
2. Pay through Flow with a real card.
3. Verify webhook fires, invoice marked paid, email sent.
4. Refund via Flow dashboard manually.

### Not tested

- Flow's own infrastructure.
- End-to-end against real Flow in CI (would require secrets and real charges).
- Load and concurrency (not relevant at current scale).

## Open items deferred to follow-up specs

- Recurring subscriptions (`subscription/create`, parent-side saved cards, auto-charge on `billing_day`).
- Refunds via Flow API (`payment/refund`).
- Bank transfer manual tracking (out-of-band transfer + club admin marks paid with reference number).
- Platform billing automation (populate `platform_billing` when invoices paid).
- Club settlement (moving money from CluPay's Flow balance to each club).
- Atomic confirmation via a single Supabase RPC/transaction, addressed alongside the existing invoice-generation atomicity work in Phase 3.
