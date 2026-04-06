# Email Notifications via Resend — Design Spec

_Date: 2026-04-06_

## Overview

Add transactional email notifications to CluPay using Resend. This completes Phase 1 (Core Loop) by connecting the existing invoice generation, approval, payment, and invitation flows to email delivery.

## Goals

- Parents receive timely emails for invitations, invoices, reminders, overdue alerts, and payment confirmations
- Club admins trigger emails implicitly through existing actions (invite, approve, mark paid)
- Notifications are logged in the `notifications` table for audit and deduplication
- No schema changes required — uses existing `notifications` table and `notification_type` enum

## Architecture

### Two Sending Paths

**Immediate emails** — triggered by user actions via Next.js Server Actions:

| Trigger | Action | Email type |
|---------|--------|------------|
| Club admin sends invitation | `send-invitation` server action | Invitation with `/invite/{token}` link |
| Club admin approves invoice (single or bulk) | `approve-invoice` server action | Invoice ready notification |
| Club admin marks invoice as paid | `mark-invoice-paid` server action | Payment confirmation |

**Scheduled emails** — triggered by daily cron job (extends existing `generate-invoices` cron):

| Trigger | Condition | Email type |
|---------|-----------|------------|
| Payment reminder | `pending` invoices with `due_date = today + 3 days` | Reminder |
| Overdue alert | `overdue` invoices with `due_date` exactly 1, 3, or 7 days ago | Overdue |
| Auto-approved invoices | Invoices created with `status = 'pending'` by auto-approve | Invoice ready |

### Component Map

| Component | Location | Purpose |
|-----------|----------|---------|
| Resend client | `src/lib/email/resend.ts` | Singleton Resend client + `sendEmail()` wrapper |
| Email templates | `src/lib/email/templates.ts` | HTML builder with CluPay branding + per-type builders |
| Notification sender | `src/lib/email/send-notification.ts` | Send email + log to `notifications` table |
| Invitation action | `src/lib/actions/send-invitation.ts` | Server action: insert invitation + send email |
| Approve action | `src/lib/actions/approve-invoice.ts` | Server action: approve invoice(s) + send email |
| Mark paid action | `src/lib/actions/mark-invoice-paid.ts` | Server action: RPC call + send email |
| Notification cron | `src/lib/notification-cron.ts` | Reminder + overdue logic for cron job |

## Email Infrastructure

### Resend Client (`src/lib/email/resend.ts`)

Resend client singleton. Exports `sendEmail(to, subject, html)` that wraps `resend.emails.send()` with the default `from` address. The `from` address is configurable via `RESEND_FROM_EMAIL` env var, defaulting to `CluPay <onboarding@resend.dev>`.

### Email Templates (`src/lib/email/templates.ts`)

Plain HTML with inline CSS (email client compatibility). No external dependencies.

**`buildEmailHtml(content)`** — wraps any content in the CluPay email layout:

- **Header**: blue bar (`#3B82F6`) with white "CluPay" text
- **Body**: white card with title, body text (supports inline HTML), optional CTA button (blue `#3B82F6`, rounded)
- **Footer**: muted gray text — "CluPay — Plataforma de pagos para clubes deportivos"

**Per-type builder functions:**

| Function | Subject | Body summary |
|----------|---------|--------------|
| `invitationEmail(clubName, token, appUrl)` | `{clubName} te invita a CluPay` | Invitation message + CTA to `/invite/{token}` |
| `invoiceReadyEmail(clubName, total, dueDate, appUrl)` | `Nueva factura de {clubName}` | New invoice details + CTA to `/app` |
| `paymentConfirmationEmail(clubName, total, periodLabel)` | `Pago confirmado — {clubName}` | Payment recorded confirmation |
| `paymentReminderEmail(clubName, total, dueDate, appUrl)` | `Recordatorio: factura por vencer — {clubName}` | Upcoming due date + CTA to `/app` |
| `overdueAlertEmail(clubName, total, daysOverdue, appUrl)` | `Factura vencida — {clubName}` | Overdue notice with days count + CTA to `/app` |

### Notification Sender (`src/lib/email/send-notification.ts`)

Core orchestrator:

```typescript
async function sendNotification(params: {
  supabase: SupabaseClient;
  parentId: string;
  clubId: string;
  email: string;
  type: NotificationType;
  subject: string;
  html: string;
  metadata?: Record<string, unknown>;
}): Promise<void>
```

1. Send email via `sendEmail()`
2. Insert row into `notifications` with `status: 'sent'`, `sent_at: now()`
3. On Resend failure: insert with `status: 'failed'`, log error, **do not throw** — email failure must not break the parent DB operation

## Server Actions

### `src/lib/actions/send-invitation.ts`

Replaces client-side `supabase.from("invitations").insert(...)` in `invitation-form.tsx`.

1. Authenticate user via server-side Supabase client
2. Insert into `invitations` table
3. Read back the generated `token`
4. Fetch club name from `clubs`
5. Build `invitationEmail(clubName, token, appUrl)`
6. Call `sendNotification()` with `type: 'invitation'`, `metadata: { invitation_id, token }`
7. Return `{ success: true }` or `{ error: string }`

**`invitation-form.tsx` changes**: Import and call the server action instead of using client-side Supabase. Remove `createClient` import.

### `src/lib/actions/approve-invoice.ts`

Replaces client-side update in `approve-invoice-button.tsx`.

**Single approve:**
1. Update invoice `status` to `'pending'`
2. Fetch invoice details: parent email (from `profiles`), club name, total, due_date
3. Build `invoiceReadyEmail(clubName, total, dueDate, appUrl)`
4. Call `sendNotification()` with `type: 'confirmation'`, `metadata: { invoice_id, event: 'invoice_ready' }`
5. Return `{ success: true }` or `{ error: string }`

**Bulk approve (`bulkApproveInvoices(invoiceIds)`):**
1. Update all invoices to `'pending'`
2. Fetch invoice details grouped by parent
3. Send one email per parent (not per invoice) — if a parent has multiple invoices in the batch, list them all in one email
4. Call `sendNotification()` for each parent
5. Return `{ success: true, approved: number }` or `{ error: string }`

### `src/lib/actions/mark-invoice-paid.ts`

Replaces client-side RPC call in `mark-paid-button.tsx`.

1. Call `mark_invoice_paid` RPC via service role client
2. Fetch invoice details: parent email, club name, total, period_month/period_year
3. Build `paymentConfirmationEmail(clubName, total, periodLabel)`
4. Call `sendNotification()` with `type: 'confirmation'`, `metadata: { invoice_id, event: 'payment_confirmed' }`
5. Return `{ success: true }` or `{ error: string }`

### Auth Pattern

- Server actions use `createServerClient()` (from `src/lib/supabase/server.ts`) for authenticated user context
- Email sending and cross-RLS data reads use `createServiceRoleClient()` (from `src/lib/supabase/service.ts`)

## Cron Extension

### `src/lib/notification-cron.ts`

Exports `processNotifications(supabase: SupabaseClient)`, called from the existing cron route after `generateInvoices()`.

**Payment reminders (3 days before due):**
1. Query `invoices` where `status = 'pending'` AND `due_date = today + 3 days`
2. For each, check `notifications` for existing row with `type = 'reminder'` + `metadata->invoice_id` match — skip if found
3. Fetch parent emails + club names in batch queries (not N+1)
4. Send `paymentReminderEmail()` via `sendNotification()`

**Overdue alerts (1, 3, 7 days after due):**
1. Query `invoices` where `status = 'overdue'` AND `due_date` is exactly 1, 3, or 7 days ago
2. For each, check `notifications` for existing row with `type = 'overdue'` + `metadata->invoice_id` + `metadata->days_overdue` — skip if found
3. Send `overdueAlertEmail()` via `sendNotification()`

**Auto-approved invoice emails:**
- `generateInvoices()` is modified to return the list of auto-approved invoice IDs
- The cron route passes these IDs to a function that sends invoice-ready emails for each
- Same `invoiceReadyEmail()` template as manual approval

**Batching:**
- One query per notification tier (reminders, overdue-1, overdue-3, overdue-7)
- Parent emails fetched in a single `profiles` query per batch
- Club names cached in `Map<clubId, string>` within the run

### Cron Route Changes

```typescript
// src/app/api/cron/generate-invoices/route.ts
const invoiceResult = await generateInvoices(supabase);
const notificationResult = await processNotifications(supabase, {
  autoApprovedInvoiceIds: invoiceResult.auto_approved_invoice_ids,
});

return NextResponse.json({
  ...invoiceResult,
  notifications: notificationResult,
});
```

## Data Model

### `notifications` table — no changes needed

| Column | Usage |
|--------|-------|
| `parent_id` | Recipient |
| `club_id` | Club that triggered the notification |
| `channel` | Always `'email'` |
| `type` | Enum: `invitation`, `reminder`, `confirmation`, `overdue` |
| `subject` | Email subject line |
| `body` | Full HTML (for audit/resend capability) |
| `scheduled_at` | Defaults to `now()` — we send immediately |
| `sent_at` | Timestamp of successful delivery |
| `status` | `'sent'` or `'failed'` |
| `metadata` | JSONB for deduplication context: `{ invoice_id, days_overdue, event, token }` |

### `notification_type` enum mapping

| Email | Enum value | Disambiguator |
|-------|------------|---------------|
| Invitation | `invitation` | — |
| Invoice ready | `confirmation` | `metadata.event = 'invoice_ready'` |
| Payment reminder | `reminder` | — |
| Overdue alert | `overdue` | `metadata.days_overdue` |
| Payment confirmation | `confirmation` | `metadata.event = 'payment_confirmed'` |

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `RESEND_API_KEY` | Yes | — |
| `RESEND_FROM_EMAIL` | No | `CluPay <onboarding@resend.dev>` |

Added to `.env.example` as placeholders.

## Out of Scope

- React Email / rich templates (Phase 2 with PDF work)
- Custom domain setup (operational configuration, not code)
- WhatsApp notifications (future)
- Retry logic for failed emails (log as `failed`, can add retry later)
- Email preferences / unsubscribe (feature gap, not Phase 1)
- Email for manually-created invoices outside of cron (not a current flow)
