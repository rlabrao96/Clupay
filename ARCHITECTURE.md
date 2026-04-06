# Architecture

## System Overview

CluPay is a single Next.js 16 application serving three portals via route groups, backed by Supabase for authentication, database, and storage. Each portal is isolated by role-based access control at the layout level and Supabase Row-Level Security at the database level.

```
┌─────────────────────────────────────────────────┐
│              Next.js App (Vercel)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  /admin   │ │  /club   │ │  /app (PWA)      │ │
│  │  Super    │ │  Club    │ │  Parent Portal   │ │
│  │  Admin    │ │  Admin   │ │  Mobile-first    │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
├─────────────────────────────────────────────────┤
│              Supabase                            │
│  ┌────────┐ ┌─────┐ ┌───────────┐ ┌──────────┐ │
│  │ Auth   │ │ DB  │ │ Edge Fns  │ │ Storage  │ │
│  │ + RLS  │ │ PG  │ │ (future)  │ │ (future) │ │
│  └────────┘ └─────┘ └───────────┘ └──────────┘ │
├─────────────────────────────────────────────────┤
│              External Services (planned)         │
│  ┌─────────┐ ┌────────┐                         │
│  │ Flow.cl │ │ Resend │                          │
│  │ Payments│ │ Email  │                          │
│  └─────────┘ └────────┘                         │
└─────────────────────────────────────────────────┘
```

## Core Components

### Next.js App (`src/app/`)

Three route groups serve the portals:
- `(admin)/admin/*` — Super Admin, desktop layout with sidebar. Protected by `AuthGuard requiredRole="super_admin"`.
- `(club)/club/*` — Club Admin, desktop layout with sidebar. Protected by `AuthGuard requiredRole="club_admin"`.
- `(app)/app/*` — Parent, mobile-first layout with bottom navigation. Protected by `AuthGuard requiredRole="parent"`.
- `(auth)/*` — Shared login, register, and OAuth callback pages.

Entry point: `src/app/layout.tsx` (root layout with Providers).

### Supabase Clients (`src/lib/supabase/`)

- `client.ts` — Browser client via `createBrowserClient()` for client components.
- `server.ts` — Server client via `createServerClient()` with cookie-based auth for server components.
- `middleware.ts` — `updateSession()` for request/response auth cookie management.

### Auth Guard (`src/components/shared/auth-guard.tsx`)

Client-side role check. Fetches the user's profile from `profiles` table, compares `role` to `requiredRole` prop. Redirects unauthorized users.

### Formatting Utilities (`src/lib/format.ts`)

- `formatCLP(amount)` — Chilean Peso formatting via `Intl.NumberFormat("es-CL")`, no decimals.
- `formatDate(dateString)` — Localized date display.
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
| `kids` | Children of parents | FK to profiles (parent_id) |
| `sports` | Sports/activities per club | FK to clubs |
| `plans` | Pricing plans per sport | FK to sports |
| `enrollments` | Kid enrolled in sport/plan at club | FK to kids, clubs, sports, plans |
| `invoices` | Monthly bills per parent per club | FK to profiles, clubs |
| `invoice_items` | Line items per invoice | FK to invoices, kids, sports, plans |
| `payments` | Payment records | FK to invoices |
| `discounts` | Manual discounts per kid or parent | FK to clubs, assigned by profile |
| `notifications` | Notification queue | FK to profiles, clubs |
| `platform_billing` | CluPay revenue per club per period | FK to clubs |
| `invitations` | Club invitations to parents | FK to clubs, token-based |

All monetary amounts are stored as integers (CLP, no decimals). Percentages use `NUMERIC(5,2)`.

## Key Flows

### Authentication Flow
1. User visits `/login` → email/password or Google OAuth
2. Supabase Auth creates session → cookies set via SSR middleware
3. Root page (`/`) reads profile role → redirects to `/admin`, `/club`, or `/app`
4. Layout's `AuthGuard` verifies role on every page load

### Club Admin Scoping
1. Club admin logs in → AuthGuard confirms `role === "club_admin"`
2. Server components call `getClubForUser(supabase)` → queries `club_admins` for `club_id`
3. All data queries filter by `club_id` → RLS policies enforce at DB level

### Parent Data Access
1. Parent logs in → AuthGuard confirms `role === "parent"`
2. Server components call `supabase.auth.getUser()` → use `user.id` as `parent_id`
3. Kids, invoices, enrollments all filtered by `parent_id` → RLS enforces

## Authentication & Authorization

- **Provider:** Supabase Auth (email + password, Google OAuth)
- **Session:** Cookie-based via `@supabase/ssr`, managed in middleware
- **Roles:** `super_admin`, `club_admin`, `parent` (stored in `profiles.role`)
- **Client-side:** `AuthGuard` component checks role before rendering
- **Server-side:** RLS policies on all tables enforce data isolation
  - Super admins: full access (RLS bypass via role check)
  - Club admins: access scoped to their assigned club via `club_admins` table
  - Parents: access scoped to their own `profile.id`

## Infrastructure & Deployment

- **Hosting:** Vercel (auto-deploys from `main` branch)
- **Database:** Supabase Cloud (São Paulo region)
- **Migrations:** SQL files in `supabase/migrations/`, applied via Supabase CLI
- **No CI/CD pipeline** configured yet (no GitHub Actions)

## Frontend Architecture

- **Framework:** Next.js 16 App Router with React 19
- **Styling:** Tailwind CSS 4 with design tokens in `globals.css`
- **Routing:** Route groups `(admin)`, `(club)`, `(app)`, `(auth)` for portal isolation
- **State:** No global state management — server components fetch data directly, client components use local state
- **Components:** Feature-organized under `src/components/{portal}/`
- **Server vs Client split:** Pages that only display data are server components. Forms and interactive elements are client components with `"use client"`.

## Design Decisions

- **Single app, route groups** over separate apps — simpler deployment, shared auth, shared components. Can be split later via Turborepo if scale demands it.
- **RLS over API middleware** for authorization — security enforced at the database level, not application level. Prevents data leaks from query bugs.
- **`club_id` tenant column** over separate schemas — simpler migrations, easier cross-tenant queries for super admin.
- **Server Components by default** — data fetching happens on the server, reducing client bundle size and eliminating loading states for initial page load.
- **Mobile-first for parent portal only** — parents interact via phone, admins use desktop. Different layouts per route group.
- **No ORM** — direct Supabase client queries. Keeps the stack simple and leverages Supabase's built-in type generation.
