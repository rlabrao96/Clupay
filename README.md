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

**Auth:**
- Supabase Auth (email + password, Google OAuth)

**Hosting:**
- Vercel (auto-deploys from `main`)
- Daily cron job via Vercel Cron (invoice generation + email notifications at 4 AM UTC)

**Testing:**
- Jest 30 with `next/jest` config

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

Run migrations against your Supabase project. Migrations are in `supabase/migrations/` (28 files, `00001` through `00031`).

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
│   ├── (admin)/          # Super Admin portal (desktop)
│   ├── (club)/           # Club Admin portal (desktop-first)
│   ├── (app)/            # Parent portal (mobile-first PWA)
│   ├── (auth)/           # Shared auth pages (login, register, callback)
│   ├── api/cron/         # Vercel Cron endpoint (invoice generation + notifications)
│   ├── invite/[token]/   # Invitation acceptance page
│   └── page.tsx          # Root redirect by role
├── components/
│   ├── shared/           # AuthGuard, LogoutButton, RutInput, Providers
│   ├── admin/            # ClubForm, ClubAdminManager
│   ├── club/             # SportForm, PlanForm, InvoiceTable, MarkPaidButton, DeleteInvitationButton, etc.
│   ├── app/              # KidForm, ProfileForm
│   └── invite/           # EnrollmentForm (invitation acceptance)
├── lib/
│   ├── actions/          # Server actions (send-invitation, delete-invitation, approve-invoice, mark-invoice-paid)
│   ├── email/            # Email client (Nodemailer), templates, notification sender
│   ├── supabase/         # Client, server, service role, and middleware helpers
│   ├── rut/              # Chilean RUT validation (modulo 11)
│   ├── format.ts         # CLP currency, date, percent formatters
│   ├── club.ts           # Club ID resolution for club admins
│   ├── invoice-generation.ts  # Monthly invoice generation engine
│   └── notification-cron.ts   # Email notification scheduling (reminders, overdue alerts)
└── types/
    └── index.ts          # All TypeScript interfaces and type aliases
supabase/
├── migrations/           # 28 SQL migration files
└── seed.sql              # Test data
__tests__/
└── lib/
    ├── rut/              # RUT validation tests
    └── email/            # Email template and notification sender tests
```

## What CluPay Does

### Three Portals

**Super Admin Portal** (`/admin`) — Platform-wide management for the CluPay team. Dashboard with KPIs (clubs, athletes, revenue, overdue invoices). CRUD for clubs with admin assignment and fee configuration. User listing across all roles. Platform billing/revenue tracking per club.

**Club Admin Portal** (`/club`) — Club-scoped management for academy owners. Dashboard with club KPIs. Unified "Deportes y Planes" page with collapsible sport sections, inline plan management, enrollment counts, capacity limits, and estimated monthly revenue. Athletes grouped by kid with enrollment badges and monthly totals. Invoice management with expandable detail rows (click any row to see line items per kid/sport/plan). Invitation management with inline delete confirmation. Manage discounts per kid or parent. Club configuration (billing day, due day, auto-approve, logo upload via Supabase Storage).

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
- **Payment confirmation** — when club admin marks invoice as paid
- **Payment reminder** — 3 days before due date (via daily cron)
- **Overdue alerts** — 1, 3, 7 days after due date (via daily cron)

All emails are logged to the `notifications` table for audit and deduplication.

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
