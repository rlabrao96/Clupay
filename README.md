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

**Auth:**
- Supabase Auth (email + password, Google OAuth)

**Hosting:**
- Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A Supabase project (cloud or local)

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

### Database Setup

Run migrations against your Supabase project. Migrations are in `supabase/migrations/` (16 files, `00001` through `00017`).

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

## Project Structure

```
src/
├── app/
│   ├── (admin)/          # Super Admin portal (desktop)
│   ├── (club)/           # Club Admin portal (desktop-first)
│   ├── (app)/            # Parent portal (mobile-first PWA)
│   ├── (auth)/           # Shared auth pages (login, register, callback)
│   └── page.tsx          # Root redirect by role
├── components/
│   ├── shared/           # AuthGuard, LogoutButton, RutInput, Providers
│   ├── admin/            # ClubForm, ClubAdminManager
│   ├── club/             # SportForm, PlanForm, MarkPaidButton, etc.
│   └── app/              # KidForm, ProfileForm
├── lib/
│   ├── supabase/         # Client, server, and middleware helpers
│   ├── rut/              # Chilean RUT validation (modulo 11)
│   ├── format.ts         # CLP currency, date, percent formatters
│   └── club.ts           # Club ID resolution for club admins
└── types/
    └── index.ts          # All TypeScript interfaces and type aliases
supabase/
├── migrations/           # 16 SQL migration files
└── seed.sql              # Test data
```

## What CluPay Does

### Three Portals

**Super Admin Portal** (`/admin`) — Platform-wide management for the CluPay team. Dashboard with KPIs (clubs, athletes, revenue, overdue invoices). CRUD for clubs with admin assignment and fee configuration. User listing across all roles. Platform billing/revenue tracking per club.

**Club Admin Portal** (`/club`) — Club-scoped management for academy owners. Dashboard with club KPIs. CRUD for sports and plans. Athlete listing with enrollment details. Invoice management with mark-as-paid for bank transfers. Send invitations to parents. Manage discounts per kid or parent. Club configuration.

**Parent Portal** (`/app`) — Mobile-first experience for parents. Dashboard showing next payment with status badge and "Pagar Ahora" button. Payment history with invoice cards. Kids listing with enrollment details per club/sport/plan. Add kid with RUT validation. Profile management.

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
