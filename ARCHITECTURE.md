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
│  │  send-invitation                             ││
│  └──────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────┐│
│  │  Vercel Cron (daily 4 AM UTC)                ││
│  │  Invoice generation + email notifications    ││
│  └──────────────────────────────────────────────┘│
├─────────────────────────────────────────────────┤
│              Supabase                            │
│  ┌────────┐ ┌─────┐ ┌───────────┐ ┌──────────┐ │
│  │ Auth   │ │ DB  │ │ Edge Fns  │ │ Storage  │ │
│  │ + RLS  │ │ PG  │ │ (future)  │ │ (future) │ │
│  └────────┘ └─────┘ └───────────┘ └──────────┘ │
├─────────────────────────────────────────────────┤
│              Email (Nodemailer + Gmail SMTP)      │
│  ┌─────────────────────────────────────────────┐ │
│  │ Invitations, invoices, reminders, overdue,  │ │
│  │ payment confirmations                       │ │
│  └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│              External Services (planned)         │
│  ┌─────────┐                                    │
│  │ Flow.cl │                                     │
│  │ Payments│                                     │
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
- `approve-invoice.ts` — Approve invoice(s) + send invoice-ready email (single and bulk)
- `mark-invoice-paid.ts` — Call `mark_invoice_paid` RPC + send payment confirmation email

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
- `formatDate(dateString)` — Localized date display, timezone-safe (parses Y/M/D explicitly).
- `formatPercent(value)` — Percentage with 2 decimal places.

### RUT Validation (`src/lib/rut/validate.ts`)

Chilean RUT validation using the modulo 11 algorithm. Exports `validateRut`, `formatRut`, `cleanRut`. Used by the `RutInput` shared component.

### Club Resolution (`src/lib/club.ts`)

`getClubForUser(supabase)` — Resolves the `club_id` for the authenticated club admin user by querying `club_admins`. Used by all club portal server components.

## Data Model

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `profiles` | User profiles (all roles) | References `auth.users` |
| `clubs` | Sports clubs/academies | Has many sports, enrollments, invoices |
| `club_admins` | Links profiles to clubs as admins | FK to profiles + clubs |
| `club_parents` | Links parents to clubs (created on invitation acceptance) | FK to profiles + clubs |
| `kids` | Children of parents | FK to profiles (parent_id) |
| `sports` | Sports/activities per club | FK to clubs |
| `plans` | Pricing plans per sport | FK to sports |
| `enrollments` | Kid enrolled in sport/plan at club | FK to kids, clubs, sports, plans |
| `invoices` | Monthly bills per parent per club | FK to profiles, clubs |
| `invoice_items` | Line items per invoice | FK to invoices, kids, sports, plans |
| `payments` | Payment records | FK to invoices |
| `discounts` | Manual discounts per kid or parent | FK to clubs, assigned by profile |
| `notifications` | Email notification audit log | FK to profiles, clubs |
| `platform_billing` | CluPay revenue per club per period | FK to clubs |
| `invitations` | Club invitations to parents | FK to clubs, token-based |

All monetary amounts are stored as integers (CLP, no decimals). Percentages use `NUMERIC(5,2)`.

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

## Infrastructure & Deployment

- **Hosting:** Vercel (auto-deploys from `main` branch)
- **Database:** Supabase Cloud (São Paulo region)
- **Migrations:** SQL files in `supabase/migrations/`, applied via Supabase CLI or MCP
- **Cron:** Vercel Cron — daily at 4 AM UTC (`vercel.json`)
- **No CI/CD pipeline** configured yet (no GitHub Actions)

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
