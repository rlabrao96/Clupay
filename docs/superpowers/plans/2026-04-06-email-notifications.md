# Email Notifications via Resend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transactional email notifications via Resend for invitations, invoice approval, payment confirmation, reminders, and overdue alerts.

**Architecture:** Two sending paths — Server Actions for immediate emails triggered by user actions (invite, approve, mark paid), and an extended daily cron job for scheduled emails (reminders 3 days before due, overdue alerts at 1/3/7 days). All emails are logged to the existing `notifications` table. Plain HTML templates with CluPay branding.

**Tech Stack:** Resend (`resend` npm package), Next.js 16 Server Functions (`"use server"`), existing Supabase service role client, Jest for tests.

**Spec:** `docs/superpowers/specs/2026-04-06-email-notifications-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/email/resend.ts` | Create | Resend client singleton + `sendEmail()` wrapper |
| `src/lib/email/templates.ts` | Create | HTML email layout + 5 per-type builder functions |
| `src/lib/email/send-notification.ts` | Create | Send email + log to `notifications` table |
| `src/lib/actions/send-invitation.ts` | Create | Server action: insert invitation + send email |
| `src/lib/actions/approve-invoice.ts` | Create | Server action: approve invoice(s) + send email |
| `src/lib/actions/mark-invoice-paid.ts` | Create | Server action: mark paid RPC + send email |
| `src/lib/notification-cron.ts` | Create | Cron: reminders, overdue alerts, auto-approve emails |
| `src/lib/invoice-generation.ts` | Modify | Return auto-approved invoice IDs |
| `src/app/api/cron/generate-invoices/route.ts` | Modify | Call `processNotifications()` after invoice generation |
| `src/components/club/invitation-form.tsx` | Modify | Use server action instead of client-side Supabase |
| `src/components/club/approve-invoice-button.tsx` | Modify | Use server action instead of client-side Supabase |
| `src/app/(club)/club/cobros/bulk-approve-button.tsx` | Modify | Use server action instead of client-side Supabase |
| `src/components/club/mark-paid-button.tsx` | Modify | Use server action instead of client-side Supabase |
| `.env.example` | Modify | Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` |
| `__tests__/lib/email/templates.test.ts` | Create | Tests for HTML template builders |
| `__tests__/lib/email/send-notification.test.ts` | Create | Tests for notification sender (mocked Resend) |
| `__tests__/lib/notification-cron.test.ts` | Create | Tests for cron notification logic (mocked Supabase) |

---

### Task 1: Install Resend + Environment Setup

**Files:**
- Modify: `.env.example`
- Modify: `.env.local` (not committed)

- [ ] **Step 1: Install resend package**

Run: `npm install resend`

- [ ] **Step 2: Add env vars to `.env.example`**

Add these lines at the end of `.env.example`:

```
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=CluPay <onboarding@resend.dev>
```

- [ ] **Step 3: Add actual key to `.env.local`**

Add to `.env.local`:

```
RESEND_API_KEY=re_7WyEZWSM_MwqmNMdtcqiM3NM9EEov87Rw
RESEND_FROM_EMAIL=CluPay <onboarding@resend.dev>
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add resend package and env vars"
```

---

### Task 2: Resend Client (`src/lib/email/resend.ts`)

**Files:**
- Create: `src/lib/email/resend.ts`

- [ ] **Step 1: Create the Resend client module**

```typescript
// src/lib/email/resend.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_FROM = "CluPay <onboarding@resend.dev>";

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;

  const { error } = await resend.emails.send({ from, to, subject, html });

  if (error) {
    console.error("Resend error:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/email/resend.ts
git commit -m "feat(email): add Resend client wrapper"
```

---

### Task 3: Email Templates (`src/lib/email/templates.ts`)

**Files:**
- Create: `src/lib/email/templates.ts`
- Create: `__tests__/lib/email/templates.test.ts`

- [ ] **Step 1: Write failing tests for templates**

```typescript
// __tests__/lib/email/templates.test.ts
import {
  buildEmailHtml,
  invitationEmail,
  invoiceReadyEmail,
  paymentConfirmationEmail,
  paymentReminderEmail,
  overdueAlertEmail,
} from "@/lib/email/templates";

describe("buildEmailHtml", () => {
  it("wraps content in CluPay branded layout", () => {
    const html = buildEmailHtml({
      title: "Test Title",
      body: "<p>Test body</p>",
    });
    expect(html).toContain("CluPay");
    expect(html).toContain("#3B82F6");
    expect(html).toContain("Test Title");
    expect(html).toContain("<p>Test body</p>");
    expect(html).toContain("Plataforma de pagos para clubes deportivos");
  });

  it("includes CTA button when provided", () => {
    const html = buildEmailHtml({
      title: "Title",
      body: "Body",
      ctaText: "Click me",
      ctaUrl: "https://example.com",
    });
    expect(html).toContain("Click me");
    expect(html).toContain("https://example.com");
  });

  it("omits CTA button when not provided", () => {
    const html = buildEmailHtml({ title: "Title", body: "Body" });
    expect(html).not.toContain("<!--cta-->");
  });
});

describe("invitationEmail", () => {
  it("returns subject and html with club name and invite link", () => {
    const result = invitationEmail("Club Deportivo", "abc123", "https://app.clupay.cl");
    expect(result.subject).toBe("Club Deportivo te invita a CluPay");
    expect(result.html).toContain("Club Deportivo");
    expect(result.html).toContain("https://app.clupay.cl/invite/abc123");
    expect(result.html).toContain("Aceptar invitación");
  });
});

describe("invoiceReadyEmail", () => {
  it("returns subject and html with invoice details", () => {
    const result = invoiceReadyEmail("Club Deportivo", "$50.000", "15 abr. 2026", "https://app.clupay.cl");
    expect(result.subject).toBe("Nueva factura de Club Deportivo");
    expect(result.html).toContain("$50.000");
    expect(result.html).toContain("15 abr. 2026");
  });
});

describe("paymentConfirmationEmail", () => {
  it("returns subject and html with payment details", () => {
    const result = paymentConfirmationEmail("Club Deportivo", "$50.000", "abril 2026");
    expect(result.subject).toBe("Pago confirmado — Club Deportivo");
    expect(result.html).toContain("$50.000");
    expect(result.html).toContain("abril 2026");
  });
});

describe("paymentReminderEmail", () => {
  it("returns subject and html with reminder details", () => {
    const result = paymentReminderEmail("Club Deportivo", "$50.000", "15 abr. 2026", "https://app.clupay.cl");
    expect(result.subject).toBe("Recordatorio: factura por vencer — Club Deportivo");
    expect(result.html).toContain("$50.000");
    expect(result.html).toContain("15 abr. 2026");
  });
});

describe("overdueAlertEmail", () => {
  it("returns subject and html with overdue details", () => {
    const result = overdueAlertEmail("Club Deportivo", "$50.000", 3, "https://app.clupay.cl");
    expect(result.subject).toBe("Factura vencida — Club Deportivo");
    expect(result.html).toContain("$50.000");
    expect(result.html).toContain("3 día(s)");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/lib/email/templates.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement templates**

```typescript
// src/lib/email/templates.ts

interface EmailContent {
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
}

interface EmailResult {
  subject: string;
  html: string;
}

export function buildEmailHtml(content: EmailContent): string {
  const ctaBlock = content.ctaText && content.ctaUrl
    ? `<!--cta--><div style="text-align:center;margin:24px 0">
        <a href="${content.ctaUrl}" style="display:inline-block;padding:12px 32px;background:#3B82F6;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px">${content.ctaText}</a>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F7FF;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F7FF;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr><td style="background:#3B82F6;padding:24px 32px;border-radius:12px 12px 0 0">
          <span style="color:#ffffff;font-size:24px;font-weight:700">CluPay</span>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px">
          <h1 style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:600">${content.title}</h1>
          <div style="color:#1e293b;font-size:16px;line-height:1.6">${content.body}</div>
          ${ctaBlock}
        </td></tr>
        <tr><td style="padding:24px 32px;text-align:center">
          <span style="color:#64748B;font-size:13px">CluPay — Plataforma de pagos para clubes deportivos</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function invitationEmail(
  clubName: string,
  token: string,
  appUrl: string
): EmailResult {
  return {
    subject: `${clubName} te invita a CluPay`,
    html: buildEmailHtml({
      title: `${clubName} te invita a CluPay`,
      body: `<p>Has sido invitado/a a unirte a <strong>${clubName}</strong> en CluPay.</p>
             <p>Haz clic en el botón para aceptar la invitación e inscribir a tus hijos.</p>`,
      ctaText: "Aceptar invitación",
      ctaUrl: `${appUrl}/invite/${token}`,
    }),
  };
}

export function invoiceReadyEmail(
  clubName: string,
  total: string,
  dueDate: string,
  appUrl: string
): EmailResult {
  return {
    subject: `Nueva factura de ${clubName}`,
    html: buildEmailHtml({
      title: `Nueva factura de ${clubName}`,
      body: `<p>Tienes una nueva factura por <strong>${total}</strong> con vencimiento el <strong>${dueDate}</strong>.</p>`,
      ctaText: "Ver factura",
      ctaUrl: `${appUrl}/app`,
    }),
  };
}

export function paymentConfirmationEmail(
  clubName: string,
  total: string,
  periodLabel: string
): EmailResult {
  return {
    subject: `Pago confirmado — ${clubName}`,
    html: buildEmailHtml({
      title: `Pago confirmado — ${clubName}`,
      body: `<p>Tu pago de <strong>${total}</strong> para <strong>${periodLabel}</strong> ha sido registrado exitosamente.</p>
             <p>Gracias por tu pago.</p>`,
    }),
  };
}

export function paymentReminderEmail(
  clubName: string,
  total: string,
  dueDate: string,
  appUrl: string
): EmailResult {
  return {
    subject: `Recordatorio: factura por vencer — ${clubName}`,
    html: buildEmailHtml({
      title: `Recordatorio de pago — ${clubName}`,
      body: `<p>Tu factura de <strong>${total}</strong> vence el <strong>${dueDate}</strong>.</p>
             <p>Realiza tu pago antes de la fecha de vencimiento para evitar recargos.</p>`,
      ctaText: "Pagar ahora",
      ctaUrl: `${appUrl}/app`,
    }),
  };
}

export function overdueAlertEmail(
  clubName: string,
  total: string,
  daysOverdue: number,
  appUrl: string
): EmailResult {
  return {
    subject: `Factura vencida — ${clubName}`,
    html: buildEmailHtml({
      title: `Factura vencida — ${clubName}`,
      body: `<p>Tu factura de <strong>${total}</strong> está vencida hace <strong>${daysOverdue} día(s)</strong>.</p>
             <p>Por favor, regulariza tu pago lo antes posible.</p>`,
      ctaText: "Pagar ahora",
      ctaUrl: `${appUrl}/app`,
    }),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/lib/email/templates.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates.ts __tests__/lib/email/templates.test.ts
git commit -m "feat(email): add HTML email templates with CluPay branding"
```

---

### Task 4: Notification Sender (`src/lib/email/send-notification.ts`)

**Files:**
- Create: `src/lib/email/send-notification.ts`
- Create: `__tests__/lib/email/send-notification.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/lib/email/send-notification.test.ts
import { sendNotification } from "@/lib/email/send-notification";

// Mock resend module
jest.mock("@/lib/email/resend", () => ({
  sendEmail: jest.fn(),
}));

import { sendEmail } from "@/lib/email/resend";

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

// Mock Supabase client
function createMockSupabase(insertResult: { error: null | { message: string } } = { error: null }) {
  const insert = jest.fn().mockReturnValue({ error: insertResult.error });
  return {
    from: jest.fn().mockReturnValue({ insert }),
    _insert: insert,
  };
}

describe("sendNotification", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends email and logs to notifications table on success", async () => {
    mockSendEmail.mockResolvedValue({ success: true });
    const supabase = createMockSupabase();

    await sendNotification({
      supabase: supabase as any,
      parentId: "parent-1",
      clubId: "club-1",
      email: "parent@test.cl",
      type: "reminder",
      subject: "Test Subject",
      html: "<p>Test</p>",
      metadata: { invoice_id: "inv-1" },
    });

    expect(mockSendEmail).toHaveBeenCalledWith("parent@test.cl", "Test Subject", "<p>Test</p>");
    expect(supabase.from).toHaveBeenCalledWith("notifications");
    expect(supabase._insert).toHaveBeenCalledWith(
      expect.objectContaining({
        parent_id: "parent-1",
        club_id: "club-1",
        channel: "email",
        type: "reminder",
        subject: "Test Subject",
        status: "sent",
      })
    );
  });

  it("logs as failed when Resend returns error, does not throw", async () => {
    mockSendEmail.mockResolvedValue({ success: false, error: "Rate limited" });
    const supabase = createMockSupabase();

    await sendNotification({
      supabase: supabase as any,
      parentId: "parent-1",
      clubId: "club-1",
      email: "parent@test.cl",
      type: "reminder",
      subject: "Test",
      html: "<p>Test</p>",
    });

    expect(supabase._insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/lib/email/send-notification.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement send-notification**

```typescript
// src/lib/email/send-notification.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationType } from "@/types";
import { sendEmail } from "@/lib/email/resend";

interface SendNotificationParams {
  supabase: SupabaseClient;
  parentId: string;
  clubId: string;
  email: string;
  type: NotificationType;
  subject: string;
  html: string;
  metadata?: Record<string, unknown>;
}

export async function sendNotification(params: SendNotificationParams): Promise<void> {
  const { supabase, parentId, clubId, email, type, subject, html, metadata } = params;

  const result = await sendEmail(email, subject, html);

  const now = new Date().toISOString();
  const { error: dbError } = await supabase.from("notifications").insert({
    parent_id: parentId,
    club_id: clubId,
    channel: "email" as const,
    type,
    subject,
    body: html,
    status: result.success ? "sent" : "failed",
    sent_at: result.success ? now : null,
    metadata: metadata ?? null,
  });

  if (dbError) {
    console.error("Failed to log notification:", dbError.message);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/lib/email/send-notification.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/send-notification.ts __tests__/lib/email/send-notification.test.ts
git commit -m "feat(email): add notification sender with audit logging"
```

---

### Task 5: Server Action — Send Invitation

**Files:**
- Create: `src/lib/actions/send-invitation.ts`
- Modify: `src/components/club/invitation-form.tsx`

- [ ] **Step 1: Create the server action**

```typescript
// src/lib/actions/send-invitation.ts
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { invitationEmail } from "@/lib/email/templates";
import { sendNotification } from "@/lib/email/send-notification";

interface SendInvitationResult {
  success: boolean;
  error?: string;
}

export async function sendInvitation(
  clubId: string,
  email: string
): Promise<SendInvitationResult> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión expirada. Recarga la página." };

  if (!email.trim()) return { success: false, error: "El email es obligatorio" };

  // Insert invitation
  const { data: invitation, error: insertError } = await supabase
    .from("invitations")
    .insert({
      club_id: clubId,
      invited_by: user.id,
      email: email.trim(),
    })
    .select("id, token")
    .single();

  if (insertError) return { success: false, error: insertError.message };

  // Fetch club name for the email
  const serviceClient = createServiceRoleClient();
  const { data: club } = await serviceClient
    .from("clubs")
    .select("name")
    .eq("id", clubId)
    .single();

  const clubName = club?.name ?? "Tu club";
  const appUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin.replace("supabase", "app")
    : "https://clupay.cl";
  // Use the app's own URL, not Supabase URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { subject, html } = invitationEmail(clubName, invitation.token, baseUrl);

  await sendNotification({
    supabase: serviceClient,
    parentId: user.id, // Use inviter's ID — invited parent may not have an account yet. parent_id is NOT NULL.
    clubId,
    email: email.trim(),
    type: "invitation",
    subject,
    html,
    metadata: { invitation_id: invitation.id, token: invitation.token },
  });

  return { success: true };
}
```

- [ ] **Step 2: Update invitation-form.tsx to use the server action**

Replace the entire content of `src/components/club/invitation-form.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendInvitation } from "@/lib/actions/send-invitation";

interface InvitationFormProps {
  clubId: string;
}

export function InvitationForm({ clubId }: InvitationFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const result = await sendInvitation(clubId, email);

    if (!result.success) {
      setError(result.error ?? "Error al enviar invitación");
      setSaving(false);
      return;
    }

    setEmail("");
    setSuccess(true);
    setSaving(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-text mb-3">Enviar invitación</h3>
      {error && <p className="text-sm text-danger mb-2">{error}</p>}
      {success && <p className="text-sm text-success mb-2">Invitación enviada exitosamente</p>}
      <div className="flex gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@ejemplo.cl"
          className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" required />
        <button type="submit" disabled={saving}
          className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50">
          {saving ? "Enviando..." : "Invitar"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Add `NEXT_PUBLIC_APP_URL` to `.env.example`**

Add to `.env.example`:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 4: Verify the app compiles**

Run: `npx next build --no-lint 2>&1 | tail -5` (or `npm run dev` and test manually)

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/send-invitation.ts src/components/club/invitation-form.tsx .env.example
git commit -m "feat(email): add invitation email via server action"
```

---

### Task 6: Server Action — Approve Invoice

**Files:**
- Create: `src/lib/actions/approve-invoice.ts`
- Modify: `src/components/club/approve-invoice-button.tsx`
- Modify: `src/app/(club)/club/cobros/bulk-approve-button.tsx`

- [ ] **Step 1: Create the server action**

```typescript
// src/lib/actions/approve-invoice.ts
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { invoiceReadyEmail } from "@/lib/email/templates";
import { sendNotification } from "@/lib/email/send-notification";
import { formatCLP, formatDate } from "@/lib/format";

interface ApproveResult {
  success: boolean;
  error?: string;
}

export async function approveInvoice(invoiceId: string): Promise<ApproveResult> {
  const supabase = await createServerSupabaseClient();

  // Verify authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión expirada" };

  // Update invoice status
  const { error: updateError } = await supabase
    .from("invoices")
    .update({ status: "pending" })
    .eq("id", invoiceId);

  if (updateError) return { success: false, error: "Error al aprobar la factura" };

  // Fetch invoice + parent + club details for email
  const serviceClient = createServiceRoleClient();
  const { data: invoice } = await serviceClient
    .from("invoices")
    .select("id, parent_id, club_id, total, due_date, clubs(name), profiles(email)")
    .eq("id", invoiceId)
    .single();

  if (invoice) {
    const clubName = (invoice.clubs as any)?.name ?? "Tu club";
    const parentEmail = (invoice.profiles as any)?.email;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (parentEmail) {
      const { subject, html } = invoiceReadyEmail(
        clubName,
        formatCLP(invoice.total),
        formatDate(invoice.due_date),
        baseUrl
      );

      await sendNotification({
        supabase: serviceClient,
        parentId: invoice.parent_id,
        clubId: invoice.club_id,
        email: parentEmail,
        type: "confirmation",
        subject,
        html,
        metadata: { invoice_id: invoice.id, event: "invoice_ready" },
      });
    }
  }

  return { success: true };
}

interface BulkApproveResult {
  success: boolean;
  approved?: number;
  error?: string;
}

export async function bulkApproveInvoices(invoiceIds: string[]): Promise<BulkApproveResult> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión expirada" };

  // Update all invoices
  const { error: updateError } = await supabase
    .from("invoices")
    .update({ status: "pending" })
    .in("id", invoiceIds);

  if (updateError) return { success: false, error: "Error al aprobar las facturas" };

  // Fetch all approved invoices for email
  const serviceClient = createServiceRoleClient();
  const { data: invoices } = await serviceClient
    .from("invoices")
    .select("id, parent_id, club_id, total, due_date, clubs(name), profiles(email)")
    .in("id", invoiceIds);

  if (invoices && invoices.length > 0) {
    // Group by parent to send one email per parent
    const byParent = new Map<string, typeof invoices>();
    for (const inv of invoices) {
      const parentId = inv.parent_id;
      if (!byParent.has(parentId)) byParent.set(parentId, []);
      byParent.get(parentId)!.push(inv);
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    for (const [parentId, parentInvoices] of byParent) {
      const first = parentInvoices[0];
      const parentEmail = (first.profiles as any)?.email;
      if (!parentEmail) continue;

      const clubName = (first.clubs as any)?.name ?? "Tu club";

      // Sum totals and find earliest due date
      const totalSum = parentInvoices.reduce((sum, inv) => sum + inv.total, 0);
      const earliestDue = parentInvoices
        .map((inv) => inv.due_date)
        .sort()[0];

      const { subject, html } = invoiceReadyEmail(
        clubName,
        formatCLP(totalSum),
        formatDate(earliestDue),
        baseUrl
      );

      await sendNotification({
        supabase: serviceClient,
        parentId,
        clubId: first.club_id,
        email: parentEmail,
        type: "confirmation",
        subject,
        html,
        metadata: {
          invoice_ids: parentInvoices.map((inv) => inv.id),
          event: "invoice_ready",
        },
      });
    }
  }

  return { success: true, approved: invoiceIds.length };
}
```

- [ ] **Step 2: Update approve-invoice-button.tsx**

Replace the entire content of `src/components/club/approve-invoice-button.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveInvoice } from "@/lib/actions/approve-invoice";

interface ApproveInvoiceButtonProps {
  invoiceId: string;
}

export function ApproveInvoiceButton({ invoiceId }: ApproveInvoiceButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleApprove() {
    setSaving(true);
    const result = await approveInvoice(invoiceId);
    if (!result.success) {
      alert("Error al aprobar la factura");
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={handleApprove}
      disabled={saving}
      className="text-sm text-primary hover:text-primary/80 font-medium disabled:opacity-50"
    >
      {saving ? "Aprobando..." : "Aprobar"}
    </button>
  );
}
```

- [ ] **Step 3: Update bulk-approve-button.tsx**

Replace the entire content of `src/app/(club)/club/cobros/bulk-approve-button.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { bulkApproveInvoices } from "@/lib/actions/approve-invoice";

interface BulkApproveButtonProps {
  invoiceIds: string[];
}

export function BulkApproveButton({ invoiceIds }: BulkApproveButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleBulkApprove() {
    if (!confirm(`¿Aprobar ${invoiceIds.length} facturas?`)) return;
    setSaving(true);
    const result = await bulkApproveInvoices(invoiceIds);
    if (!result.success) {
      alert("Error al aprobar las facturas");
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={handleBulkApprove}
      disabled={saving}
      className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
    >
      {saving ? "Aprobando..." : "Aprobar todos"}
    </button>
  );
}
```

- [ ] **Step 4: Verify the app compiles**

Run: `npx next build --no-lint 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/approve-invoice.ts src/components/club/approve-invoice-button.tsx src/app/\(club\)/club/cobros/bulk-approve-button.tsx
git commit -m "feat(email): add invoice approval email via server action"
```

---

### Task 7: Server Action — Mark Invoice Paid

**Files:**
- Create: `src/lib/actions/mark-invoice-paid.ts`
- Modify: `src/components/club/mark-paid-button.tsx`

- [ ] **Step 1: Create the server action**

```typescript
// src/lib/actions/mark-invoice-paid.ts
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { paymentConfirmationEmail } from "@/lib/email/templates";
import { sendNotification } from "@/lib/email/send-notification";
import { formatCLP } from "@/lib/format";

interface MarkPaidResult {
  success: boolean;
  error?: string;
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export async function markInvoicePaid(
  invoiceId: string,
  amount: number,
  method: string = "bank_transfer"
): Promise<MarkPaidResult> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión expirada" };

  // Call existing RPC
  const { error: rpcError } = await supabase.rpc("mark_invoice_paid", {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_method: method,
  });

  if (rpcError) return { success: false, error: rpcError.message };

  // Fetch invoice details for email
  const serviceClient = createServiceRoleClient();
  const { data: invoice } = await serviceClient
    .from("invoices")
    .select("id, parent_id, club_id, total, period_month, period_year, clubs(name), profiles(email)")
    .eq("id", invoiceId)
    .single();

  if (invoice) {
    const parentEmail = (invoice.profiles as any)?.email;
    const clubName = (invoice.clubs as any)?.name ?? "Tu club";

    if (parentEmail) {
      const periodLabel = `${MONTH_NAMES[invoice.period_month - 1]} ${invoice.period_year}`;

      const { subject, html } = paymentConfirmationEmail(
        clubName,
        formatCLP(invoice.total),
        periodLabel
      );

      await sendNotification({
        supabase: serviceClient,
        parentId: invoice.parent_id,
        clubId: invoice.club_id,
        email: parentEmail,
        type: "confirmation",
        subject,
        html,
        metadata: { invoice_id: invoice.id, event: "payment_confirmed" },
      });
    }
  }

  return { success: true };
}
```

- [ ] **Step 2: Update mark-paid-button.tsx**

Replace the entire content of `src/components/club/mark-paid-button.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markInvoicePaid } from "@/lib/actions/mark-invoice-paid";

interface MarkPaidButtonProps {
  invoiceId: string;
  amount: number;
}

export function MarkPaidButton({ invoiceId, amount }: MarkPaidButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleMarkPaid() {
    if (!confirm("¿Marcar esta factura como pagada por transferencia bancaria?")) return;
    setSaving(true);
    const result = await markInvoicePaid(invoiceId, amount);
    if (!result.success) {
      alert(result.error ?? "Error al marcar como pagado");
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return (
    <button onClick={handleMarkPaid} disabled={saving} className="text-sm text-success hover:text-success/80 font-medium disabled:opacity-50">
      {saving ? "Marcando..." : "Marcar pagado"}
    </button>
  );
}
```

- [ ] **Step 3: Verify the app compiles**

Run: `npx next build --no-lint 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/mark-invoice-paid.ts src/components/club/mark-paid-button.tsx
git commit -m "feat(email): add payment confirmation email via server action"
```

---

### Task 8: Modify Invoice Generation to Return Auto-Approved IDs

**Files:**
- Modify: `src/lib/invoice-generation.ts`

- [ ] **Step 1: Update GenerationResult interface and return type**

In `src/lib/invoice-generation.ts`, update the `GenerationResult` interface (line 3-8):

```typescript
// Replace existing GenerationResult
interface GenerationResult {
  overdue_marked: number;
  clubs_processed: number;
  invoices_generated: number;
  invoices_skipped: number;
  auto_approved_invoice_ids: string[];
}
```

- [ ] **Step 2: Update generateClubInvoices return type**

Change the return type of `generateClubInvoices` (around line 88-98) to include `autoApprovedIds`:

Replace:
```typescript
): Promise<{ generated: number; skipped: number }> {
```
With:
```typescript
): Promise<{ generated: number; skipped: number; autoApprovedIds: string[] }> {
```

And update the early return (line 107):
Replace:
```typescript
  if (!enrollments || enrollments.length === 0) return { generated: 0, skipped: 0 };
```
With:
```typescript
  if (!enrollments || enrollments.length === 0) return { generated: 0, skipped: 0, autoApprovedIds: [] };
```

- [ ] **Step 3: Track auto-approved IDs in the loop**

In `generateClubInvoices`, add tracking after `let skipped = 0;` (around line 118):

Replace:
```typescript
  let generated = 0;
  let skipped = 0;

  for (const [parentId, parentEnrollments] of byParent) {
```
With:
```typescript
  let generated = 0;
  let skipped = 0;
  const autoApprovedIds: string[] = [];

  for (const [parentId, parentEnrollments] of byParent) {
```

- [ ] **Step 4: Update generateParentInvoice to return invoice ID**

Change `generateParentInvoice` return type from `Promise<void>` to `Promise<string>` (at line 150):

Replace:
```typescript
): Promise<void> {
```
With:
```typescript
): Promise<string> {
```

Add a return statement at the end of `generateParentInvoice` (after the `updateDiscountCounters` call, around line 288):

Replace:
```typescript
  // Update discount counters
  await updateDiscountCounters(supabase, [...kidDiscounts, ...parentDiscounts]);
}
```
With:
```typescript
  // Update discount counters
  await updateDiscountCounters(supabase, [...kidDiscounts, ...parentDiscounts]);

  return invoice.id;
}
```

- [ ] **Step 5: Capture the ID and track auto-approvals in generateClubInvoices**

In the `generateClubInvoices` loop, update the call to `generateParentInvoice` (around line 136-146):

Replace:
```typescript
    await generateParentInvoice(
      supabase,
      club,
      parentId,
      parentEnrollments,
      periodMonth,
      periodYear
    );
    generated++;
  }

  return { generated, skipped };
```
With:
```typescript
    const invoiceId = await generateParentInvoice(
      supabase,
      club,
      parentId,
      parentEnrollments,
      periodMonth,
      periodYear
    );
    generated++;
    if (club.auto_approve_invoices) {
      autoApprovedIds.push(invoiceId);
    }
  }

  return { generated, skipped, autoApprovedIds };
```

- [ ] **Step 6: Aggregate auto-approved IDs in generateInvoices**

In the main `generateInvoices` function, update the loop and return (around line 69-86):

Replace:
```typescript
  let totalGenerated = 0;
  let totalSkipped = 0;

  for (const club of clubs) {
    const result = await generateClubInvoices(
      supabase,
      club,
      currentMonth,
      currentYear
    );
    totalGenerated += result.generated;
    totalSkipped += result.skipped;
  }

  return {
    overdue_marked: overdueMarked,
    clubs_processed: clubs.length,
    invoices_generated: totalGenerated,
    invoices_skipped: totalSkipped,
  };
```
With:
```typescript
  let totalGenerated = 0;
  let totalSkipped = 0;
  const allAutoApprovedIds: string[] = [];

  for (const club of clubs) {
    const result = await generateClubInvoices(
      supabase,
      club,
      currentMonth,
      currentYear
    );
    totalGenerated += result.generated;
    totalSkipped += result.skipped;
    allAutoApprovedIds.push(...result.autoApprovedIds);
  }

  return {
    overdue_marked: overdueMarked,
    clubs_processed: clubs.length,
    invoices_generated: totalGenerated,
    invoices_skipped: totalSkipped,
    auto_approved_invoice_ids: allAutoApprovedIds,
  };
```

- [ ] **Step 7: Verify existing tests still pass (if any)**

Run: `npx jest --passWithNoTests`

- [ ] **Step 8: Commit**

```bash
git add src/lib/invoice-generation.ts
git commit -m "feat(invoice): return auto-approved invoice IDs from generation"
```

---

### Task 9: Notification Cron Logic (`src/lib/notification-cron.ts`)

**Files:**
- Create: `src/lib/notification-cron.ts`
- Create: `__tests__/lib/notification-cron.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/lib/notification-cron.test.ts
import { processNotifications } from "@/lib/notification-cron";

// Mock email modules
jest.mock("@/lib/email/resend", () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/email/send-notification", () => ({
  sendNotification: jest.fn().mockResolvedValue(undefined),
}));

import { sendNotification } from "@/lib/email/send-notification";
const mockSendNotification = sendNotification as jest.MockedFunction<typeof sendNotification>;

function createMockSupabase(overrides: Record<string, any> = {}) {
  const defaultData: Record<string, any[]> = {
    invoices_reminder: [],
    invoices_overdue: [],
    invoices_auto: [],
    notifications: [],
    profiles: [],
    clubs: [],
    ...overrides,
  };

  // Build a chainable mock
  const createChain = (tableName: string) => {
    const chain: any = {
      select: jest.fn().mockReturnValue(chain),
      eq: jest.fn().mockReturnValue(chain),
      in: jest.fn().mockReturnValue(chain),
      contains: jest.fn().mockReturnValue(chain),
      then: undefined,
    };
    // Resolve when awaited
    chain.then = (resolve: any) => resolve({ data: defaultData[tableName] ?? [], error: null });
    return chain;
  };

  return {
    from: jest.fn((table: string) => createChain(table)),
  };
}

describe("processNotifications", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns zero counts when no invoices match", async () => {
    const supabase = createMockSupabase();
    const result = await processNotifications(supabase as any, { autoApprovedInvoiceIds: [] });
    expect(result.reminders_sent).toBe(0);
    expect(result.overdue_sent).toBe(0);
    expect(result.auto_approved_sent).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/lib/notification-cron.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement notification-cron**

```typescript
// src/lib/notification-cron.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotification } from "@/lib/email/send-notification";
import {
  paymentReminderEmail,
  overdueAlertEmail,
  invoiceReadyEmail,
} from "@/lib/email/templates";
import { formatCLP, formatDate } from "@/lib/format";

interface NotificationResult {
  reminders_sent: number;
  overdue_sent: number;
  auto_approved_sent: number;
}

interface ProcessOptions {
  autoApprovedInvoiceIds: string[];
}

export async function processNotifications(
  supabase: SupabaseClient,
  options: ProcessOptions
): Promise<NotificationResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const clubNameCache = new Map<string, string>();

  async function getClubName(clubId: string): Promise<string> {
    if (clubNameCache.has(clubId)) return clubNameCache.get(clubId)!;
    const { data } = await supabase.from("clubs").select("name").eq("id", clubId).single();
    const name = data?.name ?? "Tu club";
    clubNameCache.set(clubId, name);
    return name;
  }

  async function getParentEmail(parentId: string): Promise<string | null> {
    const { data } = await supabase.from("profiles").select("email").eq("id", parentId).single();
    return data?.email ?? null;
  }

  async function wasAlreadySent(
    parentId: string,
    type: string,
    metadata: Record<string, unknown>
  ): Promise<boolean> {
    // Check if a notification with matching type and metadata already exists
    const { data } = await supabase
      .from("notifications")
      .select("id")
      .eq("parent_id", parentId)
      .eq("type", type)
      .contains("metadata", metadata)
      .limit(1);
    return (data?.length ?? 0) > 0;
  }

  // --- Payment Reminders (3 days before due) ---
  const today = new Date();
  const reminderDate = new Date(today);
  reminderDate.setDate(reminderDate.getDate() + 3);
  const reminderDateStr = reminderDate.toISOString().split("T")[0];

  const { data: reminderInvoices } = await supabase
    .from("invoices")
    .select("id, parent_id, club_id, total, due_date")
    .eq("status", "pending")
    .eq("due_date", reminderDateStr);

  let remindersSent = 0;
  for (const inv of reminderInvoices ?? []) {
    const alreadySent = await wasAlreadySent(inv.parent_id, "reminder", { invoice_id: inv.id });
    if (alreadySent) continue;

    const email = await getParentEmail(inv.parent_id);
    if (!email) continue;

    const clubName = await getClubName(inv.club_id);
    const { subject, html } = paymentReminderEmail(
      clubName,
      formatCLP(inv.total),
      formatDate(inv.due_date),
      baseUrl
    );

    await sendNotification({
      supabase,
      parentId: inv.parent_id,
      clubId: inv.club_id,
      email,
      type: "reminder",
      subject,
      html,
      metadata: { invoice_id: inv.id },
    });
    remindersSent++;
  }

  // --- Overdue Alerts (1, 3, 7 days after due) ---
  let overdueSent = 0;
  for (const daysOverdue of [1, 3, 7]) {
    const overdueDate = new Date(today);
    overdueDate.setDate(overdueDate.getDate() - daysOverdue);
    const overdueDateStr = overdueDate.toISOString().split("T")[0];

    const { data: overdueInvoices } = await supabase
      .from("invoices")
      .select("id, parent_id, club_id, total, due_date")
      .eq("status", "overdue")
      .eq("due_date", overdueDateStr);

    for (const inv of overdueInvoices ?? []) {
      const alreadySent = await wasAlreadySent(inv.parent_id, "overdue", {
        invoice_id: inv.id,
        days_overdue: daysOverdue,
      });
      if (alreadySent) continue;

      const email = await getParentEmail(inv.parent_id);
      if (!email) continue;

      const clubName = await getClubName(inv.club_id);
      const { subject, html } = overdueAlertEmail(clubName, formatCLP(inv.total), daysOverdue, baseUrl);

      await sendNotification({
        supabase,
        parentId: inv.parent_id,
        clubId: inv.club_id,
        email,
        type: "overdue",
        subject,
        html,
        metadata: { invoice_id: inv.id, days_overdue: daysOverdue },
      });
      overdueSent++;
    }
  }

  // --- Auto-Approved Invoice Ready Emails ---
  let autoApprovedSent = 0;
  if (options.autoApprovedInvoiceIds.length > 0) {
    const { data: autoInvoices } = await supabase
      .from("invoices")
      .select("id, parent_id, club_id, total, due_date")
      .in("id", options.autoApprovedInvoiceIds);

    for (const inv of autoInvoices ?? []) {
      const email = await getParentEmail(inv.parent_id);
      if (!email) continue;

      const clubName = await getClubName(inv.club_id);
      const { subject, html } = invoiceReadyEmail(
        clubName,
        formatCLP(inv.total),
        formatDate(inv.due_date),
        baseUrl
      );

      await sendNotification({
        supabase,
        parentId: inv.parent_id,
        clubId: inv.club_id,
        email,
        type: "confirmation",
        subject,
        html,
        metadata: { invoice_id: inv.id, event: "invoice_ready" },
      });
      autoApprovedSent++;
    }
  }

  return {
    reminders_sent: remindersSent,
    overdue_sent: overdueSent,
    auto_approved_sent: autoApprovedSent,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/lib/notification-cron.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/notification-cron.ts __tests__/lib/notification-cron.test.ts
git commit -m "feat(email): add notification cron for reminders and overdue alerts"
```

---

### Task 10: Wire Cron Route to Notification Processing

**Files:**
- Modify: `src/app/api/cron/generate-invoices/route.ts`

- [ ] **Step 1: Update the cron route**

Replace the entire content of `src/app/api/cron/generate-invoices/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { generateInvoices } from "@/lib/invoice-generation";
import { processNotifications } from "@/lib/notification-cron";

export async function POST(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient();
    const invoiceResult = await generateInvoices(supabase);
    const notificationResult = await processNotifications(supabase, {
      autoApprovedInvoiceIds: invoiceResult.auto_approved_invoice_ids,
    });

    return NextResponse.json(
      { ...invoiceResult, notifications: notificationResult },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `npx next build --no-lint 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/generate-invoices/route.ts
git commit -m "feat(cron): wire notification processing into daily cron job"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npx jest --verbose`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npx next build --no-lint`
Expected: Build succeeds

- [ ] **Step 3: Manual smoke test**

Start dev server: `npm run dev`

1. Log in as `club@clupay.test`
2. Go to `/club/invitaciones` and send an invitation — check Resend dashboard for email delivery
3. Go to `/club/cobros`, approve a `generated` invoice — check for invoice-ready email
4. Mark a `pending` invoice as paid — check for payment confirmation email

- [ ] **Step 4: Update NEXT-STEPS.md**

Remove "Email notifications via Resend" from the Phase 1 Pending section. Update the "In Progress" section if needed.

- [ ] **Step 5: Commit**

```bash
git add NEXT-STEPS.md
git commit -m "docs: mark email notifications as complete in NEXT-STEPS"
```
