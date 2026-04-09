# Flow.cl Payment Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable parents to pay unpaid invoices via Flow.cl hosted checkout, with a server-to-server webhook as the authoritative confirmation source and a local mock mode for development without real charges.

**Architecture:** A new Flow API client wraps HMAC-SHA256 signing and two Flow endpoints (`payment/create`, `payment/getStatus`). A server action creates a pre-inserted `payments` row, calls Flow, stores the returned token, and redirects the parent. Flow's webhook POSTs a token back to our public endpoint; the handler verifies by calling `payment/getStatus`, checks idempotency on `flow_transaction_id`, and delegates to a shared `confirmPayment` function that updates `payments` + `invoices` directly and sends the payment confirmation email. A mock mode short-circuits network calls when `FLOW_MOCK=true`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL), Jest, Node.js `crypto` for HMAC signing, `fetch` for HTTP.

**Spec:** `docs/superpowers/specs/2026-04-09-flow-payment-integration-design.md`

---

## Context the engineer needs to know

**Project conventions you must follow:**

1. **Next.js 16 — not your training data.** APIs have changed. Before writing any Next-specific code (route handlers, server actions, `cookies()`, params typing), read the relevant guide in `node_modules/next/dist/docs/`. Heed deprecation notices. Example: in Next 16, `cookies()` is async.
2. **Supabase clients** — three flavors:
   - `createBrowserSupabaseClient` (`src/lib/supabase/client.ts`) for client components.
   - `createServerSupabaseClient` (`src/lib/supabase/server.ts`) for server components + server actions (async, uses cookies).
   - `createServiceRoleClient` (`src/lib/supabase/service.ts`) for cross-RLS operations (webhooks, email sending). Never import this from client code.
3. **Server actions** go in `src/lib/actions/*.ts`, marked with `"use server"` at the top of the file.
4. **Email sending** uses `sendNotification({ supabase, parentId, clubId, email, type, subject, html, metadata })` from `src/lib/email/send-notification.ts`. It writes to the `notifications` table. Do not call `sendEmail` directly — always go through `sendNotification`.
5. **Payment confirmation template** already exists: `paymentConfirmationEmail(clubName, amountCLP, periodLabel)` in `src/lib/email/templates.ts`. Reuse it.
6. **Currency** is CLP integers — no decimals. Flow also uses integer CLP.
7. **Test file layout** mirrors the source tree under `__tests__/`. Jest config uses `jest-environment-jsdom` and the `@/*` path alias. See `__tests__/lib/email/` for existing patterns.
8. **Commits** — small, focused, follow the existing `feat(...)`, `fix(...)`, `test(...)`, `docs(...)` style from `git log`.

**Flow.cl API reference (memorize these):**

- **Base URL (prod):** `https://www.flow.cl/api`
- **Create payment:** `POST /payment/create` — body is URL-encoded form. Required params: `apiKey`, `commerceOrder`, `subject`, `amount`, `email`, `urlConfirmation`, `urlReturn`. Plus `s` = signature.
- **Get status:** `POST /payment/getStatus` — body is URL-encoded form. Required params: `apiKey`, `token`. Plus `s` = signature.
- **Signature:** Concatenate all non-signature params as `key1=value1&key2=value2&...` in **alphabetical order by key**, then HMAC-SHA256 with the secret key, hex-encoded lowercase. Append as `s=<hex>` to the request body.
- **Create response:** JSON `{ token, url, flowOrder }`. Redirect the browser to `${url}?token=${token}`.
- **Status response:** JSON `{ flowOrder, commerceOrder, requestDate, status, subject, currency, amount, payer, optional, pending_info, paymentData }`. Status codes: `1` pending, `2` paid, `3` rejected, `4` cancelled.

**Existing code you will touch:**

- `src/app/(app)/app/page.tsx` — parent dashboard, line ~81 has the placeholder "Pagar Ahora" button.
- `src/lib/actions/mark-invoice-paid.ts` — reference pattern for server actions that do DB updates + send email. Do NOT reuse the `mark_invoice_paid` RPC it calls (that RPC inserts its own payments row, which would duplicate our pre-inserted row).
- `src/lib/email/send-notification.ts` — the email + notification logging helper.
- `src/lib/email/templates.ts` — has `paymentConfirmationEmail` builder.

**Enum values you must use (from `src/types/index.ts` and `supabase/migrations/00001_create_enums.sql`):**

- `payment_status`: `'pending' | 'completed' | 'failed' | 'refunded'` — note `completed` (not `paid`).
- `payment_method`: `'card_automatic' | 'card_link' | 'bank_transfer'` — use `'card_link'` for Flow one-time payments.
- `invoice_status`: `'generated' | 'pending' | 'paid' | 'overdue'` — the invoice becomes `'paid'`.

**URLs to build:**

- `urlConfirmation` = `${NEXT_PUBLIC_APP_URL}/api/webhooks/flow/confirm`
- `urlReturn` = `${NEXT_PUBLIC_APP_URL}/app/pagos/retorno`

If `NEXT_PUBLIC_APP_URL` is not set, default to `http://localhost:3000` (matches existing email link convention).

---

## File structure

### New files

| Path | Responsibility |
|---|---|
| `src/lib/flow/signature.ts` | HMAC-SHA256 signing helper. Pure function, no I/O. |
| `src/lib/flow/client.ts` | Flow HTTP client: `createPayment()`, `getPaymentStatus()`. Handles mock mode and prod-safety guard. |
| `src/lib/flow/confirm-payment.ts` | Shared confirmation logic. Idempotent. Updates `payments` + `invoices`, sends email. |
| `src/lib/actions/create-flow-payment.ts` | `"use server"` action. Validates, pre-inserts `payments` row, calls Flow, stores token, returns redirect URL. |
| `src/app/api/webhooks/flow/confirm/route.ts` | `POST` webhook. Calls `getPaymentStatus`, delegates to `confirmPayment`. Always returns 200 on processed results. |
| `src/app/(app)/app/pagos/retorno/page.tsx` | Browser return page. Polls our DB for `payments.status`. |
| `src/app/(app)/app/pagos/retorno/retorno-client.tsx` | Client component doing the polling (page is a server component for consistency). |
| `src/app/(app)/app/pagos/retorno/mock/route.ts` | Mock-mode only redirect route. Guarded so it throws if `FLOW_MOCK !== 'true'`. |
| `src/components/app/pay-now-button.tsx` | `"use client"` button. Calls the server action, handles loading/error states, redirects. |
| `__tests__/lib/flow/signature.test.ts` | Known-answer signature tests. |
| `__tests__/lib/flow/client.test.ts` | Client mock-mode, prod-guard, request body shape. |
| `__tests__/lib/flow/confirm-payment.test.ts` | Confirmation logic idempotency + branches. |
| `__tests__/app/api/webhooks/flow/confirm.test.ts` | Webhook handler branches. |

### Modified files

| Path | Change |
|---|---|
| `src/app/(app)/app/page.tsx` | Replace the `<button>Pagar Ahora</button>` placeholder with `<PayNowButton invoiceId={nextInvoice.id} />`. |
| `.env.example` | Add `FLOW_API_BASE`, `FLOW_API_KEY`, `FLOW_SECRET_KEY`, `FLOW_MOCK`. |
| `README.md` | Add Flow vars to env var table. |
| `ARCHITECTURE.md` | Mention Flow integration in external integrations section. |
| `NEXT-STEPS.md` | Move one-time Flow payment out of Pending; leave recurring/bank/platform items. |

---

## Task 1: Environment variables and documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Add Flow env vars to `.env.example`**

Append at the bottom of `.env.example`:

```
# Flow.cl payment integration
# Production Flow account (we do not use sandbox)
FLOW_API_BASE=https://www.flow.cl/api
FLOW_API_KEY=your_flow_api_key
FLOW_SECRET_KEY=your_flow_secret_key
# Optional: set to 'true' in .env.local only to short-circuit Flow
# API calls and auto-confirm payments locally. Must NEVER be set in
# production — the client will throw if FLOW_MOCK=true and
# VERCEL_ENV=production.
FLOW_MOCK=
```

- [ ] **Step 2: Update README env var table**

In `README.md`, find the env var table (the one with `NEXT_PUBLIC_SUPABASE_URL`, `CRON_SECRET`, etc.) and append these rows right before the closing of the table:

```markdown
| `FLOW_API_BASE` | Yes | Flow.cl API base URL (`https://www.flow.cl/api`) |
| `FLOW_API_KEY` | Yes | Flow.cl public API key |
| `FLOW_SECRET_KEY` | Yes | Flow.cl secret key (HMAC signing) |
| `FLOW_MOCK` | No | Set to `true` in `.env.local` only to mock Flow calls in development |
```

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: add Flow.cl environment variables"
```

---

## Task 2: HMAC signature helper

**Files:**
- Create: `src/lib/flow/signature.ts`
- Create: `__tests__/lib/flow/signature.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/flow/signature.test.ts`:

```typescript
import { signFlowParams } from "@/lib/flow/signature";

describe("signFlowParams", () => {
  const secretKey = "test_secret_key_12345";

  it("signs params sorted alphabetically by key", () => {
    const sig = signFlowParams(
      { apiKey: "abc", amount: "1000", commerceOrder: "order1" },
      secretKey
    );
    // Alphabetically sorted keys: amount < apiKey < commerceOrder
    // ('am' < 'ap' because 'm' < 'p'), so the signing string is:
    //   "amount=1000&apiKey=abc&commerceOrder=order1"
    // Known-answer computed with Node crypto:
    //   crypto.createHmac("sha256", "test_secret_key_12345")
    //     .update("amount=1000&apiKey=abc&commerceOrder=order1")
    //     .digest("hex")
    expect(sig).toBe(
      "99295731f4dce71f6f607c2a0df654173f39d461af0ceeddb837c8f006865395"
    );
  });

  it("is deterministic", () => {
    const a = signFlowParams({ b: "2", a: "1" }, secretKey);
    const b = signFlowParams({ a: "1", b: "2" }, secretKey);
    expect(a).toBe(b);
  });

  it("produces different signatures for different inputs", () => {
    const a = signFlowParams({ amount: "1000" }, secretKey);
    const b = signFlowParams({ amount: "2000" }, secretKey);
    expect(a).not.toBe(b);
  });

  it("sorts multi-key params alphabetically", () => {
    // apiKey sorts before amount sorts before commerceOrder sorts before email
    const sig = signFlowParams(
      {
        email: "a@b.cl",
        amount: "500",
        commerceOrder: "ord",
        apiKey: "k",
      },
      secretKey
    );
    expect(typeof sig).toBe("string");
    expect(sig.length).toBe(64); // HMAC-SHA256 hex = 64 chars
  });

  it("returns lowercase hex", () => {
    const sig = signFlowParams({ a: "1" }, secretKey);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

The known-answer hex `99295731f4dce71f6f607c2a0df654173f39d461af0ceeddb837c8f006865395` was pre-computed by running:

```bash
node -e "console.log(require('crypto').createHmac('sha256','test_secret_key_12345').update('amount=1000&apiKey=abc&commerceOrder=order1').digest('hex'))"
```

Note: the signing string uses alphabetically sorted keys, so `amount` comes before `apiKey` (because `'am' < 'ap'`). If you want to double-check, run that command and confirm the output matches the value in the test.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/lib/flow/signature.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `signFlowParams`**

Create `src/lib/flow/signature.ts`:

```typescript
import { createHmac } from "node:crypto";

/**
 * Sign a set of Flow.cl API request params with HMAC-SHA256.
 *
 * Flow requires params to be sorted alphabetically by key, concatenated
 * as `key1=value1&key2=value2&...`, then signed with the merchant's
 * secret key. The resulting hex digest is appended to the request body
 * as `s=<signature>`.
 *
 * Do NOT include the `s` key in the input to this function — it is the
 * output.
 */
export function signFlowParams(
  params: Record<string, string>,
  secretKey: string
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHmac("sha256", secretKey).update(toSign).digest("hex");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/lib/flow/signature.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/flow/signature.ts __tests__/lib/flow/signature.test.ts
git commit -m "feat(flow): add HMAC-SHA256 signature helper for Flow API"
```

---

## Task 3: Flow API client (with mock mode)

**Files:**
- Create: `src/lib/flow/client.ts`
- Create: `__tests__/lib/flow/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/flow/client.test.ts`:

```typescript
import { createFlowClient } from "@/lib/flow/client";

// Helper to set env vars for a single test
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

describe("createFlowClient", () => {
  const baseEnv = {
    FLOW_API_BASE: "https://www.flow.cl/api",
    FLOW_API_KEY: "test_api_key",
    FLOW_SECRET_KEY: "test_secret",
  };

  describe("mock mode", () => {
    it("short-circuits createPayment without calling fetch", async () => {
      const fetchSpy = jest
        .spyOn(globalThis, "fetch")
        .mockImplementation(() => {
          throw new Error("fetch should not be called in mock mode");
        });

      await withEnv(
        { ...baseEnv, FLOW_MOCK: "true", VERCEL_ENV: undefined },
        async () => {
          const client = createFlowClient();
          const result = await client.createPayment({
            commerceOrder: "payment-abc",
            subject: "Test",
            amount: 5000,
            email: "test@example.com",
            urlConfirmation: "http://localhost:3000/api/webhooks/flow/confirm",
            urlReturn: "http://localhost:3000/app/pagos/retorno",
          });

          expect(result.token).toMatch(/^mock_/);
          expect(result.url).toContain("/app/pagos/retorno/mock");
          expect(result.url).toContain("paymentId=payment-abc");
          expect(fetchSpy).not.toHaveBeenCalled();
        }
      );

      fetchSpy.mockRestore();
    });

    it("throws if FLOW_MOCK=true AND VERCEL_ENV=production", () => {
      withEnv(
        { ...baseEnv, FLOW_MOCK: "true", VERCEL_ENV: "production" },
        () => {
          expect(() => createFlowClient()).toThrow(/mock.*production/i);
        }
      );
    });

    it("does NOT throw if FLOW_MOCK=true AND VERCEL_ENV=preview", () => {
      withEnv(
        { ...baseEnv, FLOW_MOCK: "true", VERCEL_ENV: "preview" },
        () => {
          expect(() => createFlowClient()).not.toThrow();
        }
      );
    });
  });

  describe("real mode", () => {
    it("createPayment POSTs to FLOW_API_BASE/payment/create with signed body", async () => {
      const fetchSpy = jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              token: "real_token_123",
              url: "https://www.flow.cl/app/web/pay.php",
              flowOrder: 99999,
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        );

      await withEnv({ ...baseEnv, FLOW_MOCK: undefined }, async () => {
        const client = createFlowClient();
        const result = await client.createPayment({
          commerceOrder: "payment-xyz",
          subject: "CluPay - Club - abril",
          amount: 10000,
          email: "parent@test.cl",
          urlConfirmation: "https://example.com/webhook",
          urlReturn: "https://example.com/return",
        });

        expect(result.token).toBe("real_token_123");
        expect(result.url).toBe("https://www.flow.cl/app/web/pay.php");

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe("https://www.flow.cl/api/payment/create");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({
          "content-type": "application/x-www-form-urlencoded",
        });
        // Body must include all params and a signature
        const body = init?.body as string;
        expect(body).toContain("apiKey=test_api_key");
        expect(body).toContain("amount=10000");
        expect(body).toContain("commerceOrder=payment-xyz");
        expect(body).toMatch(/&s=[0-9a-f]{64}$/);
      });

      fetchSpy.mockRestore();
    });

    it("createPayment throws on non-2xx response", async () => {
      const fetchSpy = jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(JSON.stringify({ message: "Bad request" }), {
            status: 400,
          })
        );

      await withEnv({ ...baseEnv, FLOW_MOCK: undefined }, async () => {
        const client = createFlowClient();
        await expect(
          client.createPayment({
            commerceOrder: "o",
            subject: "s",
            amount: 1,
            email: "e@e.cl",
            urlConfirmation: "u",
            urlReturn: "u",
          })
        ).rejects.toThrow(/Flow.*400/i);
      });

      fetchSpy.mockRestore();
    });

    it("getPaymentStatus POSTs to /payment/getStatus with token", async () => {
      const fetchSpy = jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              flowOrder: 99999,
              commerceOrder: "payment-xyz",
              status: 2,
              amount: 10000,
              subject: "Test",
              payer: "parent@test.cl",
            }),
            { status: 200 }
          )
        );

      await withEnv({ ...baseEnv, FLOW_MOCK: undefined }, async () => {
        const client = createFlowClient();
        const status = await client.getPaymentStatus("tok_123");
        expect(status.status).toBe(2);
        expect(status.amount).toBe(10000);
        expect(status.commerceOrder).toBe("payment-xyz");

        const body = fetchSpy.mock.calls[0][1]?.body as string;
        expect(body).toContain("apiKey=test_api_key");
        expect(body).toContain("token=tok_123");
        expect(body).toMatch(/&s=[0-9a-f]{64}$/);
      });

      fetchSpy.mockRestore();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/lib/flow/client.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement the Flow client**

Create `src/lib/flow/client.ts`:

```typescript
import { signFlowParams } from "./signature";

export interface FlowCreatePaymentInput {
  commerceOrder: string;
  subject: string;
  amount: number;
  email: string;
  urlConfirmation: string;
  urlReturn: string;
}

export interface FlowCreatePaymentResult {
  token: string;
  url: string;
  flowOrder?: number;
}

export interface FlowPaymentStatus {
  flowOrder: number;
  commerceOrder: string;
  status: 1 | 2 | 3 | 4;
  amount: number;
  subject: string;
  payer: string;
}

export interface FlowClient {
  createPayment(input: FlowCreatePaymentInput): Promise<FlowCreatePaymentResult>;
  getPaymentStatus(token: string): Promise<FlowPaymentStatus>;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function createFlowClient(): FlowClient {
  const mockMode = process.env.FLOW_MOCK === "true";
  const vercelEnv = process.env.VERCEL_ENV;

  // Safety guard: never allow mock mode in production
  if (mockMode && vercelEnv === "production") {
    throw new Error(
      "FLOW_MOCK cannot be enabled when VERCEL_ENV=production. " +
        "Refusing to mock Flow payments in production."
    );
  }

  if (mockMode) {
    return {
      async createPayment(input) {
        const token = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const url = `${appUrl()}/app/pagos/retorno/mock?paymentId=${encodeURIComponent(
          input.commerceOrder
        )}&token=${encodeURIComponent(token)}`;
        return { token, url };
      },
      async getPaymentStatus(_token) {
        throw new Error(
          "getPaymentStatus should not be called in FLOW_MOCK mode"
        );
      },
    };
  }

  const apiBase = requireEnv("FLOW_API_BASE");
  const apiKey = requireEnv("FLOW_API_KEY");
  const secretKey = requireEnv("FLOW_SECRET_KEY");

  async function postSigned<T>(
    path: string,
    params: Record<string, string>
  ): Promise<T> {
    const withKey = { ...params, apiKey };
    const s = signFlowParams(withKey, secretKey);
    const body = new URLSearchParams({ ...withKey, s }).toString();
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Flow API ${path} returned ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }

  return {
    async createPayment(input) {
      const params: Record<string, string> = {
        commerceOrder: input.commerceOrder,
        subject: input.subject,
        amount: String(input.amount),
        email: input.email,
        urlConfirmation: input.urlConfirmation,
        urlReturn: input.urlReturn,
        currency: "CLP",
      };
      return postSigned<FlowCreatePaymentResult>("/payment/create", params);
    },

    async getPaymentStatus(token) {
      return postSigned<FlowPaymentStatus>("/payment/getStatus", { token });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/lib/flow/client.test.ts
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/flow/client.ts __tests__/lib/flow/client.test.ts
git commit -m "feat(flow): add Flow API client with mock mode and prod guard"
```

---

## Task 4: `confirmPayment` shared logic

**Files:**
- Create: `src/lib/flow/confirm-payment.ts`
- Create: `__tests__/lib/flow/confirm-payment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/flow/confirm-payment.test.ts`:

```typescript
import { confirmPayment } from "@/lib/flow/confirm-payment";

// Mock email sender
jest.mock("@/lib/email/send-notification", () => ({
  sendNotification: jest.fn().mockResolvedValue(undefined),
}));

// Helper to build a fake Supabase client that captures calls
interface FakeState {
  payments: Record<string, any>;
  invoices: Record<string, any>;
}

function makeFakeSupabase(state: FakeState) {
  const calls: { table: string; op: string; args: any }[] = [];

  function from(table: string) {
    return {
      select: (_cols: string) => ({
        eq: (col: string, val: any) => ({
          single: async () => {
            calls.push({ table, op: "select", args: { col, val } });
            if (table === "payments") {
              const row = state.payments[val];
              return { data: row ?? null, error: row ? null : { message: "not found" } };
            }
            if (table === "invoices") {
              const row = state.invoices[val];
              return { data: row ?? null, error: row ? null : { message: "not found" } };
            }
            return { data: null, error: { message: "unknown table" } };
          },
          maybeSingle: async () => {
            calls.push({ table, op: "select", args: { col, val } });
            const row =
              table === "payments" ? state.payments[val] : state.invoices[val];
            return { data: row ?? null, error: null };
          },
        }),
      }),
      update: (patch: any) => ({
        eq: async (col: string, val: any) => {
          calls.push({ table, op: "update", args: { col, val, patch } });
          if (table === "payments" && state.payments[val]) {
            state.payments[val] = { ...state.payments[val], ...patch };
          }
          if (table === "invoices" && state.invoices[val]) {
            state.invoices[val] = { ...state.invoices[val], ...patch };
          }
          return { error: null };
        },
      }),
    };
  }

  return { from, calls } as any;
}

describe("confirmPayment", () => {
  const paymentId = "pay-1";
  const invoiceId = "inv-1";
  const parentId = "parent-1";
  const clubId = "club-1";
  const amount = 15000;

  let state: FakeState;

  beforeEach(() => {
    state = {
      payments: {
        [paymentId]: {
          id: paymentId,
          invoice_id: invoiceId,
          amount,
          flow_transaction_id: "tok_abc",
          status: "pending",
          method: "card_link",
        },
      },
      invoices: {
        [invoiceId]: {
          id: invoiceId,
          parent_id: parentId,
          club_id: clubId,
          total: amount,
          status: "pending",
          period_month: 4,
          period_year: 2026,
          clubs: { name: "Test Club" },
          profiles: { email: "parent@test.cl" },
        },
      },
    };
    jest.clearAllMocks();
  });

  it("marks payment completed, invoice paid, and sends email (happy path)", async () => {
    const fake = makeFakeSupabase(state);
    const { sendNotification } = require("@/lib/email/send-notification");

    const result = await confirmPayment({
      supabase: fake,
      paymentId,
      flowAmount: amount,
      flowStatus: 2,
    });

    expect(result).toEqual({ ok: true });
    expect(state.payments[paymentId].status).toBe("completed");
    expect(state.payments[paymentId].paid_at).toBeTruthy();
    expect(state.invoices[invoiceId].status).toBe("paid");
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when payment is already completed", async () => {
    state.payments[paymentId].status = "completed";
    state.invoices[invoiceId].status = "paid";
    const fake = makeFakeSupabase(state);
    const { sendNotification } = require("@/lib/email/send-notification");

    const result = await confirmPayment({
      supabase: fake,
      paymentId,
      flowAmount: amount,
      flowStatus: 2,
    });

    expect(result).toEqual({ ok: true, alreadyProcessed: true });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("rejects with amount_mismatch when Flow amount differs", async () => {
    const fake = makeFakeSupabase(state);
    const { sendNotification } = require("@/lib/email/send-notification");

    const result = await confirmPayment({
      supabase: fake,
      paymentId,
      flowAmount: amount + 1,
      flowStatus: 2,
    });

    expect(result).toEqual({ ok: false, reason: "amount_mismatch" });
    expect(state.payments[paymentId].status).toBe("pending");
    expect(state.invoices[invoiceId].status).toBe("pending");
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("marks payment failed on Flow rejected status (3)", async () => {
    const fake = makeFakeSupabase(state);
    const { sendNotification } = require("@/lib/email/send-notification");

    const result = await confirmPayment({
      supabase: fake,
      paymentId,
      flowAmount: amount,
      flowStatus: 3,
    });

    expect(result).toEqual({ ok: true, failed: true });
    expect(state.payments[paymentId].status).toBe("failed");
    expect(state.invoices[invoiceId].status).toBe("pending");
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does nothing on Flow pending status (1)", async () => {
    const fake = makeFakeSupabase(state);
    const result = await confirmPayment({
      supabase: fake,
      paymentId,
      flowAmount: amount,
      flowStatus: 1,
    });
    expect(result).toEqual({ ok: true, stillPending: true });
    expect(state.payments[paymentId].status).toBe("pending");
    expect(state.invoices[invoiceId].status).toBe("pending");
  });

  it("skips invoice update if invoice already paid (manual path)", async () => {
    state.invoices[invoiceId].status = "paid";
    const fake = makeFakeSupabase(state);
    const { sendNotification } = require("@/lib/email/send-notification");

    const result = await confirmPayment({
      supabase: fake,
      paymentId,
      flowAmount: amount,
      flowStatus: 2,
    });

    expect(result.ok).toBe(true);
    expect(state.payments[paymentId].status).toBe("completed");
    expect(state.invoices[invoiceId].status).toBe("paid");
    // Email still sent — accurately reflects that Flow also received payment
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("does not throw if email send fails", async () => {
    const { sendNotification } = require("@/lib/email/send-notification");
    sendNotification.mockRejectedValueOnce(new Error("SMTP down"));

    const fake = makeFakeSupabase(state);
    const result = await confirmPayment({
      supabase: fake,
      paymentId,
      flowAmount: amount,
      flowStatus: 2,
    });

    expect(result.ok).toBe(true);
    expect(state.payments[paymentId].status).toBe("completed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/lib/flow/confirm-payment.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `confirmPayment`**

Create `src/lib/flow/confirm-payment.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { paymentConfirmationEmail } from "@/lib/email/templates";
import { sendNotification } from "@/lib/email/send-notification";
import { formatCLP } from "@/lib/format";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export interface ConfirmPaymentInput {
  supabase: SupabaseClient;
  paymentId: string;
  flowAmount: number;
  flowStatus: 1 | 2 | 3 | 4;
}

export type ConfirmPaymentResult =
  | { ok: true }
  | { ok: true; alreadyProcessed: true }
  | { ok: true; failed: true }
  | { ok: true; stillPending: true }
  | { ok: false; reason: "amount_mismatch" | "not_found" | "update_failed" };

/**
 * Shared confirmation logic for Flow payments. Called by the webhook
 * and the mock return route. Idempotent: safe to call multiple times
 * with the same payment. Amount is verified against the stored
 * `payments.amount` before any state changes.
 *
 * Does NOT use the `mark_invoice_paid` RPC because that RPC inserts a
 * new payments row, which would duplicate the row already inserted
 * by the server action.
 */
export async function confirmPayment(
  input: ConfirmPaymentInput
): Promise<ConfirmPaymentResult> {
  const { supabase, paymentId, flowAmount, flowStatus } = input;

  // Load payment
  const { data: payment, error: paymentErr } = await supabase
    .from("payments")
    .select("id, invoice_id, amount, status")
    .eq("id", paymentId)
    .single();

  if (paymentErr || !payment) {
    console.error("[confirmPayment] payment not found", paymentId, paymentErr);
    return { ok: false, reason: "not_found" };
  }

  // Idempotency: already completed → no-op
  if (payment.status === "completed") {
    return { ok: true, alreadyProcessed: true };
  }

  // Flow still pending — do nothing, will webhook again
  if (flowStatus === 1) {
    return { ok: true, stillPending: true };
  }

  // Flow rejected/cancelled → mark payment failed
  if (flowStatus === 3 || flowStatus === 4) {
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("id", paymentId);
    return { ok: true, failed: true };
  }

  // flowStatus === 2 (paid) — verify amount
  if (flowAmount !== payment.amount) {
    console.error(
      "[confirmPayment] CRITICAL: Flow amount mismatch",
      { paymentId, expected: payment.amount, actual: flowAmount }
    );
    return { ok: false, reason: "amount_mismatch" };
  }

  // Update payment first
  const now = new Date().toISOString();
  const { error: payUpdateErr } = await supabase
    .from("payments")
    .update({ status: "completed", paid_at: now })
    .eq("id", paymentId);

  if (payUpdateErr) {
    console.error("[confirmPayment] payment update failed", payUpdateErr);
    return { ok: false, reason: "update_failed" };
  }

  // Load invoice for update + email
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, parent_id, club_id, total, status, period_month, period_year, clubs(name), profiles(email)"
    )
    .eq("id", payment.invoice_id)
    .single();

  if (invErr || !invoice) {
    console.error("[confirmPayment] invoice lookup failed", invErr);
    return { ok: false, reason: "update_failed" };
  }

  // Only update invoice if not already paid (prevents double-paid state
  // when admin already marked it paid manually)
  if (invoice.status !== "paid") {
    const { error: invUpdateErr } = await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: now })
      .eq("id", invoice.id);

    if (invUpdateErr) {
      console.error("[confirmPayment] invoice update failed", invUpdateErr);
      return { ok: false, reason: "update_failed" };
    }
  }

  // Send confirmation email (fire-and-forget failure handling)
  const parentEmail = (invoice.profiles as any)?.email;
  const clubName = (invoice.clubs as any)?.name ?? "Tu club";

  if (parentEmail) {
    const periodLabel = `${MONTH_NAMES[invoice.period_month - 1]} ${invoice.period_year}`;
    const { subject, html } = paymentConfirmationEmail(
      clubName,
      formatCLP(invoice.total),
      periodLabel
    );

    try {
      await sendNotification({
        supabase,
        parentId: invoice.parent_id,
        clubId: invoice.club_id,
        email: parentEmail,
        type: "confirmation",
        subject,
        html,
        metadata: {
          invoice_id: invoice.id,
          payment_id: paymentId,
          event: "flow_payment_confirmed",
        },
      });
    } catch (err) {
      console.error("[confirmPayment] email send failed, not rolling back", err);
    }
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/lib/flow/confirm-payment.test.ts
```

Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/flow/confirm-payment.ts __tests__/lib/flow/confirm-payment.test.ts
git commit -m "feat(flow): add idempotent confirmPayment shared logic"
```

---

## Task 5: `createFlowPayment` server action

**Files:**
- Create: `src/lib/actions/create-flow-payment.ts`

No unit test for this task — it glues together Supabase auth, the Flow client, and DB inserts, all of which are covered by tests elsewhere. Local manual testing via mock mode (Task 9) will validate it end-to-end.

- [ ] **Step 1: Implement the server action**

Create `src/lib/actions/create-flow-payment.ts`:

```typescript
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createFlowClient } from "@/lib/flow/client";

interface CreateFlowPaymentResult {
  success: boolean;
  url?: string;
  error?: string;
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Initiates a Flow.cl payment for an invoice. Called from the parent
 * portal "Pagar Ahora" button.
 *
 * Flow:
 * 1. Verify authenticated parent owns this invoice.
 * 2. Verify invoice is payable (pending or overdue).
 * 3. Dedupe: reject if a pending payment was created less than 30 min
 *    ago for the same invoice (prevents duplicate Flow checkouts).
 * 4. Pre-insert payments row with status=pending.
 * 5. Call Flow createPayment; on failure, mark payments row failed.
 * 6. Store Flow token in payments.flow_transaction_id.
 * 7. Return redirect URL to client.
 */
export async function createFlowPayment(
  invoiceId: string
): Promise<CreateFlowPaymentResult> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión expirada" };

  // Load invoice and validate ownership + status
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, parent_id, club_id, total, status, period_month, period_year, clubs(name)")
    .eq("id", invoiceId)
    .single();

  if (invErr || !invoice) {
    return { success: false, error: "Factura no encontrada" };
  }
  if (invoice.parent_id !== user.id) {
    return { success: false, error: "No autorizado" };
  }
  if (invoice.status !== "pending" && invoice.status !== "overdue") {
    return { success: false, error: "Esta factura no se puede pagar" };
  }

  // Dedupe: any recent pending payment for this invoice?
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("payments")
    .select("id, created_at, flow_transaction_id")
    .eq("invoice_id", invoiceId)
    .eq("status", "pending")
    .not("flow_transaction_id", "is", null)
    .gte("created_at", thirtyMinAgo)
    .limit(1);

  if (recent && recent.length > 0) {
    return {
      success: false,
      error: "Ya tienes un pago en curso. Espera unos minutos e intenta nuevamente.",
    };
  }

  // Fetch parent email for the Flow checkout
  const serviceClient = createServiceRoleClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  const parentEmail = profile?.email;
  if (!parentEmail) {
    return { success: false, error: "No tenemos tu email en el sistema" };
  }

  // Pre-insert payments row
  const { data: payment, error: insertErr } = await supabase
    .from("payments")
    .insert({
      invoice_id: invoiceId,
      amount: invoice.total,
      method: "card_link",
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !payment) {
    console.error("[createFlowPayment] pre-insert failed", insertErr);
    return { success: false, error: "No pudimos iniciar el pago" };
  }

  // Call Flow
  const clubName = (invoice.clubs as any)?.name ?? "CluPay";
  const periodLabel = `${MONTH_NAMES[invoice.period_month - 1]} ${invoice.period_year}`;
  const subject = `CluPay - ${clubName} - ${periodLabel}`;

  const flow = createFlowClient();
  let flowResult;
  try {
    flowResult = await flow.createPayment({
      commerceOrder: payment.id,
      subject,
      amount: invoice.total,
      email: parentEmail,
      urlConfirmation: `${appUrl()}/api/webhooks/flow/confirm`,
      urlReturn: `${appUrl()}/app/pagos/retorno`,
    });
  } catch (err) {
    console.error("[createFlowPayment] Flow createPayment failed", err);
    // Mark row failed so it does not block dedupe
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id);
    return { success: false, error: "No pudimos conectar con Flow. Intenta nuevamente." };
  }

  // Store token on the payments row
  const { error: updateErr } = await supabase
    .from("payments")
    .update({ flow_transaction_id: flowResult.token })
    .eq("id", payment.id);

  if (updateErr) {
    console.error("[createFlowPayment] token update failed", updateErr);
    // The payment was created at Flow, but we could not store the token.
    // This is recoverable via the webhook (Flow will POST the token, we
    // look it up by... we can't, without the token stored). Safer to
    // mark failed and let the parent retry.
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id);
    return { success: false, error: "Error interno. Intenta nuevamente." };
  }

  return { success: true, url: flowResult.url };
}
```

- [ ] **Step 2: Type-check the file**

```bash
npx tsc --noEmit
```

Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/create-flow-payment.ts
git commit -m "feat(flow): add createFlowPayment server action"
```

---

## Task 6: Webhook route handler

**Files:**
- Create: `src/app/api/webhooks/flow/confirm/route.ts`
- Create: `__tests__/app/api/webhooks/flow/confirm.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/app/api/webhooks/flow/confirm.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { POST } from "@/app/api/webhooks/flow/confirm/route";

jest.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: jest.fn(),
}));
jest.mock("@/lib/flow/client", () => ({
  createFlowClient: jest.fn(),
}));
jest.mock("@/lib/flow/confirm-payment", () => ({
  confirmPayment: jest.fn(),
}));

const {
  createServiceRoleClient,
} = require("@/lib/supabase/service") as { createServiceRoleClient: jest.Mock };
const { createFlowClient } = require("@/lib/flow/client") as { createFlowClient: jest.Mock };
const { confirmPayment } = require("@/lib/flow/confirm-payment") as { confirmPayment: jest.Mock };

function makeRequest(body: string): Request {
  return new Request("http://localhost/api/webhooks/flow/confirm", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("POST /api/webhooks/flow/confirm", () => {
  let fakeSupabase: any;
  let fakeFlowClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    fakeSupabase = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: "pay-1", amount: 5000 },
              error: null,
            }),
          })),
        })),
      })),
    };
    createServiceRoleClient.mockReturnValue(fakeSupabase);

    fakeFlowClient = {
      getPaymentStatus: jest.fn().mockResolvedValue({
        flowOrder: 1,
        commerceOrder: "pay-1",
        status: 2,
        amount: 5000,
        subject: "s",
        payer: "p@p.cl",
      }),
    };
    createFlowClient.mockReturnValue(fakeFlowClient);

    confirmPayment.mockResolvedValue({ ok: true });
  });

  it("returns 400 when token is missing", async () => {
    const res = await POST(makeRequest(""));
    expect(res.status).toBe(400);
  });

  it("calls getPaymentStatus and delegates to confirmPayment", async () => {
    const res = await POST(makeRequest("token=tok_abc"));
    expect(res.status).toBe(200);
    expect(fakeFlowClient.getPaymentStatus).toHaveBeenCalledWith("tok_abc");
    expect(confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: "pay-1",
        flowAmount: 5000,
        flowStatus: 2,
      })
    );
  });

  it("returns 200 with no side effects when payments row not found", async () => {
    fakeSupabase.from = jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    }));

    const res = await POST(makeRequest("token=unknown"));
    expect(res.status).toBe(200);
    expect(confirmPayment).not.toHaveBeenCalled();
  });

  it("returns 500 when getPaymentStatus throws (Flow retry)", async () => {
    fakeFlowClient.getPaymentStatus.mockRejectedValue(new Error("network"));
    const res = await POST(makeRequest("token=tok_abc"));
    expect(res.status).toBe(500);
  });

  it("returns 200 when confirmPayment succeeds even if already processed", async () => {
    confirmPayment.mockResolvedValue({ ok: true, alreadyProcessed: true });
    const res = await POST(makeRequest("token=tok_abc"));
    expect(res.status).toBe(200);
  });

  it("returns 200 on amount_mismatch (do not retry)", async () => {
    confirmPayment.mockResolvedValue({ ok: false, reason: "amount_mismatch" });
    const res = await POST(makeRequest("token=tok_abc"));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/app/api/webhooks/flow/confirm.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement the webhook route**

Create `src/app/api/webhooks/flow/confirm/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createFlowClient } from "@/lib/flow/client";
import { confirmPayment } from "@/lib/flow/confirm-payment";

/**
 * Flow.cl webhook handler. Flow POSTs a `token` here after payment.
 *
 * We do NOT trust the inbound POST body beyond the token. Authenticity
 * comes from calling `payment/getStatus` back to Flow over HTTPS with
 * our secret key — the token is meaningless to an attacker without our
 * API credentials.
 *
 * Always returns 200 for processed (even already-confirmed, even
 * amount mismatch, even unknown token) so Flow stops retrying. Returns
 * 500 only for transient errors (network to Flow) so Flow retries.
 */
export async function POST(request: Request): Promise<Response> {
  // Parse form body
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const token = formData.get("token");
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  // Verify with Flow (authenticity check)
  let status;
  try {
    const flow = createFlowClient();
    status = await flow.getPaymentStatus(token);
  } catch (err) {
    console.error("[flow webhook] getPaymentStatus failed", err);
    // Transient — let Flow retry
    return NextResponse.json({ error: "flow lookup failed" }, { status: 500 });
  }

  // Look up our payments row by token
  const supabase = createServiceRoleClient();
  const { data: payment, error: lookupErr } = await supabase
    .from("payments")
    .select("id, amount, status")
    .eq("flow_transaction_id", token)
    .maybeSingle();

  if (lookupErr) {
    console.error("[flow webhook] payment lookup error", lookupErr);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }

  if (!payment) {
    // Unknown token — no side effects. Return 200 so Flow does not retry.
    console.warn("[flow webhook] unknown token", token);
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  // Delegate to shared logic
  const result = await confirmPayment({
    supabase,
    paymentId: payment.id,
    flowAmount: status.amount,
    flowStatus: status.status,
  });

  if (!result.ok && result.reason === "update_failed") {
    // Transient DB error — let Flow retry
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }

  // All other outcomes (ok, already processed, amount mismatch, failed) → 200
  return NextResponse.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/app/api/webhooks/flow/confirm.test.ts
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/flow/confirm/route.ts __tests__/app/api/webhooks/flow/confirm.test.ts
git commit -m "feat(flow): add webhook confirmation route handler"
```

---

## Task 7: Browser return page

**Files:**
- Create: `src/app/(app)/app/pagos/retorno/page.tsx`
- Create: `src/app/(app)/app/pagos/retorno/retorno-client.tsx`

No unit test — this is UI-only polling logic. Covered by manual testing in Task 9.

- [ ] **Step 1: Create the server page**

Create `src/app/(app)/app/pagos/retorno/page.tsx`:

```tsx
import { ReturnClient } from "./retorno-client";

interface PageProps {
  searchParams: Promise<{ token?: string; paymentId?: string }>;
}

export default async function RetornoPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Pago</h1>
        <p className="text-text-secondary">Verificando el resultado del pago</p>
      </div>
      <ReturnClient
        token={params.token ?? null}
        paymentId={params.paymentId ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the client polling component**

Create `src/app/(app)/app/pagos/retorno/retorno-client.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Phase = "checking" | "success" | "failed" | "timeout";

interface Props {
  token: string | null;
  paymentId: string | null;
}

export function ReturnClient({ token, paymentId }: Props) {
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let cancelled = false;
    const startedAt = Date.now();
    const TIMEOUT_MS = 30_000;
    const POLL_MS = 2_000;

    async function pollOnce() {
      if (cancelled) return;

      // Build query: prefer token (real Flow flow), fall back to paymentId (mock flow)
      let query = supabase.from("payments").select("status");
      if (token) {
        query = query.eq("flow_transaction_id", token);
      } else if (paymentId) {
        query = query.eq("id", paymentId);
      } else {
        setPhase("failed");
        return;
      }
      const { data } = await query.maybeSingle();

      if (cancelled) return;

      if (data?.status === "completed") {
        setPhase("success");
        return;
      }
      if (data?.status === "failed") {
        setPhase("failed");
        return;
      }

      if (Date.now() - startedAt >= TIMEOUT_MS) {
        setPhase("timeout");
        return;
      }

      setTimeout(pollOnce, POLL_MS);
    }

    pollOnce();

    return () => {
      cancelled = true;
    };
  }, [token, paymentId]);

  if (phase === "checking") {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
        <p className="text-text-secondary">Procesando tu pago…</p>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
        <div className="inline-block px-3 py-1.5 bg-success-light text-success text-sm font-medium rounded-full mb-2">
          Pago confirmado
        </div>
        <p className="text-text-secondary text-sm mb-4">
          Gracias, tu pago fue recibido.
        </p>
        <Link
          href="/app"
          className="inline-block py-3 px-6 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
        <div className="inline-block px-3 py-1.5 bg-danger-light text-danger text-sm font-medium rounded-full mb-2">
          Pago rechazado
        </div>
        <p className="text-text-secondary text-sm mb-4">
          El pago no se pudo procesar. Puedes intentarlo nuevamente.
        </p>
        <Link
          href="/app"
          className="inline-block py-3 px-6 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  // timeout
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
      <p className="text-text-secondary text-sm mb-4">
        Tu pago está siendo procesado. Te notificaremos por email cuando se
        confirme.
      </p>
      <Link
        href="/app"
        className="inline-block py-3 px-6 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors on the new files.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/app/pagos/retorno/
git commit -m "feat(flow): add parent return page with status polling"
```

---

## Task 8: Mock return route

**Files:**
- Create: `src/app/(app)/app/pagos/retorno/mock/route.ts`

This route only runs locally when `FLOW_MOCK=true`. It's the target of the fake URL returned by the Flow client's mock mode. It calls `confirmPayment` directly to simulate a successful Flow payment.

- [ ] **Step 1: Implement the mock route**

Create `src/app/(app)/app/pagos/retorno/mock/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { confirmPayment } from "@/lib/flow/confirm-payment";

/**
 * Mock-mode only. This route is the target of the fake URL returned by
 * the Flow client when FLOW_MOCK=true. It calls confirmPayment directly
 * (simulating a successful Flow payment) and redirects to the normal
 * return page, which will then see the payment as completed.
 *
 * Guarded so it refuses to run when FLOW_MOCK is not enabled — even if
 * someone hits the URL directly in production.
 */
export async function GET(request: Request): Promise<Response> {
  if (process.env.FLOW_MOCK !== "true") {
    return NextResponse.json(
      { error: "mock mode disabled" },
      { status: 404 }
    );
  }
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json(
      { error: "mock mode cannot run in production" },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  const paymentId = url.searchParams.get("paymentId");
  const token = url.searchParams.get("token");
  if (!paymentId || !token) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Store token on the payments row so the return page can find it by token
  await supabase
    .from("payments")
    .update({ flow_transaction_id: token })
    .eq("id", paymentId);

  // Look up amount so we can pass the matching flowAmount
  const { data: payment } = await supabase
    .from("payments")
    .select("id, amount")
    .eq("id", paymentId)
    .single();

  if (!payment) {
    return NextResponse.json({ error: "payment not found" }, { status: 404 });
  }

  await confirmPayment({
    supabase,
    paymentId: payment.id,
    flowAmount: payment.amount,
    flowStatus: 2,
  });

  // Redirect to the normal return page with the token
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.redirect(
    `${appUrl}/app/pagos/retorno?token=${encodeURIComponent(token)}`
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/app/pagos/retorno/mock/route.ts
git commit -m "feat(flow): add local mock return route for dev testing"
```

---

## Task 9: `PayNowButton` client component + wire up dashboard

**Files:**
- Create: `src/components/app/pay-now-button.tsx`
- Modify: `src/app/(app)/app/page.tsx`

- [ ] **Step 1: Create the button component**

Create `src/components/app/pay-now-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { createFlowPayment } from "@/lib/actions/create-flow-payment";

interface Props {
  invoiceId: string;
}

export function PayNowButton({ invoiceId }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await createFlowPayment(invoiceId);
      if (!result.success || !result.url) {
        setError(result.error ?? "Error al iniciar el pago");
        return;
      }
      window.location.href = result.url;
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Procesando…" : "Pagar Ahora"}
      </button>
      {error && (
        <p className="text-sm text-danger text-center">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace the placeholder in the dashboard**

In `src/app/(app)/app/page.tsx`, at the top of the file add the import after the other imports:

```typescript
import { PayNowButton } from "@/components/app/pay-now-button";
```

Then find the placeholder button (near line 81):

```tsx
          <button className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors">
            Pagar Ahora
          </button>
```

Replace it with:

```tsx
          <PayNowButton invoiceId={nextInvoice.id} />
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all previous tests still pass, no new failures.

- [ ] **Step 5: Manual local smoke test (mock mode)**

```bash
echo 'FLOW_API_BASE=https://www.flow.cl/api' >> .env.local
echo 'FLOW_API_KEY=test_key_not_real' >> .env.local
echo 'FLOW_SECRET_KEY=test_secret_not_real' >> .env.local
echo 'FLOW_MOCK=true' >> .env.local
npm run dev
```

In browser:
1. Login as `parent@clupay.test` / `test1234`.
2. On `/app`, verify you see an unpaid invoice with "Pagar Ahora" button.
3. Click "Pagar Ahora".
4. You should be redirected to `/app/pagos/retorno/mock?paymentId=...&token=mock_...`
5. That should immediately redirect to `/app/pagos/retorno?token=mock_...`
6. After a moment, you should see "Pago confirmado".
7. Go back to `/app` — the invoice should now show as paid, and the button should be gone (or show "Al día").
8. In Supabase dashboard, verify:
   - `payments` table has a new row with `status='completed'`, `method='card_link'`, `flow_transaction_id` starting with `mock_`, `paid_at` populated.
   - `invoices` table: the paid invoice has `status='paid'`, `paid_at` populated.
   - `notifications` table: new row with `type='confirmation'`, `status='sent'`.

Do not proceed to the commit step until all of the above are verified.

- [ ] **Step 6: Double-click dedupe test**

Still in mock mode, create a second unpaid test invoice (or reset an existing one to `pending`) and rapid-click "Pagar Ahora" twice. Only one payments row should be created. If you see two, the 30-min dedupe window is broken — investigate before proceeding.

- [ ] **Step 7: Commit**

```bash
git add src/components/app/pay-now-button.tsx src/app/\(app\)/app/page.tsx
git commit -m "feat(flow): wire Pagar Ahora button to createFlowPayment action"
```

---

## Task 10: Documentation updates

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `NEXT-STEPS.md`

- [ ] **Step 1: Update ARCHITECTURE.md**

In `ARCHITECTURE.md`, find the "External Integrations" section. It currently lists Gmail SMTP and Supabase Storage, with a "planned" reference to Flow.cl. Replace the Flow.cl planned line (in the diagram and in the text) with a real entry.

In the ASCII diagram, the "External Services (planned)" box that says `Flow.cl Payments` should be moved out of "planned" and mentioned as active. Change it to:

```
├─────────────────────────────────────────────────┤
│              External Services                   │
│  ┌─────────┐                                    │
│  │ Flow.cl │  Card payments (one-time)          │
│  │ Payments│                                    │
│  └─────────┘                                    │
└─────────────────────────────────────────────────┘
```

And in the "External Integrations" prose section, add a bullet:

```markdown
- **Flow.cl** — Chilean payment processor. Parents pay invoices through Flow's hosted checkout. CluPay is the merchant of record; settlement to clubs happens externally. Configured via `FLOW_API_BASE`, `FLOW_API_KEY`, `FLOW_SECRET_KEY`. Local development uses `FLOW_MOCK=true` to skip real charges.
```

- [ ] **Step 2: Update NEXT-STEPS.md**

In `NEXT-STEPS.md`, find the "Phase 2 — Money Flows" section, specifically the "Flow.cl payment integration" bullet. Replace it with a scoped-down version that reflects what's still pending:

```markdown
- **Flow.cl recurring subscriptions** — Card-on-file and auto-charge on the club billing day. One-time Flow payments via the "Pagar Ahora" button are live.
- **Flow.cl refunds** — Refund API integration. Refunds are currently handled manually through the Flow dashboard.
- **Bank transfer tracking** — Parents mark a transfer as "I paid" with a reference number, club admin confirms. Orthogonal to Flow.
```

Update the `_Last updated:_` line at the top to `2026-04-09`.

- [ ] **Step 3: Commit**

```bash
git add ARCHITECTURE.md NEXT-STEPS.md
git commit -m "docs: update architecture and next-steps for Flow integration"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass, including:
- `__tests__/lib/flow/signature.test.ts` (5)
- `__tests__/lib/flow/client.test.ts` (6)
- `__tests__/lib/flow/confirm-payment.test.ts` (7)
- `__tests__/app/api/webhooks/flow/confirm.test.ts` (6)
- Any pre-existing tests

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Confirm local mock flow still works end-to-end**

Re-run the manual smoke test from Task 9 Step 5. Confirm all verification points still pass.

- [ ] **Step 6: Remove `FLOW_MOCK=true` from `.env.local` before any non-mock dev work**

Edit `.env.local` and either delete the `FLOW_MOCK=true` line or comment it out. Without real `FLOW_API_KEY` / `FLOW_SECRET_KEY` values, any real Flow call will fail gracefully (the client will throw "Missing required env var"), but it is still good hygiene.

- [ ] **Step 7: Final commit (if anything changed in step 6)**

Only if there are uncommitted changes:

```bash
git status
# If .env.local is in .gitignore (it should be), this is a no-op.
```

---

## Production deployment checklist (manual, after merging)

This is NOT executed as part of the plan — it's a reference for the team when deploying to production.

1. **Flow dashboard:** confirm `urlConfirmation` is set to `https://<production-domain>/api/webhooks/flow/confirm` in the Flow merchant account settings.
2. **Vercel env vars:** set `FLOW_API_BASE=https://www.flow.cl/api`, `FLOW_API_KEY`, `FLOW_SECRET_KEY` in the Production environment. Do NOT set `FLOW_MOCK` in Production.
3. **(Optional) Preview env:** if you want PR previews to also mock, set `FLOW_MOCK=true` under the Preview environment only.
4. **Smoke test:** after deploy, create a test invoice for the Flow minimum (~$350 CLP), pay with a real card, verify the invoice marks paid and the email arrives. Refund manually via the Flow dashboard when done.
5. **Monitor:** watch Vercel logs during the first real payment for any `[flow webhook]` or `[confirmPayment]` errors.

---

## Out of scope for this plan (deferred to future plans)

- Recurring subscriptions via Flow `subscription/create`.
- Refunds via Flow API.
- Bank transfer manual tracking.
- Platform billing automation.
- Settlement from CluPay to clubs.
- Atomic confirmation via a single Supabase RPC (cross-cutting with invoice-generation atomicity in Phase 3).
- Paying multiple invoices in one checkout.
