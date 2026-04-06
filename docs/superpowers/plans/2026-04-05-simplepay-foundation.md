# SimplePAY Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Next.js project with Supabase, define the full database schema, configure authentication (email + Google OAuth), and establish RLS policies for multi-tenancy.

**Architecture:** Single Next.js 14 app with App Router, route groups for three portals (`(admin)`, `(club)`, `(app)`), Supabase for auth/database/storage. Tailwind CSS for styling. TypeScript throughout.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase (PostgreSQL, Auth, RLS), next-pwa

**Spec reference:** `docs/superpowers/specs/2026-04-05-simplepay-design.md`

---

## Sub-Plans Overview

This is Plan 1 of 6:

1. **Foundation** (this plan) — Project setup, schema, auth, RLS
2. **Super Admin Portal** — Club CRUD, admin assignment, platform billing config
3. **Club Admin Portal** — Sports, plans, athletes, invitations, discounts
4. **Parent Portal (PWA)** — Registration flow, kids, enrollment, dashboard
5. **Billing Engine** — Invoice generation, Flow.cl, payments, PDFs
6. **Notification System** — Email, reminders, reward messages

---

## File Structure

```
simplepay/
├── .env.local                          # Supabase URL, anon key, service role key
├── .env.example                        # Template for env vars (no secrets)
├── next.config.ts                      # Next.js config + PWA setup
├── tailwind.config.ts                  # Tailwind config with SimplePAY color tokens
├── tsconfig.json                       # TypeScript config
├── package.json                        # Dependencies
├── supabase/
│   └── migrations/
│       ├── 00001_create_enums.sql      # Custom enum types
│       ├── 00002_create_clubs.sql      # clubs table
│       ├── 00003_create_profiles.sql   # profiles table (extends auth.users)
│       ├── 00004_create_kids.sql       # kids table
│       ├── 00005_create_sports.sql     # sports table
│       ├── 00006_create_plans.sql      # plans table
│       ├── 00007_create_enrollments.sql # enrollments table
│       ├── 00008_create_invoices.sql   # invoices + invoice_items tables
│       ├── 00009_create_payments.sql   # payments table
│       ├── 00010_create_discounts.sql  # discounts table
│       ├── 00011_create_notifications.sql # notifications table
│       ├── 00012_create_platform_billing.sql # platform_billing table
│       ├── 00013_create_invitations.sql # invitations table
│       ├── 00014_create_rls_policies.sql # All RLS policies
│       └── 00015_create_club_admins.sql # club_admins junction table
│   └── seed.sql                          # Test accounts + sample data
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout with providers
│   │   ├── page.tsx                    # Landing/redirect page
│   │   ├── (auth)/
│   │   │   ├── layout.tsx             # Auth layout (centered, no nav)
│   │   │   ├── login/page.tsx         # Login page
│   │   │   ├── register/page.tsx      # Register page
│   │   │   └── callback/route.ts      # OAuth callback handler
│   │   ├── (admin)/
│   │   │   └── layout.tsx             # Super admin layout (sidebar + auth guard)
│   │   ├── (club)/
│   │   │   └── layout.tsx             # Club admin layout (sidebar + auth guard)
│   │   └── (app)/
│   │       └── layout.tsx             # Parent PWA layout (bottom nav + auth guard)
│   ├── components/
│   │   └── shared/
│   │       ├── providers.tsx          # Client providers (Supabase, etc.)
│   │       ├── rut-input.tsx          # RUT input with real-time validation
│   │       └── auth-guard.tsx         # Role-based route protection
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Browser Supabase client
│   │   │   ├── server.ts             # Server Supabase client
│   │   │   ├── middleware.ts          # Auth middleware helper
│   │   │   └── types.ts              # Generated database types
│   │   └── rut/
│   │       └── validate.ts           # RUT validation (modulo 11)
│   ├── middleware.ts                   # Next.js middleware (auth + role routing)
│   └── types/
│       └── index.ts                   # Shared app types (roles, statuses)
└── __tests__/
    ├── lib/
    │   └── rut/
    │       └── validate.test.ts       # RUT validation tests
    └── components/
        └── shared/
            └── rut-input.test.tsx     # RUT input component tests
```

---

### Task 1: Initialize Next.js Project

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `.env.example`, `.gitignore`

- [ ] **Step 1: Create Next.js project**

Run:
```bash
cd "/Users/rlabrao/Documents/Proyectos AI/SimplePay"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Expected: Project scaffolded with `src/app/` structure.

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D supabase @types/node jest @testing-library/react @testing-library/jest-dom ts-jest jest-environment-jsdom
```

- [ ] **Step 3: Create .env.example**

Create `.env.example`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

- [ ] **Step 4: Configure Tailwind with SimplePAY design tokens**

Replace `tailwind.config.ts`:
```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#3B82F6",
          light: "#EFF6FF",
          dark: "#2563EB",
        },
        background: "#F0F7FF",
        success: {
          DEFAULT: "#22C55E",
          light: "#DCFCE7",
        },
        warning: {
          DEFAULT: "#F59E0B",
          light: "#FEF3C7",
        },
        danger: {
          DEFAULT: "#EF4444",
          light: "#FEE2E2",
        },
        text: {
          DEFAULT: "#1e293b",
          secondary: "#64748B",
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Configure Jest**

Create `jest.config.ts`:
```typescript
import type { Config } from "jest";
import nextJest from "next/jest";

const createJestConfig = nextJest({
  dir: "./",
});

const config: Config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterSetup: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default createJestConfig(config);
```

Create `jest.setup.ts`:
```typescript
import "@testing-library/jest-dom";
```

Add to `package.json` scripts:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 6: Commit**

```bash
git init
echo "node_modules/\n.next/\n.env.local\n.env\n.superpowers/" > .gitignore
git add .
git commit -m "chore: initialize Next.js project with Tailwind and Supabase deps"
```

---

### Task 2: Supabase Database Schema — Enums and Core Tables

**Files:**
- Create: `supabase/migrations/00001_create_enums.sql`
- Create: `supabase/migrations/00002_create_clubs.sql`
- Create: `supabase/migrations/00003_create_profiles.sql`
- Create: `supabase/migrations/00004_create_kids.sql`

- [ ] **Step 1: Initialize Supabase locally**

Run:
```bash
npx supabase init
```

- [ ] **Step 2: Create enum types migration**

Create `supabase/migrations/00001_create_enums.sql`:
```sql
-- User roles
CREATE TYPE user_role AS ENUM ('super_admin', 'club_admin', 'parent');

-- Enrollment status
CREATE TYPE enrollment_status AS ENUM ('active', 'paused', 'cancelled');

-- Invoice status
CREATE TYPE invoice_status AS ENUM ('generated', 'pending', 'paid', 'overdue');

-- Payment method
CREATE TYPE payment_method AS ENUM ('card_automatic', 'card_link', 'bank_transfer');

-- Payment status
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- Discount type
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');

-- Discount duration
CREATE TYPE discount_duration AS ENUM ('one_time', 'n_months', 'until_removed');

-- Notification channel
CREATE TYPE notification_channel AS ENUM ('email', 'whatsapp');

-- Notification type
CREATE TYPE notification_type AS ENUM ('reminder', 'confirmation', 'overdue', 'reward_message', 'invitation', 'invoice_pdf', 'receipt_pdf');

-- Notification status
CREATE TYPE notification_status AS ENUM ('scheduled', 'sent', 'failed');

-- Invitation status
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired');
```

- [ ] **Step 3: Create clubs table migration**

Create `supabase/migrations/00002_create_clubs.sql`:
```sql
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  billing_day INTEGER NOT NULL DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),
  platform_fee_fixed INTEGER NOT NULL DEFAULT 0, -- CLP, stored as integer
  platform_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clubs_updated_at
  BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 4: Create profiles table migration**

Create `supabase/migrations/00003_create_profiles.sql`:
```sql
-- Extends auth.users with app-specific fields
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  last_names TEXT NOT NULL,
  rut TEXT NOT NULL UNIQUE,
  date_of_birth DATE NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'parent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for RUT lookups
CREATE INDEX idx_profiles_rut ON profiles(rut);
-- Index for role-based queries
CREATE INDEX idx_profiles_role ON profiles(role);
```

- [ ] **Step 5: Create kids table migration**

Create `supabase/migrations/00004_create_kids.sql`:
```sql
CREATE TABLE kids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  last_names TEXT NOT NULL,
  rut TEXT NOT NULL UNIQUE,
  date_of_birth DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER kids_updated_at
  BEFORE UPDATE ON kids
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_kids_parent_id ON kids(parent_id);
CREATE INDEX idx_kids_rut ON kids(rut);
```

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat: add database schema — enums, clubs, profiles, kids tables"
```

---

### Task 3: Supabase Database Schema — Sports, Plans, Enrollments

**Files:**
- Create: `supabase/migrations/00005_create_sports.sql`
- Create: `supabase/migrations/00006_create_plans.sql`
- Create: `supabase/migrations/00007_create_enrollments.sql`

- [ ] **Step 1: Create sports table migration**

Create `supabase/migrations/00005_create_sports.sql`:
```sql
CREATE TABLE sports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER sports_updated_at
  BEFORE UPDATE ON sports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_sports_club_id ON sports(club_id);
```

- [ ] **Step 2: Create plans table migration**

Create `supabase/migrations/00006_create_plans.sql`:
```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL, -- CLP, stored as integer (no decimals)
  frequency TEXT NOT NULL, -- e.g., "3x/semana", "5x/semana"
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_plans_sport_id ON plans(sport_id);
```

- [ ] **Step 3: Create enrollments table migration**

Create `supabase/migrations/00007_create_enrollments.sql`:
```sql
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id UUID NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  status enrollment_status NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER enrollments_updated_at
  BEFORE UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_enrollments_kid_id ON enrollments(kid_id);
CREATE INDEX idx_enrollments_club_id ON enrollments(club_id);
CREATE INDEX idx_enrollments_sport_id ON enrollments(sport_id);
CREATE INDEX idx_enrollments_plan_id ON enrollments(plan_id);

-- Prevent duplicate enrollment: same kid, same sport, same plan
CREATE UNIQUE INDEX idx_enrollments_unique
  ON enrollments(kid_id, sport_id, plan_id)
  WHERE status = 'active';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add sports, plans, and enrollments tables"
```

---

### Task 4: Supabase Database Schema — Invoices, Payments, Discounts

**Files:**
- Create: `supabase/migrations/00008_create_invoices.sql`
- Create: `supabase/migrations/00009_create_payments.sql`
- Create: `supabase/migrations/00010_create_discounts.sql`

- [ ] **Step 1: Create invoices and invoice_items tables**

Create `supabase/migrations/00008_create_invoices.sql`:
```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL,
  subtotal INTEGER NOT NULL, -- CLP before discounts
  discount_total INTEGER NOT NULL DEFAULT 0, -- Total discount amount
  total INTEGER NOT NULL, -- CLP final amount
  due_date DATE NOT NULL,
  status invoice_status NOT NULL DEFAULT 'generated',
  pdf_url TEXT, -- Supabase Storage path
  receipt_pdf_url TEXT, -- Supabase Storage path
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_invoices_parent_id ON invoices(parent_id);
CREATE INDEX idx_invoices_club_id ON invoices(club_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

-- One invoice per parent per club per billing period
CREATE UNIQUE INDEX idx_invoices_unique_period
  ON invoices(parent_id, club_id, period_month, period_year);

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  kid_id UUID NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- Plan price at time of invoice
  discount_amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);
```

- [ ] **Step 2: Create payments table**

Create `supabase/migrations/00009_create_payments.sql`:
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  amount INTEGER NOT NULL, -- CLP
  flow_transaction_id TEXT, -- Flow.cl reference (null for bank transfers)
  status payment_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_flow_transaction_id ON payments(flow_transaction_id);
CREATE INDEX idx_payments_status ON payments(status);
```

- [ ] **Step 3: Create discounts table**

Create `supabase/migrations/00010_create_discounts.sql`:
```sql
CREATE TABLE discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES profiles(id), -- Club admin who created it
  -- Applies to kid OR parent (one must be set)
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type discount_type NOT NULL,
  value NUMERIC(10,2) NOT NULL, -- Percentage (e.g., 10.00) or fixed CLP amount
  duration discount_duration NOT NULL DEFAULT 'until_removed',
  remaining_months INTEGER, -- Only used when duration = 'n_months'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- At least one of kid_id or parent_id must be set
  CONSTRAINT discount_target CHECK (kid_id IS NOT NULL OR parent_id IS NOT NULL)
);

CREATE TRIGGER discounts_updated_at
  BEFORE UPDATE ON discounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_discounts_club_id ON discounts(club_id);
CREATE INDEX idx_discounts_kid_id ON discounts(kid_id);
CREATE INDEX idx_discounts_parent_id ON discounts(parent_id);
CREATE INDEX idx_discounts_is_active ON discounts(is_active) WHERE is_active = true;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add invoices, payments, and discounts tables"
```

---

### Task 5: Supabase Database Schema — Notifications, Platform Billing, Invitations, Club Admins

**Files:**
- Create: `supabase/migrations/00011_create_notifications.sql`
- Create: `supabase/migrations/00012_create_platform_billing.sql`
- Create: `supabase/migrations/00013_create_invitations.sql`
- Create: `supabase/migrations/00014_create_rls_policies.sql`
- Create: `supabase/migrations/00015_create_club_admins.sql`

- [ ] **Step 1: Create notifications table**

Create `supabase/migrations/00011_create_notifications.sql`:
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL DEFAULT 'email',
  type notification_type NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  status notification_status NOT NULL DEFAULT 'scheduled',
  metadata JSONB, -- Extra data (invoice_id, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_parent_id ON notifications(parent_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_scheduled_at ON notifications(scheduled_at)
  WHERE status = 'scheduled';
```

- [ ] **Step 2: Create platform_billing table**

Create `supabase/migrations/00012_create_platform_billing.sql`:
```sql
CREATE TABLE platform_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL,
  fixed_fee INTEGER NOT NULL, -- CLP
  commission_percent NUMERIC(5,2) NOT NULL,
  total_collected INTEGER NOT NULL DEFAULT 0, -- Total payments collected for the club
  commission_amount INTEGER NOT NULL DEFAULT 0, -- Calculated commission
  platform_revenue INTEGER NOT NULL DEFAULT 0, -- fixed_fee + commission_amount
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER platform_billing_updated_at
  BEFORE UPDATE ON platform_billing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE UNIQUE INDEX idx_platform_billing_unique
  ON platform_billing(club_id, period_month, period_year);
```

- [ ] **Step 3: Create invitations table**

Create `supabase/migrations/00013_create_invitations.sql`:
```sql
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES profiles(id), -- Club admin
  email TEXT, -- At least one of email or phone must be set
  phone TEXT,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status invitation_status NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invitation_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX idx_invitations_club_id ON invitations(club_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_phone ON invitations(phone);
```

- [ ] **Step 4: Create club_admins junction table**

Create `supabase/migrations/00015_create_club_admins.sql`:
```sql
CREATE TABLE club_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_club_admins_unique ON club_admins(club_id, profile_id);
CREATE INDEX idx_club_admins_club_id ON club_admins(club_id);
CREATE INDEX idx_club_admins_profile_id ON club_admins(profile_id);
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add notifications, platform_billing, invitations, club_admins tables"
```

---

### Task 6: Row-Level Security Policies

**Files:**
- Create: `supabase/migrations/00014_create_rls_policies.sql`

- [ ] **Step 1: Create RLS policies**

Create `supabase/migrations/00014_create_rls_policies.sql`:
```sql
-- Enable RLS on all tables
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kids ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_admins ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is admin of a club
CREATE OR REPLACE FUNCTION is_club_admin(check_club_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM club_admins
    WHERE club_id = check_club_id AND profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-------------------------------------------------------------------
-- CLUBS
-------------------------------------------------------------------
-- Super admin: full access
CREATE POLICY "super_admin_clubs_all" ON clubs
  FOR ALL USING (is_super_admin());

-- Club admin: read own club
CREATE POLICY "club_admin_clubs_select" ON clubs
  FOR SELECT USING (is_club_admin(id));

-- Parent: read clubs their kids are enrolled in
CREATE POLICY "parent_clubs_select" ON clubs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM enrollments e
      JOIN kids k ON k.id = e.kid_id
      WHERE e.club_id = clubs.id AND k.parent_id = auth.uid()
    )
  );

-------------------------------------------------------------------
-- PROFILES
-------------------------------------------------------------------
-- Users can read and update their own profile
CREATE POLICY "own_profile_select" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "own_profile_update" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Super admin: read all profiles
CREATE POLICY "super_admin_profiles_select" ON profiles
  FOR SELECT USING (is_super_admin());

-- Club admin: read profiles of parents in their club
CREATE POLICY "club_admin_profiles_select" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM kids k
      JOIN enrollments e ON e.kid_id = k.id
      JOIN club_admins ca ON ca.club_id = e.club_id
      WHERE k.parent_id = profiles.id AND ca.profile_id = auth.uid()
    )
  );

-- Allow insert during registration
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-------------------------------------------------------------------
-- KIDS
-------------------------------------------------------------------
-- Parent: full access to own kids
CREATE POLICY "parent_kids_all" ON kids
  FOR ALL USING (parent_id = auth.uid());

-- Club admin: read kids in their club
CREATE POLICY "club_admin_kids_select" ON kids
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM enrollments e
      JOIN club_admins ca ON ca.club_id = e.club_id
      WHERE e.kid_id = kids.id AND ca.profile_id = auth.uid()
    )
  );

-- Super admin: read all kids
CREATE POLICY "super_admin_kids_select" ON kids
  FOR SELECT USING (is_super_admin());

-------------------------------------------------------------------
-- SPORTS
-------------------------------------------------------------------
-- Club admin: full access to own club's sports
CREATE POLICY "club_admin_sports_all" ON sports
  FOR ALL USING (is_club_admin(club_id));

-- Parent: read sports in clubs their kids are in
CREATE POLICY "parent_sports_select" ON sports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM enrollments e
      JOIN kids k ON k.id = e.kid_id
      WHERE e.club_id = sports.club_id AND k.parent_id = auth.uid()
    )
  );

-- Super admin: read all
CREATE POLICY "super_admin_sports_select" ON sports
  FOR SELECT USING (is_super_admin());

-------------------------------------------------------------------
-- PLANS
-------------------------------------------------------------------
-- Club admin: full access via sport's club
CREATE POLICY "club_admin_plans_all" ON plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sports s
      WHERE s.id = plans.sport_id AND is_club_admin(s.club_id)
    )
  );

-- Parent: read plans in clubs their kids are in (for enrollment selection)
CREATE POLICY "parent_plans_select" ON plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sports s
      JOIN enrollments e ON e.club_id = s.club_id
      JOIN kids k ON k.id = e.kid_id
      WHERE s.id = plans.sport_id AND k.parent_id = auth.uid()
    )
    OR
    -- Also allow reading plans when accessing via invitation (no enrollment yet)
    EXISTS (
      SELECT 1 FROM sports s
      JOIN invitations i ON i.club_id = s.club_id
      WHERE s.id = plans.sport_id AND (i.email = (SELECT email FROM profiles WHERE id = auth.uid()))
    )
  );

-- Super admin: read all
CREATE POLICY "super_admin_plans_select" ON plans
  FOR SELECT USING (is_super_admin());

-------------------------------------------------------------------
-- ENROLLMENTS
-------------------------------------------------------------------
-- Parent: read and insert for own kids
CREATE POLICY "parent_enrollments_select" ON enrollments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM kids WHERE id = enrollments.kid_id AND parent_id = auth.uid())
  );

CREATE POLICY "parent_enrollments_insert" ON enrollments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM kids WHERE id = enrollments.kid_id AND parent_id = auth.uid())
  );

-- Club admin: full access for own club
CREATE POLICY "club_admin_enrollments_all" ON enrollments
  FOR ALL USING (is_club_admin(club_id));

-- Super admin: read all
CREATE POLICY "super_admin_enrollments_select" ON enrollments
  FOR SELECT USING (is_super_admin());

-------------------------------------------------------------------
-- INVOICES
-------------------------------------------------------------------
-- Parent: read own invoices
CREATE POLICY "parent_invoices_select" ON invoices
  FOR SELECT USING (parent_id = auth.uid());

-- Club admin: read and update invoices for their club
CREATE POLICY "club_admin_invoices_all" ON invoices
  FOR ALL USING (is_club_admin(club_id));

-- Super admin: read all
CREATE POLICY "super_admin_invoices_select" ON invoices
  FOR SELECT USING (is_super_admin());

-------------------------------------------------------------------
-- INVOICE ITEMS
-------------------------------------------------------------------
-- Parent: read own invoice items
CREATE POLICY "parent_invoice_items_select" ON invoice_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM invoices WHERE id = invoice_items.invoice_id AND parent_id = auth.uid())
  );

-- Club admin: read invoice items for their club
CREATE POLICY "club_admin_invoice_items_select" ON invoice_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_items.invoice_id AND is_club_admin(i.club_id)
    )
  );

-- Super admin: read all
CREATE POLICY "super_admin_invoice_items_select" ON invoice_items
  FOR SELECT USING (is_super_admin());

-------------------------------------------------------------------
-- PAYMENTS
-------------------------------------------------------------------
-- Parent: read own payments
CREATE POLICY "parent_payments_select" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM invoices WHERE id = payments.invoice_id AND parent_id = auth.uid()
    )
  );

-- Club admin: read and insert payments for their club (mark bank transfers)
CREATE POLICY "club_admin_payments_all" ON payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = payments.invoice_id AND is_club_admin(i.club_id)
    )
  );

-- Super admin: read all
CREATE POLICY "super_admin_payments_select" ON payments
  FOR SELECT USING (is_super_admin());

-------------------------------------------------------------------
-- DISCOUNTS
-------------------------------------------------------------------
-- Club admin: full access for own club
CREATE POLICY "club_admin_discounts_all" ON discounts
  FOR ALL USING (is_club_admin(club_id));

-- Parent: read discounts that apply to them or their kids
CREATE POLICY "parent_discounts_select" ON discounts
  FOR SELECT USING (
    parent_id = auth.uid()
    OR EXISTS (SELECT 1 FROM kids WHERE id = discounts.kid_id AND parent_id = auth.uid())
  );

-- Super admin: read all
CREATE POLICY "super_admin_discounts_select" ON discounts
  FOR SELECT USING (is_super_admin());

-------------------------------------------------------------------
-- NOTIFICATIONS
-------------------------------------------------------------------
-- Parent: read own notifications
CREATE POLICY "parent_notifications_select" ON notifications
  FOR SELECT USING (parent_id = auth.uid());

-- Super admin: read all
CREATE POLICY "super_admin_notifications_select" ON notifications
  FOR SELECT USING (is_super_admin());

-------------------------------------------------------------------
-- PLATFORM BILLING
-------------------------------------------------------------------
-- Super admin only
CREATE POLICY "super_admin_platform_billing_all" ON platform_billing
  FOR ALL USING (is_super_admin());

-- Club admin: read own club's billing
CREATE POLICY "club_admin_platform_billing_select" ON platform_billing
  FOR SELECT USING (is_club_admin(club_id));

-------------------------------------------------------------------
-- INVITATIONS
-------------------------------------------------------------------
-- Club admin: full access for own club
CREATE POLICY "club_admin_invitations_all" ON invitations
  FOR ALL USING (is_club_admin(club_id));

-- Anyone can read invitations by token (for accepting — done via RPC function instead)
-- Parent: read invitations sent to their email
CREATE POLICY "parent_invitations_select" ON invitations
  FOR SELECT USING (
    email = (SELECT email FROM profiles WHERE id = auth.uid())
    OR phone = (SELECT phone FROM profiles WHERE id = auth.uid())
  );

-- Super admin: read all
CREATE POLICY "super_admin_invitations_select" ON invitations
  FOR SELECT USING (is_super_admin());

-------------------------------------------------------------------
-- CLUB ADMINS
-------------------------------------------------------------------
-- Super admin: full access
CREATE POLICY "super_admin_club_admins_all" ON club_admins
  FOR ALL USING (is_super_admin());

-- Club admin: read own club's admins
CREATE POLICY "club_admin_club_admins_select" ON club_admins
  FOR SELECT USING (is_club_admin(club_id));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00014_create_rls_policies.sql
git commit -m "feat: add RLS policies for multi-tenant data isolation"
```

---

### Task 7: RUT Validation Utility

**Files:**
- Create: `src/lib/rut/validate.ts`
- Create: `__tests__/lib/rut/validate.test.ts`

- [ ] **Step 1: Write failing tests for RUT validation**

Create `__tests__/lib/rut/validate.test.ts`:
```typescript
import { validateRut, formatRut, cleanRut } from "@/lib/rut/validate";

describe("cleanRut", () => {
  it("removes dots and dashes", () => {
    expect(cleanRut("12.345.678-5")).toBe("123456785");
  });

  it("removes spaces", () => {
    expect(cleanRut("12 345 678 5")).toBe("123456785");
  });

  it("handles already clean input", () => {
    expect(cleanRut("123456785")).toBe("123456785");
  });
});

describe("validateRut", () => {
  it("returns true for valid RUT 12.345.678-5", () => {
    expect(validateRut("12.345.678-5")).toBe(true);
  });

  it("returns true for valid RUT 7.654.321-K", () => {
    expect(validateRut("7.654.321-K")).toBe(true);
  });

  it("returns true for valid RUT with lowercase k", () => {
    expect(validateRut("7.654.321-k")).toBe(true);
  });

  it("returns true for valid RUT without formatting", () => {
    expect(validateRut("123456785")).toBe(true);
  });

  it("returns false for invalid check digit", () => {
    expect(validateRut("12.345.678-0")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(validateRut("")).toBe(false);
  });

  it("returns false for too short input", () => {
    expect(validateRut("123")).toBe(false);
  });

  it("returns false for non-numeric body", () => {
    expect(validateRut("abc-5")).toBe(false);
  });
});

describe("formatRut", () => {
  it("formats a clean RUT with dots and dash", () => {
    expect(formatRut("123456785")).toBe("12.345.678-5");
  });

  it("formats a RUT with K", () => {
    expect(formatRut("7654321K")).toBe("7.654.321-K");
  });

  it("handles already formatted input", () => {
    expect(formatRut("12.345.678-5")).toBe("12.345.678-5");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx jest __tests__/lib/rut/validate.test.ts --no-cache
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement RUT validation**

Create `src/lib/rut/validate.ts`:
```typescript
/**
 * Chilean RUT validation using the modulo 11 algorithm.
 *
 * RUT format: XX.XXX.XXX-V where V is the verification digit (0-9 or K).
 */

export function cleanRut(rut: string): string {
  return rut.replace(/[\.\-\s]/g, "").toUpperCase();
}

export function validateRut(rut: string): boolean {
  const cleaned = cleanRut(rut);

  if (cleaned.length < 7 || cleaned.length > 9) {
    return false;
  }

  const body = cleaned.slice(0, -1);
  const providedDigit = cleaned.slice(-1);

  if (!/^\d+$/.test(body)) {
    return false;
  }

  const expectedDigit = calculateVerificationDigit(body);
  return providedDigit === expectedDigit;
}

function calculateVerificationDigit(body: string): string {
  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);

  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return remainder.toString();
}

export function formatRut(rut: string): string {
  const cleaned = cleanRut(rut);

  if (cleaned.length < 2) return cleaned;

  const body = cleaned.slice(0, -1);
  const digit = cleaned.slice(-1);

  // Add dots every 3 digits from right
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${formatted}-${digit}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx jest __tests__/lib/rut/validate.test.ts --no-cache
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rut/ __tests__/lib/rut/
git commit -m "feat: add Chilean RUT validation utility (modulo 11)"
```

---

### Task 8: Supabase Client Setup

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `src/types/index.ts`

- [ ] **Step 1: Create shared types**

Create `src/types/index.ts`:
```typescript
export type UserRole = "super_admin" | "club_admin" | "parent";

export type EnrollmentStatus = "active" | "paused" | "cancelled";

export type InvoiceStatus = "generated" | "pending" | "paid" | "overdue";

export type PaymentMethod = "card_automatic" | "card_link" | "bank_transfer";

export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export type DiscountType = "percentage" | "fixed_amount";

export type DiscountDuration = "one_time" | "n_months" | "until_removed";

export type NotificationChannel = "email" | "whatsapp";

export type NotificationType =
  | "reminder"
  | "confirmation"
  | "overdue"
  | "reward_message"
  | "invitation"
  | "invoice_pdf"
  | "receipt_pdf";
```

- [ ] **Step 2: Create browser Supabase client**

Create `src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: Create server Supabase client**

Create `src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Can be ignored in Server Components
          }
        },
      },
    }
  );
}
```

- [ ] **Step 4: Create middleware Supabase client helper**

Create `src/lib/supabase/middleware.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user, response: supabaseResponse };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/ src/types/
git commit -m "feat: add Supabase client setup (browser, server, middleware)"
```

---

### Task 9: Auth Middleware & Role-Based Routing

**Files:**
- Create: `src/middleware.ts`
- Create: `src/components/shared/auth-guard.tsx`
- Create: `src/components/shared/providers.tsx`

- [ ] **Step 1: Create Next.js middleware for auth and role routing**

Create `src/middleware.ts`:
```typescript
import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/", "/login", "/register", "/callback", "/invite"];

export async function middleware(request: NextRequest) {
  const { user, response, supabase } = await updateSession(request);
  const path = request.nextUrl.pathname;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    return response;
  }

  // Redirect unauthenticated users to login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  // Fetch user role from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // User exists in auth but no profile — redirect to complete registration
    if (!path.startsWith("/register")) {
      return NextResponse.redirect(new URL("/register/complete", request.url));
    }
    return response;
  }

  // Role-based route protection
  const role = profile.role;

  if (path.startsWith("/admin") && role !== "super_admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (path.startsWith("/club") && role !== "club_admin" && role !== "super_admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (path.startsWith("/app") && role !== "parent") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Create providers wrapper**

Create `src/components/shared/providers.tsx`:
```typescript
"use client";

import { type ReactNode } from "react";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return <>{children}</>;
}
```

- [ ] **Step 3: Create AuthGuard component**

Create `src/components/shared/auth-guard.tsx`:
```typescript
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types";

interface AuthGuardProps {
  children: ReactNode;
  requiredRole: UserRole;
}

export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== requiredRole) {
        router.push("/");
        return;
      }

      setAuthorized(true);
      setLoading(false);
    }

    checkAuth();
  }, [requiredRole, router, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!authorized) return null;

  return <>{children}</>;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts src/components/shared/
git commit -m "feat: add auth middleware with role-based routing and AuthGuard"
```

---

### Task 10: Auth Pages — Login & Register

**Files:**
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/register/page.tsx`
- Create: `src/app/(auth)/callback/route.ts`
- Create: `src/components/shared/rut-input.tsx`

- [ ] **Step 1: Create auth layout**

Create `src/app/(auth)/layout.tsx`:
```typescript
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary">SimplePAY</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create RUT input component**

Create `src/components/shared/rut-input.tsx`:
```typescript
"use client";

import { useState, type ChangeEvent } from "react";
import { validateRut, formatRut, cleanRut } from "@/lib/rut/validate";

interface RutInputProps {
  value: string;
  onChange: (value: string, isValid: boolean) => void;
  name?: string;
  placeholder?: string;
  required?: boolean;
}

export function RutInput({
  value,
  onChange,
  name = "rut",
  placeholder = "12.345.678-5",
  required = false,
}: RutInputProps) {
  const [touched, setTouched] = useState(false);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const cleaned = cleanRut(raw);

    // Format as user types
    const formatted = cleaned.length >= 2 ? formatRut(cleaned) : raw;
    const isValid = validateRut(cleaned);

    onChange(formatted, isValid);
  }

  const isValid = validateRut(value);
  const showError = touched && value.length > 0 && !isValid;

  return (
    <div>
      <input
        type="text"
        name={name}
        value={value}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        required={required}
        className={`w-full px-4 py-2.5 rounded-lg border bg-white text-text placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
          showError
            ? "border-danger focus:ring-danger/30"
            : "border-gray-200 focus:border-primary"
        }`}
      />
      {showError && (
        <p className="mt-1 text-sm text-danger">RUT inválido</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create login page**

Create `src/app/(auth)/login/page.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Email o contraseña incorrectos");
      setLoading(false);
      return;
    }

    router.push(redirect);
  }

  async function handleGoogleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback?redirect=${redirect}`,
      },
    });

    if (error) {
      setError("Error al iniciar sesión con Google");
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <h2 className="text-xl font-semibold text-text mb-6">Iniciar sesión</h2>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger-light text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-text placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            placeholder="tu@email.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-text placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-4">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-sm text-text-secondary">o</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <button
        onClick={handleGoogleLogin}
        className="w-full py-2.5 border border-gray-200 rounded-lg font-medium text-text hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Continuar con Google
      </button>

      <p className="mt-6 text-center text-sm text-text-secondary">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="text-primary font-medium hover:underline">
          Regístrate
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Create register page**

Create `src/app/(auth)/register/page.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { RutInput } from "@/components/shared/rut-input";
import { cleanRut } from "@/lib/rut/validate";

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: "",
    lastNames: "",
    rut: "",
    dateOfBirth: "",
    email: "",
    phone: "",
    password: "",
  });
  const [rutValid, setRutValid] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!rutValid) {
      setError("RUT inválido");
      return;
    }

    setLoading(true);

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (authError || !authData.user) {
      setError(authError?.message || "Error al crear la cuenta");
      setLoading(false);
      return;
    }

    // 2. Create profile
    const { error: profileError } = await supabase.from("profiles").insert({
      id: authData.user.id,
      name: form.name,
      last_names: form.lastNames,
      rut: cleanRut(form.rut),
      date_of_birth: form.dateOfBirth,
      email: form.email,
      phone: form.phone || null,
      role: "parent",
    });

    if (profileError) {
      setError("Error al guardar el perfil. El RUT ya podría estar registrado.");
      setLoading(false);
      return;
    }

    router.push("/app");
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <h2 className="text-xl font-semibold text-text mb-6">Crear cuenta</h2>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger-light text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleRegister} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Nombre
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Juan"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Apellidos
            </label>
            <input
              type="text"
              value={form.lastNames}
              onChange={(e) => updateField("lastNames", e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Pérez García"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            RUT
          </label>
          <RutInput
            value={form.rut}
            onChange={(value, isValid) => {
              updateField("rut", value);
              setRutValid(isValid);
            }}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Fecha de nacimiento
          </label>
          <input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => updateField("dateOfBirth", e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            placeholder="tu@email.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Teléfono
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            placeholder="+56 9 1234 5678"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Contraseña
          </label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => updateField("password", e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            placeholder="Mínimo 6 caracteres"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {loading ? "Creando cuenta..." : "Crear cuenta"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Create OAuth callback handler**

Create `src/app/(auth)/callback/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") || "/";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if profile exists
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .single();

        if (!profile) {
          // No profile yet — redirect to complete registration
          return NextResponse.redirect(
            `${origin}/register/complete?redirect=${redirect}`
          );
        }
      }

      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  // Something went wrong — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/\(auth\)/ src/components/shared/rut-input.tsx
git commit -m "feat: add auth pages — login, register with RUT validation, Google OAuth"
```

---

### Task 11: Portal Layouts (Shell)

**Files:**
- Create: `src/app/layout.tsx` (modify existing)
- Create: `src/app/(admin)/layout.tsx`
- Create: `src/app/(club)/layout.tsx`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/page.tsx` (modify existing)

- [ ] **Step 1: Update root layout**

Replace `src/app/layout.tsx`:
```typescript
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/shared/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SimplePAY",
  description: "Plataforma de pagos para academias deportivas",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#3B82F6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${inter.className} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Create landing/redirect page**

Replace `src/app/page.tsx`:
```typescript
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/register/complete");
  }

  switch (profile.role) {
    case "super_admin":
      redirect("/admin");
    case "club_admin":
      redirect("/club");
    case "parent":
      redirect("/app");
    default:
      redirect("/login");
  }
}
```

- [ ] **Step 3: Create super admin layout**

Create `src/app/(admin)/layout.tsx`:
```typescript
import type { ReactNode } from "react";
import { AuthGuard } from "@/components/shared/auth-guard";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin" },
  { label: "Clubes", href: "/admin/clubs" },
  { label: "Usuarios", href: "/admin/users" },
  { label: "Facturación", href: "/admin/billing" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard requiredRole="super_admin">
      <div className="min-h-screen bg-white flex">
        <aside className="w-60 bg-slate-50 border-r border-gray-200 p-6">
          <h1 className="text-lg font-bold text-primary mb-1">SimplePAY</h1>
          <p className="text-xs text-text-secondary mb-8">Super Admin</p>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="block px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-primary-light hover:text-primary transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
```

- [ ] **Step 4: Create club admin layout**

Create `src/app/(club)/layout.tsx`:
```typescript
import type { ReactNode } from "react";
import { AuthGuard } from "@/components/shared/auth-guard";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/club" },
  { label: "Deportistas", href: "/club/athletes" },
  { label: "Deportes", href: "/club/sports" },
  { label: "Planes", href: "/club/plans" },
  { label: "Cobros", href: "/club/billing" },
  { label: "Invitaciones", href: "/club/invitations" },
  { label: "Descuentos", href: "/club/discounts" },
  { label: "Configuración", href: "/club/settings" },
];

export default function ClubLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard requiredRole="club_admin">
      <div className="min-h-screen bg-white flex">
        <aside className="w-60 bg-slate-50 border-r border-gray-200 p-6">
          <h1 className="text-lg font-bold text-primary mb-1">SimplePAY</h1>
          <p className="text-xs text-text-secondary mb-8">Club Admin</p>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="block px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-primary-light hover:text-primary transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
```

- [ ] **Step 5: Create parent PWA layout**

Create `src/app/(app)/layout.tsx`:
```typescript
import type { ReactNode } from "react";
import { AuthGuard } from "@/components/shared/auth-guard";

const NAV_ITEMS = [
  { label: "Inicio", href: "/app" },
  { label: "Pagos", href: "/app/payments" },
  { label: "Hijos", href: "/app/kids" },
  { label: "Perfil", href: "/app/profile" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard requiredRole="parent">
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-1 p-4 pb-20 max-w-lg mx-auto w-full">
          {children}
        </main>
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-2 safe-bottom">
          <div className="flex justify-around max-w-lg mx-auto">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="flex flex-col items-center py-1 px-3 text-text-secondary hover:text-primary transition-colors"
              >
                <span className="text-xs mt-1">{item.label}</span>
              </a>
            ))}
          </div>
        </nav>
      </div>
    </AuthGuard>
  );
}
```

- [ ] **Step 6: Create placeholder pages for each portal**

Create `src/app/(admin)/admin/page.tsx`:
```typescript
export default function AdminDashboard() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-text">Dashboard — Super Admin</h2>
      <p className="text-text-secondary mt-2">Próximamente</p>
    </div>
  );
}
```

Create `src/app/(club)/club/page.tsx`:
```typescript
export default function ClubDashboard() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-text">Dashboard — Club Admin</h2>
      <p className="text-text-secondary mt-2">Próximamente</p>
    </div>
  );
}
```

Create `src/app/(app)/app/page.tsx`:
```typescript
export default function ParentDashboard() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-text">Inicio</h2>
      <p className="text-text-secondary mt-2">Próximamente</p>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/
git commit -m "feat: add portal layouts — admin sidebar, club sidebar, parent bottom nav"
```

---

### Task 12: Seed Data — Test Accounts & Sample Data

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: Create seed file with test accounts and sample data**

Create `supabase/seed.sql`:
```sql
-- ============================================================
-- SEED DATA: Test accounts + sample club/sport/plan/enrollment
-- Run with: npx supabase db reset (applies migrations + seed)
-- ============================================================

-- 1. Create test users in auth.users
-- Supabase local uses a special function for seeding auth users.
-- Passwords are all: test1234

INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'admin@simplepay.test',
    crypt('test1234', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{}', 'authenticated', 'authenticated'
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'club@simplepay.test',
    crypt('test1234', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{}', 'authenticated', 'authenticated'
  ),
  (
    'c0000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'parent@simplepay.test',
    crypt('test1234', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{}', 'authenticated', 'authenticated'
  )
ON CONFLICT (id) DO NOTHING;

-- Also insert into identities (required for email auth to work)
INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'admin@simplepay.test',
    'email',
    jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'email', 'admin@simplepay.test'),
    now(), now(), now()
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000002',
    'club@simplepay.test',
    'email',
    jsonb_build_object('sub', 'b0000000-0000-0000-0000-000000000002', 'email', 'club@simplepay.test'),
    now(), now(), now()
  ),
  (
    'c0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000003',
    'parent@simplepay.test',
    'email',
    jsonb_build_object('sub', 'c0000000-0000-0000-0000-000000000003', 'email', 'parent@simplepay.test'),
    now(), now(), now()
  )
ON CONFLICT (id) DO NOTHING;

-- 2. Create profiles for test users
INSERT INTO profiles (id, name, last_names, rut, date_of_birth, email, phone, role)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Admin', 'SimplePAY', '111111111', '1990-01-01', 'admin@simplepay.test', '+56912345678', 'super_admin'),
  ('b0000000-0000-0000-0000-000000000002', 'Carlos', 'González Muñoz', '123456785', '1985-06-15', 'club@simplepay.test', '+56987654321', 'club_admin'),
  ('c0000000-0000-0000-0000-000000000003', 'María', 'Pérez López', '76543210K', '1988-03-22', 'parent@simplepay.test', '+56911223344', 'parent')
ON CONFLICT (id) DO NOTHING;

-- 3. Create a sample club
INSERT INTO clubs (id, name, contact_email, contact_phone, billing_day, platform_fee_fixed, platform_fee_percent)
VALUES
  ('d0000000-0000-0000-0000-000000000004', 'Academia Deportiva Santiago', 'contacto@academiadep.cl', '+56922334455', 1, 50000, 2.50)
ON CONFLICT (id) DO NOTHING;

-- 4. Assign club admin to the club
INSERT INTO club_admins (club_id, profile_id)
VALUES ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002')
ON CONFLICT (club_id, profile_id) DO NOTHING;

-- 5. Create sample sports
INSERT INTO sports (id, club_id, name, description)
VALUES
  ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000004', 'Fútbol', 'Escuela de fútbol para niños y jóvenes'),
  ('e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000004', 'Natación', 'Clases de natación todos los niveles')
ON CONFLICT (id) DO NOTHING;

-- 6. Create sample plans
INSERT INTO plans (id, sport_id, name, description, price, frequency)
VALUES
  ('f0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000005', 'Fútbol 3x/semana', 'Entrena 3 veces por semana', 45000, '3x/semana'),
  ('f0000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000005', 'Fútbol 5x/semana', 'Entrena 5 veces por semana', 60000, '5x/semana'),
  ('f0000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000006', 'Natación 2x/semana', 'Clases 2 veces por semana', 30000, '2x/semana')
ON CONFLICT (id) DO NOTHING;

-- 7. Create sample kids
INSERT INTO kids (id, parent_id, name, last_names, rut, date_of_birth)
VALUES
  ('10000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000003', 'Juan', 'Pérez López', '223344556', '2015-08-10'),
  ('10000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000003', 'Sofía', 'Pérez López', '334455667', '2017-11-25')
ON CONFLICT (id) DO NOTHING;

-- 8. Create enrollments
INSERT INTO enrollments (kid_id, club_id, sport_id, plan_id, status)
VALUES
  ('10000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000007', 'active'),
  ('10000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000009', 'active'),
  ('10000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000008', 'active')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Run seed to populate database**

Run:
```bash
npx supabase db reset
```
Expected: Migrations applied, seed data loaded. Output shows "Seeding data from supabase/seed.sql".

- [ ] **Step 3: Verify test accounts work**

Run:
```bash
npm run dev
```

Test each account at `http://localhost:3000/login`:

| Email | Password | Expected redirect |
|-------|----------|-------------------|
| `admin@simplepay.test` | `test1234` | `/admin` — Super Admin dashboard |
| `club@simplepay.test` | `test1234` | `/club` — Club Admin dashboard |
| `parent@simplepay.test` | `test1234` | `/app` — Parent dashboard |

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: add seed data with test accounts and sample club/sport/plan data"
```

---

### Task 13: Verify Full Setup

- [ ] **Step 1: Run build to verify no TypeScript errors**

Run:
```bash
npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 2: Run tests**

Run:
```bash
npm test
```
Expected: RUT validation tests pass.

- [ ] **Step 3: Start dev server and verify pages load**

Run:
```bash
npm run dev
```

Verify manually:
- `http://localhost:3000` → redirects to `/login`
- `http://localhost:3000/login` → login page renders with blue/white theme
- `http://localhost:3000/register` → register page renders with RUT input

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: foundation complete — project setup, schema, auth, layouts"
```
