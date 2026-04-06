# SimplePAY — Product Design Spec

## Overview

SimplePAY is a payment and collections platform for sports academies/clubs in Chile. It simplifies how clubs charge parents and how parents pay for their kids' activities.

**Target market:** Chilean sports academies and clubs
**Language:** Spanish only
**Currency:** Chilean Pesos (CLP)

## Users & Portals

Three distinct portals, all served from a single Next.js application:

| Portal | User | Platform | Route Group |
|--------|------|----------|-------------|
| Super Admin | App owners | Web (desktop) | `/admin/*` |
| Club Admin | Academy/club owners | Web (desktop-first) | `/club/*` |
| Parent | Parents of athletes | PWA (mobile-first) | `/app/*` |

## Data Model

### Entities & Relationships

```
Parent
  - name, last_names, rut (validated), date_of_birth, email, phone
  - auth via Supabase Auth (email+password or Google OAuth)
  - has many → Kid
  - receives → Invoice

Kid
  - name, last_names, rut (validated), date_of_birth
  - belongs to → Parent
  - has many → Enrollment (joins clubs via invitation)

Club
  - name, logo, contact info
  - has many → ClubAdmin (users with club_admin role)
  - has many → Sport
  - has many → ClubMember (kids enrolled)
  - has config → platform_fee_fixed (CLP), platform_fee_percent (%)
  - club_id used as tenant column across all tables

Sport (Activity)
  - name, description
  - belongs to → Club
  - has many → Plan

Plan
  - name, description, price (CLP), frequency (e.g., "3x/semana")
  - belongs to → Sport

Enrollment
  - links Kid → Sport → Plan (within a club)
  - a kid can have multiple enrollments in the same club (different sports/plans)
  - status: active, paused, cancelled

Invoice
  - belongs to → Parent
  - belongs to → Club
  - one invoice per parent per club per billing period
  - has many → InvoiceItem (one per kid/enrollment)
  - has → discount applied (if any)
  - status: generated, pending, paid, overdue
  - linked to → Payment (Flow.cl transaction)
  - PDF generated and stored in Supabase Storage

InvoiceItem
  - belongs to → Invoice
  - references → Kid, Sport, Plan
  - amount (CLP), discount_amount (CLP)

Payment
  - belongs to → Invoice
  - method: card_automatic, card_link, bank_transfer
  - flow_transaction_id (for Flow.cl payments)
  - amount, paid_at, status

Discount
  - assigned by → ClubAdmin
  - applies to → Kid or Parent (within a club)
  - type: percentage or fixed_amount
  - value: number
  - duration: one_time, N months, until_removed
  - Only manually assigned by club admin — never automatic

Notification
  - belongs to → Parent
  - channel: email (MVP), whatsapp (future)
  - type: reminder, confirmation, overdue, reward_message, invitation
  - scheduled_at, sent_at, status

PlatformBilling
  - belongs to → Club
  - period (month/year)
  - fixed_fee (CLP), commission_percent, commission_amount
  - total_collected, platform_revenue
```

### Multi-tenancy

Single database with `club_id` tenant column. Supabase Row-Level Security (RLS) policies enforce data isolation:

- **Parent**: sees only their own kids, invoices, payments
- **Club Admin**: sees only their club's data (athletes, invoices, plans, sports)
- **Super Admin**: bypasses RLS, sees all data platform-wide

## Invitation & Registration Flow

1. **Club admin enters parent's email or phone** → invitation sent (email, WhatsApp later)
2. **Parent receives invitation** with a link to join the club
3. **Parent opens link:**
   - **New user** → Register: name, last names, RUT (validated with check digit), date of birth, email, phone. Option to sign up with Google (Google handles authentication only — profile fields like RUT and date of birth are still required on first login).
   - **Existing user** → Logs in (or already logged in)
4. **Add kid** → Parent adds the kid joining this club: name, last names, RUT (validated), date of birth. Or selects an existing kid if already registered.
5. **Select sport + plan** → Parent browses the club's available sports and picks a plan for the kid
6. **Choose payment method** → Card (automatic recurring via Flow.cl) or bank transfer
7. **Confirm & pay** → First payment processed, kid is enrolled

**Target:** Entire flow completable in under 2 minutes.

### RUT Validation

Chilean RUT validation using the modulo 11 algorithm. Validated on the frontend in real-time as the user types, with the verification digit (dígito verificador) checked before form submission.

## Payment & Billing Engine

### Invoice Generation

- Cron job (Supabase Edge Function) runs on a configurable day per club (e.g., 1st of each month)
- For each club, generates one invoice per parent aggregating all their kids' enrollments
- Active discounts are applied at generation time, reducing the relevant line items
- Invoice PDF is generated and stored in Supabase Storage
- PDF sent to parent via email

### Payment Methods

| Method | How it works | Status tracking |
|--------|-------------|-----------------|
| **Card (automatic)** | Recurring charge via Flow.cl. Parent sets up card once. | Automatic via Flow.cl webhooks |
| **Payment link** | One-time link sent to parent for a specific invoice | Automatic via Flow.cl webhooks |
| **Bank transfer** | Parent transfers manually, club admin marks as paid | Manual by club admin |

### Invoice/Payment Status Flow

```
generated → pending → paid
                   → overdue → paid (late)
```

- `generated`: Invoice created, not yet due
- `pending`: Due date reached, not yet paid
- `paid`: Payment confirmed (automatic or manual)
- `overdue`: Past due date, still unpaid (triggers escalating notifications)

### PDF Documents

Two PDF moments, both viewable/downloadable in app and sent via email:

1. **Invoice PDF (before payment):** Breakdown per kid/sport/plan, discounts, total due, due date
2. **Receipt PDF (after payment):** Same breakdown + payment method, transaction ID, date paid

### Platform Fees (SimplePAY Revenue Model)

- **Fixed monthly fee per club** — configurable per club by super admin
- **Commission percentage** on payments collected through the platform — configurable per club
- Tracked in `platform_billing` table, visible to super admin

## Notification System

### Channels

- **Email (MVP):** via Resend — transactional emails for all notification types
- **WhatsApp (future):** via Twilio Business API — same notification types, plugged into the same system

### Notification Types & Timing

| Trigger | Timing | Example |
|---------|--------|---------|
| Payment reminder | 3 days before due | "Tu pago de $127.500 vence el 05 de Mayo" |
| Due date reminder | Day of due date | "Hoy vence tu pago de $127.500. Paga ahora" |
| Payment confirmation | Immediately after payment | "Pago recibido: $127.500. Gracias!" |
| Overdue alert | 1, 3, 7 days after missed | "Tu pago está atrasado. Regulariza tu situación" |
| Reward message | After on-time payment | "Excelente, llevas 3 meses pagando puntual" |
| Invitation | When admin invites parent | "Te han invitado a unirte a [Club Name]" |
| Invoice PDF | At invoice generation | Attached PDF with invoice details |
| Receipt PDF | After payment | Attached PDF with receipt |

### Implementation

- `notifications` queue table with `scheduled_at` timestamps
- Supabase Edge Function cron job checks the queue and sends pending notifications
- Designed with a channel abstraction so WhatsApp can be plugged in without restructuring

## Rewards & Incentives

### Automated Messages

Based on payment behavior — no admin intervention needed:

- On-time payment streaks calculated from payment history (not stored separately)
- Messages sent as part of the payment confirmation flow
- Examples: "Estás al día", "Excelente, llevas 3 meses pagando puntual"

### Manual Discounts

Assigned exclusively by club admin to specific kids or parents:

- **Percentage discount** (e.g., 10% off)
- **Fixed amount discount** (e.g., $5.000 off)
- **Duration:** one-time, N months, or until manually removed
- Applied at invoice generation time
- No automatic discount rules — admin always decides

## Portal Screens

### Parent Portal (PWA — Mobile-first)

- **Home/Dashboard:** Next payment amount, due date, status badge (al día/pendiente/atrasado), "Pagar Ahora" button
- **Payment History:** List of past invoices by club, status badges, PDF download
- **My Kids:** Each kid with their clubs, sports, plans. Add kid or join new club.
- **Profile:** Personal info, payment methods, notification preferences
- **Bottom navigation:** Inicio, Pagos, Hijos, Perfil

### Club Admin Portal (Web — Desktop-first)

- **Dashboard:** KPIs (total athletes, % al día, overdue count, monthly revenue)
- **Athletes (Deportistas):** Filterable table by sport/status. Click for detail: parent info, payment history, assign discount
- **Sports (Deportes):** CRUD for sports/activities within the club
- **Plans (Planes):** CRUD for plans within each sport (name, price, frequency)
- **Billing (Cobros):** Monthly overview (collected vs pending), generate invoices, send payment links, mark bank transfers as paid
- **Invitations:** Enter parent email/phone to send invitation
- **Discounts:** Manage active discounts per kid/parent
- **Config:** Club info, billing day, notification settings
- **Sidebar navigation**

### Super Admin Portal (Web — Desktop)

- **Dashboard:** Platform-wide KPIs (total clubs, athletes, revenue collected)
- **Clubs:** CRUD for clubs, assign club admins, configure billing rates (fixed fee + commission %)
- **Users:** View all users across the platform
- **Platform Billing:** Revenue per club, fees collected
- **Sidebar navigation**

## Visual Design

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| Primary Blue | #3B82F6 | CTAs, active states, links |
| Light Blue | #EFF6FF | Tags, badges, secondary buttons |
| Background | #F0F7FF | Page backgrounds (parent PWA) |
| White | #FFFFFF | Cards, content areas |
| Text | #1e293b | Primary text |
| Text Secondary | #64748B | Labels, descriptions |
| Success | #22C55E | Paid status, positive metrics |
| Warning | #F59E0B | Pending status |
| Danger | #EF4444 | Overdue status, errors |

### Design Principles

- Light, airy aesthetic — white and light blue dominant
- Blue used sparingly for accents and CTAs only
- Consistent style across all three portals
- Mobile-first for parent portal, desktop-first for admin portals
- Status badges with colored backgrounds (green/yellow/red on matching light tints)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js (React), TypeScript |
| Styling | Tailwind CSS |
| Backend/DB | Supabase (PostgreSQL, Auth, Edge Functions, Storage) |
| Auth | Supabase Auth (email+password, Google OAuth) |
| Payments | Flow.cl (cards, bank transfers, recurring) |
| Email | Resend |
| WhatsApp (future) | Twilio Business API |
| PDF Generation | @react-pdf/renderer or jspdf |
| Hosting | Vercel |
| PWA | next-pwa |

## Architecture

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
│  │ + RLS  │ │ PG  │ │ Webhooks  │ │ PDFs     │ │
│  └────────┘ └─────┘ └───────────┘ └──────────┘ │
├─────────────────────────────────────────────────┤
│              External Services                   │
│  ┌─────────┐ ┌────────┐ ┌────────────────────┐  │
│  │ Flow.cl │ │ Resend │ │ Twilio (WhatsApp)  │  │
│  │ Payments│ │ Email  │ │ Future             │  │
│  └─────────┘ └────────┘ └────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Project Structure

Single Next.js app with route groups, organized for future separation:

```
src/
  app/
    (admin)/          # Super admin portal routes
    (club)/           # Club admin portal routes
    (app)/            # Parent PWA routes
    (auth)/           # Shared auth pages (login, register, invite)
    api/              # API routes & webhooks
  components/
    shared/           # Shared UI components
    admin/            # Super admin components
    club/             # Club admin components
    app/              # Parent portal components
  lib/
    supabase/         # Supabase client, types, queries
    flow/             # Flow.cl integration
    notifications/    # Notification service (email, future WhatsApp)
    pdf/              # PDF generation
    rut/              # RUT validation utility
    billing/          # Invoice generation, payment processing
  types/              # Shared TypeScript types
```

## Scope: MVP vs Future

### MVP (v1)

- All three portals with core screens
- Registration & invitation flow
- Payment via Flow.cl (card + bank transfer + payment link)
- Invoice generation with PDF
- Receipt PDF after payment
- Email notifications (Resend)
- Reward messages (automated on-time streaks)
- Manual discounts by club admin
- Google OAuth + email/password auth
- RUT validation (modulo 11)
- Platform billing tracking (fixed fee + commission)

### Future (v2+)

- WhatsApp notifications via Twilio
- Turborepo monorepo split (if scale demands it)
- Advanced analytics/reporting for club admins
- Parent mobile app (native, if PWA proves insufficient)
- Multi-currency / multi-language
- Automated discount rules
- Payment plan / installment support
