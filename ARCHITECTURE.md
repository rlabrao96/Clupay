# Architecture

## System Overview

CluPay is a single Next.js 16 application serving three portals via route groups, backed by Supabase for authentication, database, and storage. Email notifications are sent via Nodemailer + Gmail SMTP. Each portal is isolated by role-based access control at the layout level and Supabase Row-Level Security at the database level.

```
┌─────────────────────────────────────────────────┐
│              Next.js App (Vercel)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  /admin   │ │  /club   │ │  /app (PWA)      │ │
│  │  Super    │ │  Club    │ │  Parent Portal   │ │
│  │  Admin    │ │  Admin   │ │  Mobile-first    │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────────────────────────────────────────┐│
│  │  Server Actions (src/lib/actions/)           ││
│  │  approve-invoice, mark-invoice-paid,         ││
│  │  send-invitation, create-flow-payment        ││
│  └──────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────┐│
│  │  Vercel Cron (daily 4 AM UTC)                ││
│  │  Invoice generation + email notifications    ││
│  └──────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────┐│
│  │  Flow Webhook (/api/webhooks/flow/confirm)   ││
│  │  Authoritative payment confirmation          ││
│  └──────────────────────────────────────────────┘│
├─────────────────────────────────────────────────┤
│              Supabase                            │
│  ┌────────┐ ┌─────┐ ┌───────────┐ ┌──────────┐ │
│  │ Auth   │ │ DB  │ │ Edge Fns  │ │ Storage  │ │
│  │ + RLS  │ │ PG  │ │ (future)  │ │ (logos)  │ │
│  └────────┘ └─────┘ └───────────┘ └──────────┘ │
├─────────────────────────────────────────────────┤
│              Email (Nodemailer + Gmail SMTP)      │
│  ┌─────────────────────────────────────────────┐ │
│  │ Invitations, invoices, reminders, overdue,  │ │
│  │ payment confirmations                       │ │
│  └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│              External Services                   │
│  ┌─────────┐                                    │
│  │ Flow.cl │  Card payments (one-time)          │
│  │ Payments│                                    │
│  └─────────┘                                    │
└─────────────────────────────────────────────────┘
```

## Core Components

### Next.js App (`src/app/`)

Three route groups serve the portals:
- `(admin)/admin/*` — Super Admin, desktop layout with sidebar. Protected by `AuthGuard requiredRole="super_admin"`.
- `(club)/club/*` — Club Admin, desktop layout with sidebar. Protected by `AuthGuard requiredRole="club_admin"`.
- `(app)/app/*` — Parent, mobile-first layout with bottom navigation. Protected by `AuthGuard requiredRole="parent"`.
- `(auth)/*` — Shared login, register, and OAuth callback pages.
- `invite/[token]` — Public invitation acceptance page (uses service role client for token lookup).

Entry point: `src/app/layout.tsx` (root layout with Providers).

### Server Actions (`src/lib/actions/`)

Server-side mutations that handle DB operations + email sending:
- `send-invitation.ts` — Insert invitation + send invitation email
- `delete-invitation.ts` — Delete invitation record
- `approve-invoice.ts` — Approve invoice(s) + send invoice-ready email (single and bulk)
- `mark-invoice-paid.ts` — Call `mark_invoice_paid` RPC + send payment confirmation email (admin-initiated path, also used when a direct bank transfer is reconciled manually)
- `create-flow-payment.ts` — Takes `(invoiceId, methodKey)`. Validates parent ownership, verifies the club still has the requested method enabled (race-safe), dedupes recent pending payments, pre-inserts a `payments` row with the channel-specific enum value, calls Flow's `payment/create` with the method-specific `paymentMethod` ID, stores the returned token, and returns the checkout URL with `?token=` appended. Uses the service role client for payments-table writes (parents only have SELECT via RLS)
- `update-club-payment-config.ts` — Club-admin-only server action. Validates the payment method toggles (at least one required) and, if direct transfer is on, the full bank form (RUT validated with modulo 11, account type whitelisted). Nulls out bank fields when the toggle is off so stale data never persists

### Flow Integration (`src/lib/flow/`)

- `signature.ts` — Pure HMAC-SHA256 signing helper. Sorts params alphabetically, concatenates as `k=v&k=v`, HMACs with the merchant secret, returns lowercase hex.
- `client.ts` — Flow HTTP client exposing `createPayment()` (POST `/payment/create` form-urlencoded) and `getPaymentStatus()` (GET `/payment/getStatus` with signed query string — NOT POST; Flow returns code 105 otherwise). Coerces the string `amount` field in status responses to a number. Mock mode returns synthetic tokens + a local return URL when `FLOW_MOCK=true`, and throws at construction if `FLOW_MOCK=true && VERCEL_ENV=production`.
- `confirm-payment.ts` — Shared idempotent confirmation logic. Looks up the payment, short-circuits on `status='completed'`, verifies Flow-reported amount against stored amount, branches on Flow status codes (1 pending, 2 paid, 3 rejected, 4 cancelled), updates `payments` + `invoices` directly (bypasses the `mark_invoice_paid` RPC because that RPC would insert a duplicate payments row), and sends the payment-confirmation email. Email send failures are logged but do not roll back the payment.

### Flow Webhook (`src/app/api/webhooks/flow/confirm/route.ts`)

POST-only route that Flow calls server-to-server after each payment attempt. Reads the `token` from the form body, round-trips to `payment/getStatus` to authenticate (the token is meaningless without our secret key), looks up the payments row by `flow_transaction_id`, and delegates to `confirmPayment`. Always returns 200 for processed outcomes (including already-confirmed, amount mismatch, unknown token) so Flow stops retrying; returns 500 only for transient errors (Flow API down, DB update failed) so Flow retries.

### Parent Payment UI

- `src/components/app/pay-now-button.tsx` — Client component. Reads the club's enabled methods via `getEnabledPaymentMethods(club)`, then branches: 0 methods → inline error; 1 Flow method → calls `createFlowPayment(invoiceId, methodKey)` and redirects; 1 direct-transfer-only → navigates to `/app/pagos/transferencia/[invoiceId]`; 2+ methods → navigates to `/app/pagos/metodo/[invoiceId]`.
- `src/app/(app)/app/pagos/metodo/[invoiceId]/page.tsx` — Server component that resolves the invoice (auth + ownership + payable status guards) and renders one card per enabled method.
- `src/app/(app)/app/pagos/metodo/[invoiceId]/method-list.tsx` — Client component that wires each card: Flow methods call `createFlowPayment`, direct transfer navigates to the bank details page.
- `src/app/(app)/app/pagos/transferencia/[invoiceId]/page.tsx` — Server component that enforces the club has `pm_direct_transfer=true` and complete bank data (defensive, mirrors the DB CHECK), then renders the bank fields and instructions.
- `src/app/(app)/app/pagos/transferencia/[invoiceId]/copyable-field.tsx` — Small client component with a copy-to-clipboard button per field (silent fallback when the Clipboard API is unavailable).
- `src/app/(app)/app/pagos/retorno/page.tsx` — Server component that lands the parent after the Flow checkout. Derives the target payment from the authenticated user's most recent payment with a Flow transaction id when Flow does not append `?token=` to the return URL.
- `src/app/(app)/app/pagos/retorno/retorno-client.tsx` — Polls `payments.status` every 2 seconds for up to 30 seconds. Renders success / rejected / timeout states. When no identifier is available it lands on the neutral "timeout" screen rather than claiming rejection — the webhook is the authoritative confirmation path.
- `src/app/(app)/app/pagos/retorno/mock/route.ts` — Mock-mode-only GET route. Guarded by `FLOW_MOCK==='true'` and `VERCEL_ENV!=='production'`. Calls `confirmPayment` directly with status=2 to simulate a successful payment, then redirects to the real return page.

### Email System (`src/lib/email/`)

- `resend.ts` — Nodemailer transport configured with Gmail SMTP. Exports `sendEmail(to, subject, html)`.
- `templates.ts` — HTML email builder with CluPay branding (blue header, white card, CTA button). Five per-type builders: invitation, invoice-ready, payment confirmation, payment reminder, overdue alert.
- `send-notification.ts` — Orchestrator: sends email + logs to `notifications` table. On failure, logs with `status: 'failed'` and does not throw.

### Invoice Generation (`src/lib/invoice-generation.ts`)

Called by the daily cron job. For each club whose `billing_day` matches today:
1. Finds parents with active enrollments
2. Calculates per-item amounts with kid-level and parent-level discounts
3. Creates invoice + invoice items
4. Returns auto-approved invoice IDs for email notifications

### Notification Cron (`src/lib/notification-cron.ts`)

Called by the daily cron job after invoice generation:
1. Payment reminders — 3 days before `due_date` for `pending` invoices
2. Overdue alerts — 1, 3, 7 days after `due_date` for `overdue` invoices
3. Auto-approved invoice emails — for invoices just created with auto-approve enabled

Deduplication via `notifications` table metadata matching.

### Supabase Clients (`src/lib/supabase/`)

- `client.ts` — Browser client via `createBrowserClient()` for client components.
- `server.ts` — Server client via `createServerClient()` with cookie-based auth for server components.
- `service.ts` — Service role client for cross-RLS operations (email sending, invitation token lookup).
- `middleware.ts` — `updateSession()` for request/response auth cookie management.

### Auth Guard (`src/components/shared/auth-guard.tsx`)

Client-side role check. Fetches the user's profile from `profiles` table, compares `role` to `requiredRole` prop. Redirects unauthorized users.

### Formatting Utilities (`src/lib/format.ts`)

- `formatCLP(amount)` — Chilean Peso formatting via `Intl.NumberFormat("es-CL")`, no decimals.
- `formatDate(dateString)` — Localized date display via `new Date()`, handles both ISO timestamps and YYYY-MM-DD.
- `formatPercent(value)` — Percentage with 2 decimal places.

### RUT Validation (`src/lib/rut/validate.ts`)

Chilean RUT validation using the modulo 11 algorithm. Exports `validateRut`, `formatRut`, `cleanRut`. Used by the `RutInput` shared component.

### Club Resolution (`src/lib/club.ts`)

`getClubForUser(supabase)` — Resolves the `club_id` for the authenticated club admin user by querying `club_admins`. Used by all club portal server components.

### Payment Method Configuration (`src/lib/club-payments.ts`)

Pure, IO-free helper used by both the parent portal (to route payments) and the club admin UI (to render toggles):

- `PaymentMethodKey` — `'card' | 'flow_transfer' | 'wallet' | 'installments' | 'direct_transfer'`.
- `FlowMethodKey` — `Exclude<PaymentMethodKey, 'direct_transfer'>`.
- `PAYMENT_METHOD_FLOW_ID` — maps each `FlowMethodKey` to the Flow.cl integer ID (`card → 1` Webpay, `flow_transfer → 22` Khipu, `wallet → 15` MachBank, `installments → 164` banca.me). The IDs live in code so swapping providers is a constant change, not a migration.
- `getEnabledPaymentMethods(club)` — reads the five `pm_*` toggles off the club row and returns enabled methods in a fixed display order (`card → flow_transfer → wallet → installments → direct_transfer`), each with `{ key, label, description }`.
- `paymentMethodToEnum(key)` — maps a `PaymentMethodKey` to the corresponding `payments.method` enum value (`card → card_link`, `flow_transfer → flow_transfer`, `wallet → flow_wallet`, `installments → flow_installments`, `direct_transfer → bank_transfer`). This lets `payments.method` reflect the real channel rather than a generic placeholder.

### Chilean Banks (`src/lib/banks.ts`)

- `CHILEAN_BANKS` — readonly list of the 16 most common Chilean banks, used to populate the club admin's bank dropdown.
- `BANK_ACCOUNT_TYPES` — readonly list of `{ value, label }` for `corriente`, `vista`, `ahorro`. Matches the DB CHECK on `clubs.bank_account_type`.

### Club Admin Config Form (`src/components/club/payment-methods-section.tsx`)

Client component mounted on `/club/configuracion` alongside the existing `ClubConfigForm`. Renders the five toggles with tooltips `(?)` on the non-obvious methods (Flow transfer, wallet, installments), and an expandable sub-panel with bank fields when direct transfer is on. Submits via the `updateClubPaymentConfig` server action; client-side validation mirrors server-side rules for fast feedback.

## Data Model

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `profiles` | User profiles (all roles) | References `auth.users` |
| `clubs` | Sports clubs/academies, plus per-club payment configuration (5 `pm_*` toggles + optional bank account fields for direct transfer, guarded by two CHECK constraints: at least one method enabled, and direct transfer requires complete bank data) | Has many sports, enrollments, invoices |
| `club_admins` | Links profiles to clubs as admins | FK to profiles + clubs |
| `club_parents` | Links parents to clubs (created on invitation acceptance) | FK to profiles + clubs |
| `kids` | Children of parents | FK to profiles (parent_id) |
| `sports` | Sports/activities per club | FK to clubs |
| `plans` | Pricing plans per sport (with optional `max_slots` capacity) | FK to sports |
| `enrollments` | Kid enrolled in sport/plan at club | FK to kids, clubs, sports, plans |
| `invoices` | Monthly bills per parent per club | FK to profiles, clubs |
| `invoice_items` | Line items per invoice | FK to invoices, kids, sports, plans |
| `payments` | Payment records | FK to invoices |
| `discounts` | Manual discounts per kid or parent | FK to clubs, assigned by profile |
| `notifications` | Email notification audit log | FK to profiles, clubs |
| `platform_billing` | CluPay revenue per club per period | FK to clubs |
| `invitations` | Club invitations to parents | FK to clubs, token-based |

All monetary amounts are stored as integers (CLP, no decimals). Percentages use `NUMERIC(5,2)`.

The `payment_method` enum has 6 values: `card_automatic` (reserved for future cargo automático), `card_link` (Flow Webpay), `bank_transfer` (direct transfer reconciled manually), `flow_transfer` (Khipu/etpay), `flow_wallet` (MachBank/Onepay), `flow_installments` (banca.me). The enum value stored in `payments.method` reflects the real channel rather than a placeholder, making payment history easy to audit.

## Key Flows

### Authentication Flow
1. User visits `/login` → email/password or Google OAuth
2. Supabase Auth creates session → cookies set via SSR middleware
3. Root page (`/`) reads profile role → redirects to `/admin`, `/club`, or `/app`
4. Layout's `AuthGuard` verifies role on every page load

### Invitation & Enrollment Flow
1. Club admin submits invitation form → server action inserts invitation + sends email
2. Parent receives email with `/invite/{token}` link
3. Parent clicks link → invite page (service role) looks up token → shows club info, sports, plans
4. Parent registers (if new) or logs in → selects kid + sport + plan → enrollment created
5. `club_parents` record created → parent linked to club

### Invoice Generation Flow (Daily Cron)
1. Cron hits `POST /api/cron/generate-invoices` at 4 AM UTC
2. `markOverdueInvoices()` — moves past-due `pending` invoices to `overdue`
3. `generateInvoices()` — for each club where `billing_day = today`, creates invoices per parent with discount calculations
4. `processNotifications()` — sends reminders (3 days before due), overdue alerts (1/3/7 days), and invoice-ready emails for auto-approved invoices

### Club Admin Approval Flow
1. Club admin views `/club/cobros` — sees `generated` invoices
2. Clicks "Aprobar" (single) or "Aprobar todos" (bulk) → server action updates status to `pending` + sends email to parent(s)
3. Club admin marks invoice as paid → server action calls `mark_invoice_paid` RPC + sends payment confirmation email

### Parent Payment Flow
1. Parent clicks **Pagar Ahora** on `/app`. `PayNowButton` calls `getEnabledPaymentMethods(club)` and routes:
   - 0 methods → inline error ("club no tiene métodos habilitados").
   - 2+ methods → `router.push('/app/pagos/metodo/[invoiceId]')` (selector page).
   - 1 method, `direct_transfer` → `router.push('/app/pagos/transferencia/[invoiceId]')`.
   - 1 method, Flow → calls `createFlowPayment(invoiceId, methodKey)` directly.
2. `createFlowPayment` authenticates the parent, verifies invoice ownership, invoice status, and that the requested `methodKey` is still enabled on the club (race-safe); rejects if a pending Flow payment exists for this invoice in the last 30 minutes (dedupe).
3. Server action pre-inserts a `payments` row (`status='pending'`, `method` set via `paymentMethodToEnum(methodKey)` — e.g., `card_link` for `card`, `flow_transfer` for `flow_transfer`) via the service role client.
4. Server action calls Flow `/payment/create` with a signed body that includes `paymentMethod=<Flow ID>` (1 Webpay, 22 Khipu, 15 MachBank, 164 banca.me) → receives `{ token, url, flowOrder }` → stores the token on the payments row → returns `${url}?token=${token}` to the client.
5. Client redirects the browser to the Flow hosted checkout.
6. Parent pays. Flow:
   - **Server-to-server:** POSTs our `/api/webhooks/flow/confirm` with the token (authoritative path)
   - **Browser:** redirects to `/app/pagos/retorno` (Flow does NOT reliably append `?token=`; the server page falls back to the parent's most recent payment)
7. Webhook handler round-trips to `payment/getStatus`, authenticates the token, looks up the payments row, delegates to `confirmPayment`:
   - **Flow status 2 (paid):** updates `payments` to `completed`, `invoices` to `paid`, sends payment-confirmation email
   - **Flow status 3/4 (rejected/cancelled):** marks payments as `failed`, leaves invoice alone
   - **Flow status 1 (pending):** no-op, Flow will webhook again
8. Return page polls the DB every 2s for up to 30s, flips to the success/failed UI when the webhook lands, or shows "Te notificaremos por email" if it times out (the webhook still runs).

### Parent Direct Bank Transfer Flow (outside Flow)

1. Parent selects "Transferencia directa" (either directly because it's the only method enabled, or from the selector page). The direct transfer page renders the club's bank data — titular, RUT, banco, tipo de cuenta, número de cuenta — each with a copy-to-clipboard button, plus an instruction to send the proof to the optional notification email.
2. No `payments` row is created at this step; the parent performs the transfer in their own bank.
3. When the club admin receives the transfer, they open `/club/cobros` and click **Marcar pagado** on the invoice. `mark-invoice-paid.ts` creates a `payments` row with `method='bank_transfer'`, flips the invoice to `paid`, and sends the payment-confirmation email.

Amounts are stored as integers (CLP). Flow returns `amount` as a string in the getStatus response — the client coerces it to a number before passing it to `confirmPayment`, so the amount-mismatch guard compares like with like.

## Authentication & Authorization

- **Provider:** Supabase Auth (email + password, Google OAuth). Email confirmation disabled.
- **Session:** Cookie-based via `@supabase/ssr`, managed in middleware
- **Roles:** `super_admin`, `club_admin`, `parent` (stored in `profiles.role`)
- **Client-side:** `AuthGuard` component checks role before rendering
- **Server-side:** RLS policies on all tables enforce data isolation
  - Super admins: full access (RLS bypass via role check)
  - Club admins: access scoped to their assigned club via `club_admins` table
  - Parents: access scoped to their own `profile.id`
- **RLS helper functions:** `is_super_admin()`, `is_club_admin(club_id)`, `is_club_admin_for_kid(kid_id)` — all `SECURITY DEFINER` to avoid recursion

## External Integrations

- **Gmail SMTP** (via Nodemailer) — Transactional emails. Configured via `SMTP_USER` and `SMTP_PASS` env vars. 500 emails/day free tier.
- **Supabase Storage** — Public `club-logos` bucket for club logo uploads. RLS policies allow authenticated upload/update/delete, public read.
- **Flow.cl** — Chilean payment processor. Parents pay invoices through Flow's hosted checkout with Webpay Plus as the primary method; each club can additionally offer Khipu transfer, MachBank/Onepay wallet, or banca.me installments. CluPay is the merchant of record; settlement to clubs happens externally. Configured via `FLOW_API_BASE`, `FLOW_API_KEY`, `FLOW_SECRET_KEY`. Per-transaction method filtering uses the optional `paymentMethod` integer param on `payment/create` (Flow only accepts a single ID or all — so the per-club filter happens on our side and the parent either picks from the enabled list or is routed directly when exactly one method is enabled). Local development uses `FLOW_MOCK=true` to skip real charges (mock mode refuses to run if `VERCEL_ENV=production`). Authentication uses HMAC-SHA256 over alphabetically-sorted params. The webhook is the authoritative confirmation path; the browser return page is UX-only and reads from our DB, not Flow. Validated in production with a real CLP transaction end-to-end (payment → webhook → DB → email).

## Infrastructure & Deployment

- **Hosting:** Vercel (auto-deploys from `main` branch)
- **Database:** Supabase Cloud (São Paulo region)
- **Migrations:** SQL files in `supabase/migrations/`, applied via Supabase CLI or MCP
- **Cron:** Vercel Cron — daily at 4 AM UTC (`vercel.json`)
- **Flow.cl webhook:** `POST /api/webhooks/flow/confirm` on the production domain. No Flow dashboard webhook config is required — the URL is sent as `urlConfirmation` with each `payment/create` call.
- **No CI/CD pipeline** configured yet (no GitHub Actions)

## HTTP Endpoints

Non-page routes:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/cron/generate-invoices` | Daily cron — marks overdue, generates invoices, sends scheduled emails. Authenticated via `CRON_SECRET`. |
| `POST` | `/api/webhooks/flow/confirm` | Flow.cl server-to-server webhook. Always returns 200 for processed outcomes, 500 only for transient failures. |
| `GET` | `/app/pagos/retorno/mock` | Mock-mode only. Refuses to run unless `FLOW_MOCK=true` AND `VERCEL_ENV!=='production'`. |

## Frontend Architecture

- **Framework:** Next.js 16 App Router with React 19
- **Styling:** Tailwind CSS 4 with design tokens in `globals.css`
- **Routing:** Route groups `(admin)`, `(club)`, `(app)`, `(auth)` for portal isolation
- **State:** No global state management — server components fetch data directly, client components use local state
- **Components:** Feature-organized under `src/components/{portal}/`
- **Server vs Client split:** Pages that only display data are server components. Forms and interactive elements are client components with `"use client"`. Mutations use server actions (`"use server"`).

## Design Decisions

- **Single app, route groups** over separate apps — simpler deployment, shared auth, shared components. Can be split later via Turborepo if scale demands it.
- **RLS over API middleware** for authorization — security enforced at the database level, not application level. Prevents data leaks from query bugs.
- **`club_id` tenant column** over separate schemas — simpler migrations, easier cross-tenant queries for super admin.
- **Server Components by default** — data fetching happens on the server, reducing client bundle size and eliminating loading states for initial page load.
- **Server Actions for mutations** — DB writes + email sending happen server-side, keeping API keys secure and enabling atomic-ish operations.
- **Mobile-first for parent portal only** — parents interact via phone, admins use desktop. Different layouts per route group.
- **No ORM** — direct Supabase client queries. Keeps the stack simple and leverages Supabase's built-in type generation.
- **Gmail SMTP over Resend** — Resend's free tier only sends to the account owner. Gmail SMTP sends to anyone for free (500/day), no custom domain needed.
- **SECURITY DEFINER functions for RLS** — breaks circular policy dependencies (e.g., kids ↔ enrollments) without sacrificing security.
- **Webhook is source of truth for Flow payments** — the browser return page is UX-only and reads from our DB. The webhook verifies Flow's notification by calling `payment/getStatus` with our secret key before trusting it, so an attacker who guesses or replays a token cannot confirm a payment. The authoritative payment state is only ever set via `confirmPayment`, which is idempotent on `flow_transaction_id`.
- **Service role client for `payments` writes** — the `payments` table RLS grants parents only SELECT, so INSERT/UPDATE is done via the service role after ownership has been verified against `invoices` (parent-scoped RLS). This keeps RLS as the perimeter without moving payment logic out of the server action.
- **Direct UPDATEs in `confirmPayment` instead of the `mark_invoice_paid` RPC** — that RPC inserts its own `payments` row, which would duplicate the row already pre-inserted by `createFlowPayment`. The direct UPDATE path is atomicity-light but matches the existing `mark-invoice-paid.ts` pattern; full transactional atomicity is tracked in NEXT-STEPS.
- **Flow method IDs live in TypeScript, not the database** — mapping `PaymentMethodKey → Flow ID` sits in `src/lib/club-payments.ts`. Swapping Khipu for etpay, or adding a new Flow category, is a constant change; no migration. The DB stores only semantic toggles (`pm_card`, `pm_flow_transfer`, …), not Flow-specific IDs.
- **Server action as the race-safe gate for method availability** — even though the client only shows enabled methods, `createFlowPayment` re-reads the club row and re-verifies the requested `methodKey` is still enabled before inserting a `payments` row or calling Flow. This closes the window where an admin disables a method while a parent is mid-click.
- **`payments.method` reflects the real channel** — we extended the `payment_method` enum with `flow_transfer`, `flow_wallet`, `flow_installments` so that payment history shows how each invoice was actually paid, not a generic placeholder. This cost one migration and pays off every time anyone audits revenue by channel.
- **Direct transfer is outside Flow on purpose** — conciliation is manual. The parent sees the bank data, the admin uses the existing `MarkPaidButton` when the transfer lands. This keeps the DB clean (no "pending verification" intermediate state) and reuses code the team already trusts. We explicitly rejected "ya transferí" tracking / proof upload for now; revisit only if admins ask.
