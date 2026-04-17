# CluPay

Plataforma de pagos y cobranzas para academias y clubes deportivos en Chile. CluPay simplifica cómo los clubes cobran a los apoderados y cómo los apoderados pagan las actividades deportivas de sus hijos.

**Target market:** Chilean sports academies and clubs
**Language:** Spanish only
**Currency:** Chilean Pesos (CLP)

## Tech Stack

**Frontend:**
- Next.js 16.2.2 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 4

**Backend & Database:**
- Supabase (PostgreSQL, Auth, Edge Functions, Storage)
- Row-Level Security (RLS) for multi-tenant data isolation

**Email:**
- Nodemailer + Gmail SMTP (transactional emails: invitations, invoices, reminders, overdue alerts, payment confirmations)

**Payments:**
- Flow.cl — Chilean hosted-checkout payment processor. HMAC-SHA256 signed requests, server-to-server webhook for payment confirmation.

**Auth:**
- Supabase Auth (email + password, Google OAuth)

**Hosting:**
- Vercel (auto-deploys from `main`)
- Daily cron job via Vercel Cron (invoice generation + email notifications at 4 AM UTC)

**Testing:**
- Jest 30 with `next/jest` config (66 tests, including 24 for the Flow integration and 17 for the per-club payment-method configuration)

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A Supabase project (cloud or local)
- A Gmail account with App Password (for sending emails)

### Installation

```bash
git clone https://github.com/rlabrao96/Clupay.git
cd Clupay
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `CRON_SECRET` | Yes | Secret for authenticating Vercel Cron requests |
| `SMTP_USER` | Yes | Gmail address for sending emails |
| `SMTP_PASS` | Yes | Gmail App Password (16-char, from Google Account settings) |
| `SMTP_FROM` | No | Sender display name (defaults to `CluPay <SMTP_USER>`) |
| `NEXT_PUBLIC_APP_URL` | No | App URL for email links (defaults to `http://localhost:3000`) |
| `FLOW_API_BASE` | Yes | Flow.cl API base URL (`https://www.flow.cl/api`) |
| `FLOW_API_KEY` | Yes | Flow.cl public API key |
| `FLOW_SECRET_KEY` | Yes | Flow.cl secret key (HMAC signing) |
| `FLOW_MOCK` | No | Set to `true` in `.env.local` only to mock Flow calls in development |

### Database Setup

Run migrations against your Supabase project. Migrations are in `supabase/migrations/` (29 files, `00001` through `00032`).

To seed test data with sample accounts:

```bash
# Test accounts (password: test1234 for all):
# admin@clupay.test  → Super Admin
# club@clupay.test   → Club Admin
# parent@clupay.test → Parent
```

See `supabase/seed.sql` for full seed data including a sample club, sports, plans, kids, and enrollments.

### Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected based on your role:
- Super Admin → `/admin`
- Club Admin → `/club`
- Parent → `/app`

### Running Tests

```bash
npm test
```

## Project Structure

```
src/
├── app/
│   ├── (admin)/                          # Super Admin portal (desktop)
│   ├── (club)/                           # Club Admin portal (desktop-first)
│   ├── (app)/                            # Parent portal (mobile-first PWA)
│   │   └── app/pagos/
│   │       ├── retorno/                  # Flow checkout return page + mock route
│   │       ├── metodo/[invoiceId]/       # Payment method selector (shown when 2+ methods enabled)
│   │       └── transferencia/[invoiceId]/ # Direct bank transfer page (club's account details)
│   ├── (auth)/                           # Shared auth pages (login, register, callback)
│   ├── api/
│   │   ├── cron/                         # Vercel Cron endpoint (invoice generation + notifications)
│   │   └── webhooks/flow/confirm/        # Flow.cl server-to-server webhook
│   ├── invite/[token]/                   # Invitation acceptance page
│   └── page.tsx                          # Root redirect by role
├── components/
│   ├── shared/                           # AuthGuard, LogoutButton, RutInput, Providers
│   ├── admin/                            # ClubForm, ClubAdminManager
│   ├── club/                             # SportForm, PlanForm, InvoiceTable, MarkPaidButton, PaymentMethodsSection
│   ├── app/                              # KidForm, ProfileForm, PayNowButton
│   └── invite/                           # EnrollmentForm (invitation acceptance)
├── lib/
│   ├── actions/                          # Server actions (invitations, invoice approval, mark paid, create-flow-payment, update-club-payment-config)
│   ├── email/                            # Email client (Nodemailer), templates, notification sender
│   ├── flow/                             # Flow.cl: signature, HTTP client, shared confirmation logic
│   ├── supabase/                         # Client, server, service role, and middleware helpers
│   ├── rut/                              # Chilean RUT validation (modulo 11)
│   ├── format.ts                         # CLP currency, date, percent formatters
│   ├── banks.ts                          # Chilean banks + account type constants
│   ├── club.ts                           # Club ID resolution for club admins
│   ├── club-payments.ts                  # Enabled payment methods derivation + Flow ID mapping
│   ├── invoice-generation.ts             # Monthly invoice generation engine
│   └── notification-cron.ts              # Email notification scheduling (reminders, overdue alerts)
└── types/
    └── index.ts                          # All TypeScript interfaces and type aliases
supabase/
├── migrations/                           # 29 SQL migration files
└── seed.sql                              # Test data
__tests__/
├── app/api/webhooks/flow/                # Webhook handler tests
└── lib/
    ├── flow/                             # Signature, client, confirm-payment tests
    ├── actions/                          # create-flow-payment, update-club-payment-config tests
    ├── rut/                              # RUT validation tests
    ├── club-payments.test.ts             # Payment method helper tests
    └── email/                            # Email template and notification sender tests
```

## What CluPay Does

### Three Portals

**Super Admin Portal** (`/admin`) — Platform-wide management for the CluPay team. Dashboard with KPIs (clubs, athletes, revenue, overdue invoices). CRUD for clubs with admin assignment and fee configuration. User listing across all roles. Platform billing/revenue tracking per club.

**Club Admin Portal** (`/club`) — Club-scoped management for academy owners. Dashboard with club KPIs. Unified "Deportes y Planes" page with collapsible sport sections, inline plan management, enrollment counts, capacity limits, and estimated monthly revenue. Athletes grouped by kid with enrollment badges and monthly totals. Invoice management with expandable detail rows (click any row to see line items per kid/sport/plan). Invitation management with inline delete confirmation. Manage discounts per kid or parent. Club configuration (billing day, due day, auto-approve, logo upload via Supabase Storage, payment methods offered to parents, and bank account details for direct transfer).

**Parent Portal** (`/app`) — Mobile-first experience for parents. Dashboard showing next payment with status badge and "Pagar Ahora" button. Payment history with invoice cards. Kids listing with enrollment details per club/sport/plan. Add kid with RUT validation. Profile management.

### Invoice Generation Engine

Daily Vercel Cron job (`POST /api/cron/generate-invoices`) at 4 AM UTC:
1. Marks overdue invoices (past due date, still pending)
2. Generates monthly invoices per club per parent based on active enrollments
3. Applies kid-level and parent-level discounts
4. Sets initial status: `generated` (for club admin review) or `pending` (if auto-approve enabled)
5. Sends email notifications: reminders (3 days before due), overdue alerts (1/3/7 days after), and invoice-ready emails for auto-approved invoices

### Email Notifications

Transactional emails via Nodemailer + Gmail SMTP:
- **Invitation email** — when club admin sends invitation, parent receives link to `/invite/{token}`
- **Invoice ready** — when invoice is approved (manual or auto), parent is notified
- **Payment confirmation** — when club admin marks invoice as paid, or when Flow webhook confirms a successful payment
- **Payment reminder** — 3 days before due date (via daily cron)
- **Overdue alerts** — 1, 3, 7 days after due date (via daily cron)

All emails are logged to the `notifications` table for audit and deduplication.

### Payment Methods (Per-Club Configuration)

Each club admin chooses which payment methods their parents see in `/club/configuracion`:

- **Tarjeta (Webpay)** — card payments via Flow.
- **Transferencia bancaria Flow (Khipu)** — instant online bank transfer reconciled by Flow.
- **Billetera digital (MachBank / Onepay)** — mobile wallet apps.
- **Cuotas sin tarjeta (banca.me)** — customer pays in installments, club receives the full amount upfront.
- **Transferencia directa** — parent transfers to the club's bank account (outside Flow, manual reconciliation).

At payment time, the parent portal routes based on how many methods are enabled:
- 1 Flow method → straight to the Flow hosted checkout.
- 1 method = direct transfer → a new page with the club's bank details and copy buttons.
- 2+ methods → an intermediate selector page at `/app/pagos/metodo/[invoiceId]`.

Defaults preserve current behavior: all 4 Flow toggles default ON; direct transfer defaults OFF until the club fills in its bank account form.

### Online Payments via Flow.cl

Parents pay invoices through Flow's hosted checkout:
1. Parent clicks **Pagar Ahora** on the dashboard. If multiple methods are enabled they pick one first; otherwise the parent is routed directly.
2. A server action verifies the chosen method is still enabled on the club, pre-inserts a `payments` row (with the real channel stored in `payments.method`), and calls Flow's `payment/create` with a signed request that includes the Flow `paymentMethod` ID, returning a checkout URL + token.
3. Browser redirects to Flow's hosted checkout.
4. Flow POSTs our webhook at `/api/webhooks/flow/confirm`. The handler round-trips back to Flow via `payment/getStatus` to authenticate the token, then marks the payment as completed, the invoice as paid, and sends the payment-confirmation email. The webhook is the authoritative source of truth.
5. The parent's browser is redirected to `/app/pagos/retorno`, which polls the DB until it sees the webhook-confirmed status.

Local development uses `FLOW_MOCK=true` to short-circuit Flow calls and auto-confirm via a local mock route — the client throws at construction time if `FLOW_MOCK=true` and `VERCEL_ENV=production` so mock mode can never leak to production.

### Direct Bank Transfer (outside Flow)

When a club enables "Transferencia directa", a parent who picks this option sees the club's bank data (titular, RUT, banco, tipo de cuenta, número de cuenta, optional notification email) with copy-to-clipboard buttons and an instruction to send the bank proof to the club. No `payments` row is created at this step. When the club admin receives the transfer, they mark the invoice as paid manually via `MarkPaidButton`, which creates the `payments` row with `method='bank_transfer'` and sends the payment-confirmation email.

### Invitation & Enrollment Flow

Club admin sends invitation by email → parent receives email with link → parent registers or logs in → selects/adds kid, chooses sport and plan → enrollment created, parent linked to club.

### Multi-Tenancy

Single database with `club_id` tenant column. Supabase RLS policies enforce data isolation:
- Parents see only their own kids, invoices, and payments
- Club Admins see only their club's data
- Super Admins bypass RLS and see everything

### Chilean Localization

- All UI text in Spanish
- Chilean RUT validation (modulo 11 algorithm) with real-time formatting
- CLP currency formatting (no decimals)

## Documentation

- [Architecture](ARCHITECTURE.md) — System design, data model, key flows
- [Next Steps](NEXT-STEPS.md) — Pending work, known issues, future plans
