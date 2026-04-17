# Per-Club Payment Method Configuration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each club admin choose which payment methods (card, Flow transfer, wallet, installments, direct bank transfer) are offered to parents. Add a direct-bank-transfer flow outside Flow.cl with manual reconciliation.

**Architecture:** 5 boolean toggles + 6 optional bank fields on `clubs`, plus an extension of the `payment_method` enum. A pure-TS helper derives the enabled methods from a `Club` row. The Flow client gains an optional `paymentMethod` passthrough. `createFlowPayment` accepts a `methodKey`, verifies it's still enabled, and maps it to a Flow ID. The parent's `PayNowButton` routes to Flow directly (1 method), to a selector page (2+ methods), or to a direct-transfer page (direct_transfer).

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (PostgreSQL), Tailwind CSS 4, Jest 30.

**Spec:** `docs/superpowers/specs/2026-04-17-payment-method-config-design.md`

---

## Context the engineer needs to know

**Project conventions you MUST follow:**

1. **Next.js 16 — not your training data.** Read `node_modules/next/dist/docs/` before writing Next-specific code (route params, `cookies()`, server actions). In Next 16, `cookies()` is async, and dynamic route `params` is a `Promise`.
2. **Supabase clients** come in three flavors — pick the right one:
   - `createClient` from `@/lib/supabase/client` — for client components.
   - `createServerSupabaseClient` from `@/lib/supabase/server` — async, for server components and server actions.
   - `createServiceRoleClient` from `@/lib/supabase/service` — bypasses RLS. Never import from client code.
3. **Server actions** live in `src/lib/actions/*.ts`, start with `"use server"`.
4. **Test layout** mirrors source under `__tests__/`. Jest config aliases `@/*` to `src/*`. Node-env tests need `/** @jest-environment node */` at the top (see `__tests__/lib/flow/client.test.ts`).
5. **Currency** is CLP integers.
6. **Commits** follow `feat(...)`, `fix(...)`, `test(...)`, `docs(...)` style. See `git log`. Keep each commit focused.
7. **RLS:** `clubs` is readable by its club admins. Updates to `clubs` by club admins are already allowed (see `00015_add_club_admin_update_policy.sql`).

**Flow.cl reference (read the spec too):**

- `payment/create` accepts `paymentMethod` (integer). Omitting it = show all active merchant methods. Specific IDs: `1` Webpay, `22` Khipu, `15` MachBank, `164` banca.me.
- Flow accepts **one ID or none** per transaction — no list.

**Files you will touch:**

- Migration: `supabase/migrations/00032_add_club_payment_config.sql` (new, highest number after 00031).
- Types: `src/types/index.ts`.
- New libs: `src/lib/club-payments.ts`, `src/lib/banks.ts`.
- Flow client: `src/lib/flow/client.ts`.
- Action: `src/lib/actions/create-flow-payment.ts` (modify), `src/lib/actions/update-club-payment-config.ts` (new).
- Parent UI: `src/components/app/pay-now-button.tsx` (modify), `src/app/(app)/app/pagos/metodo/[invoiceId]/page.tsx` (new), `src/app/(app)/app/pagos/transferencia/[invoiceId]/page.tsx` (new).
- Club admin UI: `src/components/club/payment-methods-section.tsx` (new), `src/components/club/club-config-form.tsx` (modify).
- Tests: `__tests__/lib/club-payments.test.ts` (new), `__tests__/lib/flow/client.test.ts` (extend), `__tests__/lib/actions/create-flow-payment.test.ts` (new), `__tests__/lib/actions/update-club-payment-config.test.ts` (new).

**Enum mapping (store these in `payments.method`):**

| `PaymentMethodKey` | stored as             |
|--------------------|-----------------------|
| `card`             | `card_link`           |
| `flow_transfer`    | `flow_transfer` (new) |
| `wallet`           | `flow_wallet` (new)   |
| `installments`     | `flow_installments` (new) |
| `direct_transfer`  | `bank_transfer`       |

**Existing helpers you must reuse:**

- `validateRut(rut)` / `formatRut(rut)` / `cleanRut(rut)` — `src/lib/rut/validate.ts`.
- `<RutInput>` component — `src/components/shared/rut-input.tsx`. Auto-formats with dots + validates modulo 11.
- `markInvoicePaid(invoiceId, amount, method?)` — `src/lib/actions/mark-invoice-paid.ts`. Unchanged by this plan.

---

## Task 1: Migration — add columns + extend enum

**Files:**
- Create: `supabase/migrations/00032_add_club_payment_config.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/00032_add_club_payment_config.sql` with:

```sql
-- Payment method toggles per club. Defaults preserve current behavior
-- (all Flow methods enabled). Direct transfer defaults off until the
-- club fills in its bank data.
ALTER TABLE clubs
  ADD COLUMN pm_card                 BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pm_flow_transfer        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pm_wallet               BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pm_installments         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN pm_direct_transfer      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN bank_holder_name        TEXT,
  ADD COLUMN bank_holder_rut         TEXT,
  ADD COLUMN bank_name               TEXT,
  ADD COLUMN bank_account_type       TEXT,
  ADD COLUMN bank_account_number     TEXT,
  ADD COLUMN bank_notification_email TEXT;

ALTER TABLE clubs
  ADD CONSTRAINT clubs_has_at_least_one_payment_method CHECK (
    pm_card OR pm_flow_transfer OR pm_wallet OR pm_installments OR pm_direct_transfer
  ),
  ADD CONSTRAINT clubs_direct_transfer_requires_bank_data CHECK (
    NOT pm_direct_transfer OR (
      bank_holder_name    IS NOT NULL AND
      bank_holder_rut     IS NOT NULL AND
      bank_name           IS NOT NULL AND
      bank_account_type   IN ('corriente', 'vista', 'ahorro') AND
      bank_account_number IS NOT NULL
    )
  );

-- Extend payment_method enum so payments.method can reflect the real channel.
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'flow_transfer';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'flow_wallet';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'flow_installments';
```

- [ ] **Step 2: Apply the migration to the Supabase project**

Use the Supabase MCP `apply_migration` tool with `name: "add_club_payment_config"` and the SQL above, or run via the Supabase dashboard SQL editor, or via the Supabase CLI (`supabase db push`). Confirm no errors.

- [ ] **Step 3: Verify in Supabase**

Run this query via the MCP `execute_sql` tool:

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'clubs' AND column_name LIKE 'pm_%' OR column_name LIKE 'bank_%'
ORDER BY ordinal_position;
```

Expected: 11 new columns listed with the right defaults.

Also verify the enum:

```sql
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'payment_method'::regtype ORDER BY enumsortorder;
```

Expected: `card_automatic`, `card_link`, `bank_transfer`, `flow_transfer`, `flow_wallet`, `flow_installments`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00032_add_club_payment_config.sql
git commit -m "feat(db): add per-club payment method config + extend payment_method enum"
```

---

## Task 2: Update `Club` TypeScript type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add new fields to the `Club` interface**

In `src/types/index.ts`, replace the existing `Club` interface (lines 39-52) with:

```ts
export interface Club {
  id: string;
  name: string;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_day: number;
  platform_fee_fixed: number;
  platform_fee_percent: number;
  due_day: number;
  auto_approve_invoices: boolean;
  pm_card: boolean;
  pm_flow_transfer: boolean;
  pm_wallet: boolean;
  pm_installments: boolean;
  pm_direct_transfer: boolean;
  bank_holder_name: string | null;
  bank_holder_rut: string | null;
  bank_name: string | null;
  bank_account_type: "corriente" | "vista" | "ahorro" | null;
  bank_account_number: string | null;
  bank_notification_email: string | null;
  created_at: string;
  updated_at: string;
}
```

Also extend `PaymentMethod`:

```ts
export type PaymentMethod =
  | "card_automatic"
  | "card_link"
  | "bank_transfer"
  | "flow_transfer"
  | "flow_wallet"
  | "flow_installments";
```

- [ ] **Step 2: Run the TypeScript compiler**

```bash
npx tsc --noEmit
```

Expected: no new errors. If errors appear in other files that read `Club` fields that don't exist anywhere else (they shouldn't), they indicate a real bug — investigate, don't suppress.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add club payment method fields + extended payment_method"
```

---

## Task 3: Create banks constant

**Files:**
- Create: `src/lib/banks.ts`

- [ ] **Step 1: Write the banks list**

Create `src/lib/banks.ts`:

```ts
export const CHILEAN_BANKS = [
  "Banco de Chile",
  "Banco BCI",
  "BancoEstado",
  "Banco Santander",
  "Banco Itaú",
  "Banco Scotiabank",
  "Banco Security",
  "Banco Falabella",
  "Banco Ripley",
  "Banco Internacional",
  "Banco Consorcio",
  "Banco BICE",
  "HSBC Bank",
  "Coopeuch",
  "Tenpo",
  "MercadoPago",
] as const;

export type ChileanBank = (typeof CHILEAN_BANKS)[number];

export const BANK_ACCOUNT_TYPES = [
  { value: "corriente", label: "Cuenta corriente" },
  { value: "vista", label: "Cuenta vista" },
  { value: "ahorro", label: "Cuenta de ahorro" },
] as const;

export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number]["value"];
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/banks.ts
git commit -m "feat(lib): add Chilean banks + account type constants"
```

---

## Task 4: Create `club-payments` helper (TDD)

**Files:**
- Test: `__tests__/lib/club-payments.test.ts`
- Create: `src/lib/club-payments.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/club-payments.test.ts`:

```ts
/** @jest-environment node */
import {
  getEnabledPaymentMethods,
  PAYMENT_METHOD_FLOW_ID,
  paymentMethodToEnum,
} from "@/lib/club-payments";
import type { Club } from "@/types";

function makeClub(overrides: Partial<Club> = {}): Club {
  return {
    id: "club-1",
    name: "Test",
    logo_url: null,
    contact_email: null,
    contact_phone: null,
    billing_day: 1,
    platform_fee_fixed: 0,
    platform_fee_percent: 0,
    due_day: 10,
    auto_approve_invoices: false,
    pm_card: false,
    pm_flow_transfer: false,
    pm_wallet: false,
    pm_installments: false,
    pm_direct_transfer: false,
    bank_holder_name: null,
    bank_holder_rut: null,
    bank_name: null,
    bank_account_type: null,
    bank_account_number: null,
    bank_notification_email: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("getEnabledPaymentMethods", () => {
  it("returns empty array when all methods disabled", () => {
    expect(getEnabledPaymentMethods(makeClub())).toEqual([]);
  });

  it("returns only enabled methods in fixed order", () => {
    const club = makeClub({
      pm_direct_transfer: true,
      pm_card: true,
      pm_flow_transfer: true,
    });
    const keys = getEnabledPaymentMethods(club).map((m) => m.key);
    expect(keys).toEqual(["card", "flow_transfer", "direct_transfer"]);
  });

  it("includes label and description for each method", () => {
    const club = makeClub({ pm_card: true });
    const [entry] = getEnabledPaymentMethods(club);
    expect(entry.key).toBe("card");
    expect(entry.label).toBeTruthy();
    expect(entry.description).toBeTruthy();
  });
});

describe("PAYMENT_METHOD_FLOW_ID", () => {
  it("maps each Flow key to an integer", () => {
    expect(PAYMENT_METHOD_FLOW_ID.card).toBe(1);
    expect(PAYMENT_METHOD_FLOW_ID.flow_transfer).toBe(22);
    expect(PAYMENT_METHOD_FLOW_ID.wallet).toBe(15);
    expect(PAYMENT_METHOD_FLOW_ID.installments).toBe(164);
  });
});

describe("paymentMethodToEnum", () => {
  it("maps every key to a payments.method enum value", () => {
    expect(paymentMethodToEnum("card")).toBe("card_link");
    expect(paymentMethodToEnum("flow_transfer")).toBe("flow_transfer");
    expect(paymentMethodToEnum("wallet")).toBe("flow_wallet");
    expect(paymentMethodToEnum("installments")).toBe("flow_installments");
    expect(paymentMethodToEnum("direct_transfer")).toBe("bank_transfer");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- club-payments
```

Expected: FAIL with `Cannot find module '@/lib/club-payments'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/club-payments.ts`:

```ts
import type { Club, PaymentMethod } from "@/types";

export type PaymentMethodKey =
  | "card"
  | "flow_transfer"
  | "wallet"
  | "installments"
  | "direct_transfer";

export type FlowMethodKey = Exclude<PaymentMethodKey, "direct_transfer">;

export const PAYMENT_METHOD_FLOW_ID: Record<FlowMethodKey, number> = {
  card: 1,
  flow_transfer: 22,
  wallet: 15,
  installments: 164,
};

export interface EnabledMethod {
  key: PaymentMethodKey;
  label: string;
  description: string;
}

const METHOD_METADATA: Record<
  PaymentMethodKey,
  { label: string; description: string; clubColumn: keyof Club }
> = {
  card: {
    label: "Tarjeta de crédito o débito",
    description: "Webpay — abono al día hábil siguiente",
    clubColumn: "pm_card",
  },
  flow_transfer: {
    label: "Transferencia bancaria Flow",
    description: "Pago inmediato desde tu banca online (Khipu)",
    clubColumn: "pm_flow_transfer",
  },
  wallet: {
    label: "Billetera digital",
    description: "MachBank, Onepay y otras billeteras",
    clubColumn: "pm_wallet",
  },
  installments: {
    label: "Cuotas sin tarjeta",
    description: "Paga en cuotas con banca.me sin usar tarjeta",
    clubColumn: "pm_installments",
  },
  direct_transfer: {
    label: "Transferencia directa al club",
    description: "El club confirmará tu pago en 24-48 horas hábiles",
    clubColumn: "pm_direct_transfer",
  },
};

const METHOD_ORDER: PaymentMethodKey[] = [
  "card",
  "flow_transfer",
  "wallet",
  "installments",
  "direct_transfer",
];

export function getEnabledPaymentMethods(club: Club): EnabledMethod[] {
  return METHOD_ORDER.filter((key) => club[METHOD_METADATA[key].clubColumn] === true).map(
    (key) => ({
      key,
      label: METHOD_METADATA[key].label,
      description: METHOD_METADATA[key].description,
    })
  );
}

export function paymentMethodToEnum(key: PaymentMethodKey): PaymentMethod {
  switch (key) {
    case "card":
      return "card_link";
    case "flow_transfer":
      return "flow_transfer";
    case "wallet":
      return "flow_wallet";
    case "installments":
      return "flow_installments";
    case "direct_transfer":
      return "bank_transfer";
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- club-payments
```

Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add __tests__/lib/club-payments.test.ts src/lib/club-payments.ts
git commit -m "feat(lib): add club-payments helper with Flow ID + enum mapping"
```

---

## Task 5: Extend Flow client to accept `paymentMethod`

**Files:**
- Modify: `src/lib/flow/client.ts`
- Test: `__tests__/lib/flow/client.test.ts`

- [ ] **Step 1: Add a failing test for the new parameter**

Open `__tests__/lib/flow/client.test.ts` and add this test inside the `describe("real mode", ...)` block, after the existing "createPayment POSTs ..." test:

```ts
it("createPayment includes paymentMethod in body when provided", async () => {
  const fetchSpy = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({ token: "t", url: "https://flow.cl/pay", flowOrder: 1 }),
        { status: 200 }
      )
    );

  await withEnv({ ...baseEnv, FLOW_MOCK: undefined }, async () => {
    const client = createFlowClient();
    await client.createPayment({
      commerceOrder: "p-1",
      subject: "s",
      amount: 1000,
      email: "a@b.cl",
      urlConfirmation: "u",
      urlReturn: "u",
      paymentMethod: 22,
    });

    const body = fetchSpy.mock.calls[0][1]?.body as string;
    expect(body).toContain("paymentMethod=22");
    // Signature must still be valid — the signed payload must include paymentMethod
    expect(body).toMatch(/&s=[0-9a-f]{64}$/);
  });

  fetchSpy.mockRestore();
});

it("createPayment omits paymentMethod from body when not provided", async () => {
  const fetchSpy = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({ token: "t", url: "https://flow.cl/pay", flowOrder: 1 }),
        { status: 200 }
      )
    );

  await withEnv({ ...baseEnv, FLOW_MOCK: undefined }, async () => {
    const client = createFlowClient();
    await client.createPayment({
      commerceOrder: "p-1",
      subject: "s",
      amount: 1000,
      email: "a@b.cl",
      urlConfirmation: "u",
      urlReturn: "u",
    });

    const body = fetchSpy.mock.calls[0][1]?.body as string;
    expect(body).not.toContain("paymentMethod=");
  });

  fetchSpy.mockRestore();
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- flow/client
```

Expected: FAIL because `paymentMethod` is not on `FlowCreatePaymentInput` (TypeScript error) OR is ignored by the client.

- [ ] **Step 3: Update the Flow client**

Open `src/lib/flow/client.ts`:

Replace the `FlowCreatePaymentInput` interface (lines 3-10) with:

```ts
export interface FlowCreatePaymentInput {
  commerceOrder: string;
  subject: string;
  amount: number;
  email: string;
  urlConfirmation: string;
  urlReturn: string;
  paymentMethod?: number;
}
```

Replace the real-mode `createPayment` implementation (lines 94-111) with:

```ts
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
      if (input.paymentMethod !== undefined) {
        params.paymentMethod = String(input.paymentMethod);
      }
      const { url, body } = signedRequest("/payment/create", params);
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      return handleResponse<FlowCreatePaymentResult>("/payment/create", res);
    },
```

Mock mode doesn't need changes (it already ignores extra fields).

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- flow/client
```

Expected: PASS for all tests (existing + 2 new).

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/flow/client.ts __tests__/lib/flow/client.test.ts
git commit -m "feat(flow): forward optional paymentMethod in createPayment"
```

---

## Task 6: Update `createFlowPayment` action (TDD)

**Files:**
- Test: `__tests__/lib/actions/create-flow-payment.test.ts` (new)
- Modify: `src/lib/actions/create-flow-payment.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/actions/create-flow-payment.test.ts`:

```ts
/** @jest-environment node */
import { createFlowPayment } from "@/lib/actions/create-flow-payment";

jest.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: jest.fn(),
}));
jest.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: jest.fn(),
}));
jest.mock("@/lib/flow/client", () => ({
  createFlowClient: jest.fn(),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createFlowClient } from "@/lib/flow/client";

const mockedServer = createServerSupabaseClient as jest.Mock;
const mockedService = createServiceRoleClient as jest.Mock;
const mockedFlow = createFlowClient as jest.Mock;

interface InvoiceRow {
  id: string;
  parent_id: string;
  club_id: string;
  total: number;
  status: string;
  period_month: number;
  period_year: number;
  clubs: { name: string };
}

interface ClubRow {
  pm_card: boolean;
  pm_flow_transfer: boolean;
  pm_wallet: boolean;
  pm_installments: boolean;
  pm_direct_transfer: boolean;
}

interface Fixtures {
  user: { id: string } | null;
  invoice: InvoiceRow | null;
  club: ClubRow;
  recentPending: unknown[];
  profileEmail: string | null;
  paymentInsert: { data: { id: string } | null; error: unknown };
  paymentUpdate: { error: unknown };
  flowCreate: () => Promise<{ token: string; url: string }>;
}

function install(fixtures: Fixtures) {
  mockedServer.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: fixtures.user } }),
    },
    from: (table: string) => {
      if (table === "invoices") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: fixtures.invoice,
                error: fixtures.invoice ? null : new Error("not found"),
              }),
            }),
          }),
        };
      }
      if (table === "clubs") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: fixtures.club, error: null }),
            }),
          }),
        };
      }
      throw new Error("unexpected server table " + table);
    },
  });

  const paymentsQuery = {
    select: () => paymentsQuery,
    eq: () => paymentsQuery,
    not: () => paymentsQuery,
    gte: () => paymentsQuery,
    limit: async () => ({ data: fixtures.recentPending }),
    insert: () => ({
      select: () => ({
        single: async () => fixtures.paymentInsert,
      }),
    }),
    update: () => ({
      eq: async () => fixtures.paymentUpdate,
    }),
  };

  mockedService.mockReturnValue({
    from: (table: string) => {
      if (table === "payments") return paymentsQuery;
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { email: fixtures.profileEmail } }),
            }),
          }),
        };
      }
      throw new Error("unexpected service table " + table);
    },
  });

  const createPaymentMock = jest.fn(fixtures.flowCreate);
  mockedFlow.mockReturnValue({ createPayment: createPaymentMock });
  return { createPaymentMock };
}

function baseInvoice(): InvoiceRow {
  return {
    id: "inv-1",
    parent_id: "user-1",
    club_id: "club-1",
    total: 10000,
    status: "pending",
    period_month: 4,
    period_year: 2026,
    clubs: { name: "Club X" },
  };
}

function baseClub(overrides: Partial<ClubRow> = {}): ClubRow {
  return {
    pm_card: false,
    pm_flow_transfer: false,
    pm_wallet: false,
    pm_installments: false,
    pm_direct_transfer: false,
    ...overrides,
  };
}

describe("createFlowPayment", () => {
  it("rejects an unauthenticated user", async () => {
    install({
      user: null,
      invoice: null,
      club: baseClub(),
      recentPending: [],
      profileEmail: null,
      paymentInsert: { data: null, error: null },
      paymentUpdate: { error: null },
      flowCreate: async () => ({ token: "t", url: "u" }),
    });
    const result = await createFlowPayment("inv-1", "card");
    expect(result.success).toBe(false);
  });

  it("rejects when the requested method is not enabled for the club", async () => {
    install({
      user: { id: "user-1" },
      invoice: baseInvoice(),
      club: baseClub({ pm_flow_transfer: true }),
      recentPending: [],
      profileEmail: "p@x.cl",
      paymentInsert: { data: { id: "p-1" }, error: null },
      paymentUpdate: { error: null },
      flowCreate: async () => ({ token: "t", url: "u" }),
    });
    const result = await createFlowPayment("inv-1", "card");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no disponible/i);
  });

  it("forwards the mapped Flow ID when method is enabled", async () => {
    const { createPaymentMock } = install({
      user: { id: "user-1" },
      invoice: baseInvoice(),
      club: baseClub({ pm_card: true }),
      recentPending: [],
      profileEmail: "p@x.cl",
      paymentInsert: { data: { id: "p-1" }, error: null },
      paymentUpdate: { error: null },
      flowCreate: async () => ({ token: "tok", url: "https://flow/pay" }),
    });
    const result = await createFlowPayment("inv-1", "card");
    expect(result.success).toBe(true);
    expect(result.url).toContain("token=tok");
    expect(createPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: 1 })
    );
  });

  it("forwards paymentMethod=22 for flow_transfer", async () => {
    const { createPaymentMock } = install({
      user: { id: "user-1" },
      invoice: baseInvoice(),
      club: baseClub({ pm_flow_transfer: true }),
      recentPending: [],
      profileEmail: "p@x.cl",
      paymentInsert: { data: { id: "p-1" }, error: null },
      paymentUpdate: { error: null },
      flowCreate: async () => ({ token: "tok", url: "https://flow/pay" }),
    });
    await createFlowPayment("inv-1", "flow_transfer");
    expect(createPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: 22 })
    );
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- create-flow-payment
```

Expected: FAIL — the action currently accepts only `invoiceId` (one arg), not `(invoiceId, methodKey)`.

- [ ] **Step 3: Update `create-flow-payment.ts`**

Replace the contents of `src/lib/actions/create-flow-payment.ts` with:

```ts
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createFlowClient } from "@/lib/flow/client";
import {
  type FlowMethodKey,
  PAYMENT_METHOD_FLOW_ID,
  paymentMethodToEnum,
} from "@/lib/club-payments";

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

const CLUB_COLUMN_BY_KEY: Record<FlowMethodKey, string> = {
  card: "pm_card",
  flow_transfer: "pm_flow_transfer",
  wallet: "pm_wallet",
  installments: "pm_installments",
};

/**
 * Initiates a Flow.cl payment for an invoice for a specific method key.
 * The club must have the corresponding toggle enabled; otherwise we
 * refuse before inserting any payments row.
 */
export async function createFlowPayment(
  invoiceId: string,
  methodKey: FlowMethodKey
): Promise<CreateFlowPaymentResult> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión expirada" };

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, parent_id, club_id, total, status, period_month, period_year, clubs(name)")
    .eq("id", invoiceId)
    .single();

  if (invErr || !invoice) return { success: false, error: "Factura no encontrada" };
  if (invoice.parent_id !== user.id) return { success: false, error: "No autorizado" };
  if (invoice.status !== "pending" && invoice.status !== "overdue") {
    return { success: false, error: "Esta factura no se puede pagar" };
  }

  // Verify the method is still enabled on the club (race-safe)
  const { data: club, error: clubErr } = await supabase
    .from("clubs")
    .select("pm_card, pm_flow_transfer, pm_wallet, pm_installments")
    .eq("id", invoice.club_id)
    .single();

  if (clubErr || !club) return { success: false, error: "Club no encontrado" };

  const column = CLUB_COLUMN_BY_KEY[methodKey] as
    | "pm_card"
    | "pm_flow_transfer"
    | "pm_wallet"
    | "pm_installments";
  if (!club[column]) {
    return { success: false, error: "Método no disponible" };
  }

  const serviceClient = createServiceRoleClient();

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recent } = await serviceClient
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

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();
  const parentEmail = profile?.email;
  if (!parentEmail) return { success: false, error: "No tenemos tu email en el sistema" };

  const { data: payment, error: insertErr } = await serviceClient
    .from("payments")
    .insert({
      invoice_id: invoiceId,
      amount: invoice.total,
      method: paymentMethodToEnum(methodKey),
      status: "pending",
    })
    .select("id")
    .single();
  if (insertErr || !payment) {
    console.error("[createFlowPayment] pre-insert failed", insertErr);
    return { success: false, error: "No pudimos iniciar el pago" };
  }

  const clubName = (invoice.clubs as { name: string } | null)?.name ?? "CluPay";
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
      paymentMethod: PAYMENT_METHOD_FLOW_ID[methodKey],
    });
  } catch (err) {
    console.error("[createFlowPayment] Flow createPayment failed", err);
    await serviceClient.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return { success: false, error: "No pudimos conectar con Flow. Intenta nuevamente." };
  }

  const { error: updateErr } = await serviceClient
    .from("payments")
    .update({ flow_transaction_id: flowResult.token })
    .eq("id", payment.id);
  if (updateErr) {
    console.error("[createFlowPayment] token update failed", updateErr);
    await serviceClient.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return { success: false, error: "Error interno. Intenta nuevamente." };
  }

  const checkoutUrl = `${flowResult.url}?token=${encodeURIComponent(flowResult.token)}`;
  return { success: true, url: checkoutUrl };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- create-flow-payment
```

Expected: PASS (4 tests).

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all prior tests still pass.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. If the pay-now-button still calls `createFlowPayment(invoiceId)` with one arg, TypeScript will flag it here — we'll fix that in Task 12.

- [ ] **Step 7: Commit**

Note: TypeScript errors in `pay-now-button.tsx` are expected at this point (fixed in Task 12). Commit the action + test together; the UI fix comes in its own commit.

```bash
git add src/lib/actions/create-flow-payment.ts __tests__/lib/actions/create-flow-payment.test.ts
git commit -m "feat(payments): createFlowPayment accepts methodKey + enforces club config"
```

---

## Task 7: `updateClubPaymentConfig` server action (TDD)

**Files:**
- Test: `__tests__/lib/actions/update-club-payment-config.test.ts` (new)
- Create: `src/lib/actions/update-club-payment-config.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/actions/update-club-payment-config.test.ts`:

```ts
/** @jest-environment node */
import { updateClubPaymentConfig } from "@/lib/actions/update-club-payment-config";

jest.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: jest.fn(),
}));
jest.mock("@/lib/club", () => ({
  getClubForUser: jest.fn(),
}));
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";

const mockedServer = createServerSupabaseClient as jest.Mock;
const mockedClub = getClubForUser as jest.Mock;

function install({ clubId, updateError = null }: { clubId: string | null; updateError?: unknown }) {
  mockedClub.mockResolvedValue(clubId);
  const updateEq = jest.fn(async () => ({ error: updateError }));
  mockedServer.mockResolvedValue({
    from: () => ({
      update: () => ({ eq: updateEq }),
    }),
  });
  return { updateEq };
}

function baseInput() {
  return {
    pm_card: true,
    pm_flow_transfer: false,
    pm_wallet: false,
    pm_installments: false,
    pm_direct_transfer: false,
    bank_holder_name: "",
    bank_holder_rut: "",
    bank_name: "",
    bank_account_type: "" as "" | "corriente" | "vista" | "ahorro",
    bank_account_number: "",
    bank_notification_email: "",
  };
}

describe("updateClubPaymentConfig", () => {
  it("rejects when user has no club", async () => {
    install({ clubId: null });
    const result = await updateClubPaymentConfig(baseInput());
    expect(result.success).toBe(false);
  });

  it("rejects when every toggle is off", async () => {
    install({ clubId: "c-1" });
    const result = await updateClubPaymentConfig({ ...baseInput(), pm_card: false });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/al menos un método/i);
  });

  it("rejects direct transfer without bank data", async () => {
    install({ clubId: "c-1" });
    const result = await updateClubPaymentConfig({
      ...baseInput(),
      pm_direct_transfer: true,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/datos bancarios/i);
  });

  it("rejects invalid RUT when direct transfer is on", async () => {
    install({ clubId: "c-1" });
    const result = await updateClubPaymentConfig({
      ...baseInput(),
      pm_direct_transfer: true,
      bank_holder_name: "Club X SpA",
      bank_holder_rut: "11.111.111-1",
      bank_name: "Banco de Chile",
      bank_account_type: "corriente",
      bank_account_number: "12345",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rut/i);
  });

  it("persists a valid payload", async () => {
    const { updateEq } = install({ clubId: "c-1" });
    const result = await updateClubPaymentConfig({
      ...baseInput(),
      pm_direct_transfer: true,
      bank_holder_name: "Club X SpA",
      bank_holder_rut: "76.123.456-7",
      bank_name: "Banco de Chile",
      bank_account_type: "corriente",
      bank_account_number: "12345678",
      bank_notification_email: "pagos@club.cl",
    });
    expect(result.success).toBe(true);
    expect(updateEq).toHaveBeenCalled();
  });

  it("clears bank fields when direct transfer is off", async () => {
    const updates: Array<Record<string, unknown>> = [];
    mockedClub.mockResolvedValue("c-1");
    mockedServer.mockResolvedValue({
      from: () => ({
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      }),
    });
    const result = await updateClubPaymentConfig({
      ...baseInput(),
      pm_card: true,
      pm_direct_transfer: false,
      bank_holder_name: "x",
      bank_holder_rut: "x",
      bank_name: "x",
      bank_account_type: "corriente",
      bank_account_number: "x",
      bank_notification_email: "x@y.cl",
    });
    expect(result.success).toBe(true);
    expect(updates[0].bank_holder_name).toBeNull();
    expect(updates[0].bank_account_type).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- update-club-payment-config
```

Expected: FAIL with `Cannot find module '@/lib/actions/update-club-payment-config'`.

- [ ] **Step 3: Implement the action**

Create `src/lib/actions/update-club-payment-config.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { validateRut } from "@/lib/rut/validate";

export interface UpdateClubPaymentConfigInput {
  pm_card: boolean;
  pm_flow_transfer: boolean;
  pm_wallet: boolean;
  pm_installments: boolean;
  pm_direct_transfer: boolean;
  bank_holder_name: string;
  bank_holder_rut: string;
  bank_name: string;
  bank_account_type: "" | "corriente" | "vista" | "ahorro";
  bank_account_number: string;
  bank_notification_email: string;
}

interface UpdateResult {
  success: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateClubPaymentConfig(
  input: UpdateClubPaymentConfigInput
): Promise<UpdateResult> {
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) return { success: false, error: "No tienes un club asignado" };

  const anyEnabled =
    input.pm_card ||
    input.pm_flow_transfer ||
    input.pm_wallet ||
    input.pm_installments ||
    input.pm_direct_transfer;
  if (!anyEnabled) {
    return { success: false, error: "Debes habilitar al menos un método de pago" };
  }

  if (input.pm_direct_transfer) {
    const holder = input.bank_holder_name.trim();
    const rut = input.bank_holder_rut.trim();
    const bank = input.bank_name.trim();
    const accType = input.bank_account_type;
    const accNum = input.bank_account_number.trim();

    if (!holder || !rut || !bank || !accType || !accNum) {
      return {
        success: false,
        error: "Completa todos los datos bancarios para transferencia directa",
      };
    }
    if (!validateRut(rut)) {
      return { success: false, error: "El RUT del titular no es válido" };
    }
    if (!["corriente", "vista", "ahorro"].includes(accType)) {
      return { success: false, error: "Tipo de cuenta inválido" };
    }
  }

  const notifEmail = input.bank_notification_email.trim();
  if (notifEmail && !EMAIL_RE.test(notifEmail)) {
    return { success: false, error: "El email de notificación no es válido" };
  }

  const payload = input.pm_direct_transfer
    ? {
        pm_card: input.pm_card,
        pm_flow_transfer: input.pm_flow_transfer,
        pm_wallet: input.pm_wallet,
        pm_installments: input.pm_installments,
        pm_direct_transfer: true,
        bank_holder_name: input.bank_holder_name.trim(),
        bank_holder_rut: input.bank_holder_rut.trim(),
        bank_name: input.bank_name.trim(),
        bank_account_type: input.bank_account_type || null,
        bank_account_number: input.bank_account_number.trim(),
        bank_notification_email: notifEmail || null,
      }
    : {
        pm_card: input.pm_card,
        pm_flow_transfer: input.pm_flow_transfer,
        pm_wallet: input.pm_wallet,
        pm_installments: input.pm_installments,
        pm_direct_transfer: false,
        bank_holder_name: null,
        bank_holder_rut: null,
        bank_name: null,
        bank_account_type: null,
        bank_account_number: null,
        bank_notification_email: null,
      };

  const { error } = await supabase.from("clubs").update(payload).eq("id", clubId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/club/configuracion");
  return { success: true };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- update-club-payment-config
```

Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/update-club-payment-config.ts __tests__/lib/actions/update-club-payment-config.test.ts
git commit -m "feat(actions): add updateClubPaymentConfig with RUT + bank validation"
```

---

## Task 8: `PaymentMethodsSection` component

**Files:**
- Create: `src/components/club/payment-methods-section.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/club/payment-methods-section.tsx`:

```tsx
"use client";

import { useState } from "react";
import { RutInput } from "@/components/shared/rut-input";
import { CHILEAN_BANKS, BANK_ACCOUNT_TYPES, type BankAccountType } from "@/lib/banks";
import { updateClubPaymentConfig } from "@/lib/actions/update-club-payment-config";
import type { Club } from "@/types";

interface Props {
  club: Club;
}

interface ToggleRowProps {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function ToggleRow({ id, label, description, tooltip, checked, onChange }: ToggleRowProps) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 py-3 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/20"
      />
      <div className="flex-1 text-sm">
        <div className="flex items-center gap-1 font-medium text-text">
          <span>{label}</span>
          {tooltip && (
            <span
              className="text-text-secondary cursor-help"
              title={tooltip}
              aria-label={tooltip}
            >
              (?)
            </span>
          )}
        </div>
        {description && <p className="text-text-secondary">{description}</p>}
      </div>
    </label>
  );
}

export function PaymentMethodsSection({ club }: Props) {
  const [pmCard, setPmCard] = useState(club.pm_card);
  const [pmFlowTransfer, setPmFlowTransfer] = useState(club.pm_flow_transfer);
  const [pmWallet, setPmWallet] = useState(club.pm_wallet);
  const [pmInstallments, setPmInstallments] = useState(club.pm_installments);
  const [pmDirectTransfer, setPmDirectTransfer] = useState(club.pm_direct_transfer);

  const [holderName, setHolderName] = useState(club.bank_holder_name ?? "");
  const [holderRut, setHolderRut] = useState(club.bank_holder_rut ?? "");
  const [rutValid, setRutValid] = useState(
    club.bank_holder_rut ? true : false
  );
  const [bankName, setBankName] = useState(club.bank_name ?? "");
  const [accountType, setAccountType] = useState<"" | BankAccountType>(
    (club.bank_account_type as BankAccountType | null) ?? ""
  );
  const [accountNumber, setAccountNumber] = useState(club.bank_account_number ?? "");
  const [notifEmail, setNotifEmail] = useState(club.bank_notification_email ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const anyEnabled =
      pmCard || pmFlowTransfer || pmWallet || pmInstallments || pmDirectTransfer;
    if (!anyEnabled) {
      setError("Debes habilitar al menos un método de pago");
      return;
    }
    if (pmDirectTransfer) {
      if (
        !holderName.trim() ||
        !holderRut.trim() ||
        !bankName ||
        !accountType ||
        !accountNumber.trim()
      ) {
        setError("Completa todos los datos bancarios para transferencia directa");
        return;
      }
      if (!rutValid) {
        setError("El RUT del titular no es válido");
        return;
      }
    }

    setSaving(true);
    const result = await updateClubPaymentConfig({
      pm_card: pmCard,
      pm_flow_transfer: pmFlowTransfer,
      pm_wallet: pmWallet,
      pm_installments: pmInstallments,
      pm_direct_transfer: pmDirectTransfer,
      bank_holder_name: holderName,
      bank_holder_rut: holderRut,
      bank_name: bankName,
      bank_account_type: accountType,
      bank_account_number: accountNumber,
      bank_notification_email: notifEmail,
    });
    setSaving(false);

    if (!result.success) {
      setError(result.error ?? "No pudimos guardar la configuración");
      return;
    }
    setSuccess(true);
  }

  const inputClass =
    "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
  const labelClass = "block text-sm font-medium text-text mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold text-text">Medios de pago</h2>
        <p className="text-sm text-text-secondary">
          Elige qué formas de pago ofreces a los padres.
        </p>
      </div>

      {error && (
        <div className="bg-danger-light text-danger text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-success-light text-success text-sm px-4 py-3 rounded-lg">
          Medios de pago guardados
        </div>
      )}

      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl px-4">
        <ToggleRow
          id="pm_card"
          label="Tarjeta de crédito o débito"
          description="Webpay · abono al día hábil siguiente"
          checked={pmCard}
          onChange={setPmCard}
        />
        <ToggleRow
          id="pm_flow_transfer"
          label="Transferencia bancaria Flow"
          description="Pago inmediato desde la banca online"
          tooltip="El padre transfiere desde su banco en línea, Flow concilia al instante."
          checked={pmFlowTransfer}
          onChange={setPmFlowTransfer}
        />
        <ToggleRow
          id="pm_wallet"
          label="Billetera digital"
          description="MachBank, Onepay"
          tooltip="Apps de billetera chilenas como MachBank y Onepay."
          checked={pmWallet}
          onChange={setPmWallet}
        />
        <ToggleRow
          id="pm_installments"
          label="Cuotas sin tarjeta"
          description="banca.me"
          tooltip="El padre paga en cuotas con banca.me. El club recibe el monto completo upfront."
          checked={pmInstallments}
          onChange={setPmInstallments}
        />
        <ToggleRow
          id="pm_direct_transfer"
          label="Transferencia directa a tu cuenta"
          description="Conciliación manual · tú marcas como pagado al recibir el comprobante"
          checked={pmDirectTransfer}
          onChange={setPmDirectTransfer}
        />
      </div>

      {pmDirectTransfer && (
        <div className="border border-gray-100 rounded-xl p-4 space-y-4">
          <p className="text-sm font-medium text-text">Datos bancarios</p>

          <div>
            <label htmlFor="bank_holder_name" className={labelClass}>
              Titular *
            </label>
            <input
              id="bank_holder_name"
              type="text"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>RUT del titular *</label>
            <RutInput
              value={holderRut}
              onChange={(value, isValid) => {
                setHolderRut(value);
                setRutValid(isValid);
              }}
            />
          </div>

          <div>
            <label htmlFor="bank_name" className={labelClass}>
              Banco *
            </label>
            <select
              id="bank_name"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className={inputClass}
            >
              <option value="">Selecciona un banco</option>
              {CHILEAN_BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bank_account_type" className={labelClass}>
              Tipo de cuenta *
            </label>
            <select
              id="bank_account_type"
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as BankAccountType)}
              className={inputClass}
            >
              <option value="">Selecciona un tipo</option>
              {BANK_ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bank_account_number" className={labelClass}>
              Número de cuenta *
            </label>
            <input
              id="bank_account_number"
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="bank_notification_email" className={labelClass}>
              Email para comprobantes (opcional)
            </label>
            <input
              id="bank_notification_email"
              type="email"
              value={notifEmail}
              onChange={(e) => setNotifEmail(e.target.value)}
              className={inputClass}
              placeholder="pagos@miclub.cl"
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
      >
        {saving ? "Guardando..." : "Guardar medios de pago"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/club/payment-methods-section.tsx
git commit -m "feat(club): add PaymentMethodsSection with toggles + bank form"
```

---

## Task 9: Mount the section in `/club/configuracion`

**Files:**
- Modify: `src/app/(club)/club/configuracion/page.tsx`

- [ ] **Step 1: Mount the new section below the existing config form**

Replace `src/app/(club)/club/configuracion/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClubForUser } from "@/lib/club";
import { ClubConfigForm } from "@/components/club/club-config-form";
import { PaymentMethodsSection } from "@/components/club/payment-methods-section";
import type { Club } from "@/types";

export default async function ConfiguracionPage() {
  const supabase = await createServerSupabaseClient();
  const clubId = await getClubForUser(supabase);
  if (!clubId) redirect("/login");

  const { data: club } = await supabase.from("clubs").select("*").eq("id", clubId).single();
  if (!club) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Configuración</h1>
      <p className="text-text-secondary mb-8">Ajustes de tu club</p>
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <ClubConfigForm club={club as Club} />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <PaymentMethodsSection club={club as Club} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(club)/club/configuracion/page.tsx
git commit -m "feat(club): mount PaymentMethodsSection in club configuration page"
```

---

## Task 10: Method selector page

**Files:**
- Create: `src/app/(app)/app/pagos/metodo/[invoiceId]/page.tsx`
- Create: `src/app/(app)/app/pagos/metodo/[invoiceId]/method-list.tsx`

- [ ] **Step 1: Write the server-rendered page**

Create `src/app/(app)/app/pagos/metodo/[invoiceId]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getEnabledPaymentMethods } from "@/lib/club-payments";
import { formatCLP } from "@/lib/format";
import { MethodList } from "./method-list";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default async function PaymentMethodSelectorPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, parent_id, total, period_month, period_year, status, clubs(*)")
    .eq("id", invoiceId)
    .single();

  if (!invoice || invoice.parent_id !== user.id) redirect("/app");
  if (invoice.status !== "pending" && invoice.status !== "overdue") redirect("/app");

  const club = invoice.clubs as unknown as import("@/types").Club;
  const methods = getEnabledPaymentMethods(club);
  if (methods.length === 0) redirect("/app");

  const periodLabel = `${MONTH_NAMES[invoice.period_month - 1]} ${invoice.period_year}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">¿Cómo quieres pagar?</h1>
        <p className="text-text-secondary">
          Factura {periodLabel} · {formatCLP(invoice.total)}
        </p>
      </div>
      <MethodList invoiceId={invoiceId} methods={methods} />
    </div>
  );
}
```

- [ ] **Step 2: Write the client-side list**

Create `src/app/(app)/app/pagos/metodo/[invoiceId]/method-list.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFlowPayment } from "@/lib/actions/create-flow-payment";
import {
  type EnabledMethod,
  type FlowMethodKey,
} from "@/lib/club-payments";

interface Props {
  invoiceId: string;
  methods: EnabledMethod[];
}

export function MethodList({ invoiceId, methods }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSelect(method: EnabledMethod) {
    setError(null);
    if (method.key === "direct_transfer") {
      router.push(`/app/pagos/transferencia/${invoiceId}`);
      return;
    }
    const flowKey = method.key as FlowMethodKey;
    startTransition(async () => {
      const result = await createFlowPayment(invoiceId, flowKey);
      if (!result.success || !result.url) {
        setError(result.error ?? "No pudimos iniciar el pago");
        return;
      }
      window.location.href = result.url;
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-danger bg-danger-light rounded-lg px-4 py-3">
          {error}
        </p>
      )}
      {methods.map((method) => (
        <button
          key={method.key}
          type="button"
          onClick={() => handleSelect(method)}
          disabled={pending}
          className="w-full bg-white border border-gray-100 rounded-2xl p-5 text-left flex items-center gap-4 hover:border-primary transition-colors disabled:opacity-60"
        >
          <div className="flex-1">
            <p className="text-sm font-semibold text-text">{method.label}</p>
            <p className="text-xs text-text-secondary mt-0.5">{method.description}</p>
          </div>
          <span className="text-text-secondary">›</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/app/pagos/metodo"
git commit -m "feat(parent): add payment method selector page"
```

---

## Task 11: Direct-transfer page

**Files:**
- Create: `src/app/(app)/app/pagos/transferencia/[invoiceId]/page.tsx`
- Create: `src/app/(app)/app/pagos/transferencia/[invoiceId]/copyable-field.tsx`

- [ ] **Step 1: Write the server-rendered page**

Create `src/app/(app)/app/pagos/transferencia/[invoiceId]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/format";
import { BANK_ACCOUNT_TYPES } from "@/lib/banks";
import { CopyableField } from "./copyable-field";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default async function DirectTransferPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, parent_id, total, period_month, period_year, status, clubs(*)")
    .eq("id", invoiceId)
    .single();

  if (!invoice || invoice.parent_id !== user.id) redirect("/app");
  if (invoice.status !== "pending" && invoice.status !== "overdue") redirect("/app");

  const club = invoice.clubs as unknown as import("@/types").Club;
  if (
    !club.pm_direct_transfer ||
    !club.bank_holder_name ||
    !club.bank_holder_rut ||
    !club.bank_name ||
    !club.bank_account_type ||
    !club.bank_account_number
  ) {
    redirect("/app");
  }

  const periodLabel = `${MONTH_NAMES[invoice.period_month - 1]} ${invoice.period_year}`;
  const accountTypeLabel =
    BANK_ACCOUNT_TYPES.find((t) => t.value === club.bank_account_type)?.label ?? club.bank_account_type;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Transferencia directa</h1>
        <p className="text-text-secondary">
          Factura {periodLabel} · {formatCLP(invoice.total)}
        </p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
        <CopyableField label="Titular" value={club.bank_holder_name} />
        <CopyableField label="RUT" value={club.bank_holder_rut} />
        <CopyableField label="Banco" value={club.bank_name} />
        <CopyableField label="Tipo de cuenta" value={accountTypeLabel} />
        <CopyableField label="Número de cuenta" value={club.bank_account_number} />
      </div>

      <div className="bg-info-light border border-info/20 rounded-2xl p-5 text-sm text-text">
        <p className="font-medium mb-1">Instrucciones</p>
        <p>
          Transfiere el monto exacto de <strong>{formatCLP(invoice.total)}</strong>
          {club.bank_notification_email
            ? <> y envía el comprobante a <strong>{club.bank_notification_email}</strong></>
            : null}.
        </p>
        <p className="mt-2 text-text-secondary">
          El club confirmará tu pago en 24-48 horas hábiles.
        </p>
      </div>

      <Link
        href="/app"
        className="inline-block px-5 py-2.5 border border-gray-200 text-sm text-text rounded-lg hover:bg-gray-50"
      >
        Volver
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Write the copyable field component**

Create `src/app/(app)/app/pagos/transferencia/[invoiceId]/copyable-field.tsx`:

```tsx
"use client";

import { useState } from "react";

interface Props {
  label: string;
  value: string;
}

export function CopyableField({ label, value }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in insecure contexts; fall back silently.
    }
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs text-text-secondary">{label}</p>
        <p className="text-sm font-medium text-text">{value}</p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="text-xs font-medium text-primary hover:text-primary-dark"
      >
        {copied ? "Copiado ✓" : "Copiar"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Check that `bg-info-light` and `border-info/20` are defined**

Run:

```bash
grep -n "info" tailwind.config.ts src/app/globals.css 2>/dev/null || true
```

If `info-light` / `info` tokens are not defined in the design system, replace them in the page with `bg-primary/5 border-primary/20` (safe fallback). If they exist, leave as-is.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/app/pagos/transferencia"
git commit -m "feat(parent): add direct transfer bank details page"
```

---

## Task 12: Update `PayNowButton` routing

**Files:**
- Modify: `src/components/app/pay-now-button.tsx`
- Modify: `src/app/(app)/app/page.tsx` (pass `club`)

- [ ] **Step 1: Update `PayNowButton`**

Replace `src/components/app/pay-now-button.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFlowPayment } from "@/lib/actions/create-flow-payment";
import {
  getEnabledPaymentMethods,
  type FlowMethodKey,
} from "@/lib/club-payments";
import type { Club } from "@/types";

interface Props {
  invoiceId: string;
  club: Club;
}

export function PayNowButton({ invoiceId, club }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const methods = getEnabledPaymentMethods(club);

  function onClick() {
    setError(null);

    if (methods.length === 0) {
      setError("El club no tiene métodos de pago habilitados");
      return;
    }

    if (methods.length >= 2) {
      router.push(`/app/pagos/metodo/${invoiceId}`);
      return;
    }

    const only = methods[0];
    if (only.key === "direct_transfer") {
      router.push(`/app/pagos/transferencia/${invoiceId}`);
      return;
    }

    const flowKey = only.key as FlowMethodKey;
    startTransition(async () => {
      const result = await createFlowPayment(invoiceId, flowKey);
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
      {error && <p className="text-sm text-danger text-center">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Update the parent dashboard to fetch and pass the full club**

Open `src/app/(app)/app/page.tsx`. The existing invoice query selects `clubs:club_id(name)` (line ~27) — we need the full club to derive methods.

Replace the invoices query (the second `supabase.from("invoices")` call in `Promise.all`) with:

```ts
    supabase
      .from("invoices")
      .select("*, clubs:club_id(*)")
      .eq("parent_id", user.id)
      .in("status", ["overdue", "pending", "generated"])
      .order("due_date"),
```

Then replace the `<PayNowButton invoiceId={nextInvoice.id} />` line with:

```tsx
          <PayNowButton
            invoiceId={nextInvoice.id}
            club={nextInvoice.clubs as unknown as import("@/types").Club}
          />
```

The narrowing `(nextInvoice.clubs as { name: string } | null)?.name ?? "Club"` above still works — it reads `.name` from the same full row.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/app/pay-now-button.tsx "src/app/(app)/app/page.tsx"
git commit -m "feat(parent): route PayNowButton by enabled methods"
```

---

## Task 13: End-to-end verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite clean**

```bash
npm test
```

Expected: **all** tests pass. No skipped tests related to this feature. If any new test was added but is skipped or pending, either complete it or remove it.

- [ ] **Step 2: TypeScript compile**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: zero errors. Warnings in pre-existing files are acceptable — do not fix unrelated code.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: successful build. Payment routes should appear in the route manifest (`/app/pagos/metodo/[invoiceId]`, `/app/pagos/transferencia/[invoiceId]`).

- [ ] **Step 5: Manual smoke test (local, FLOW_MOCK=true)**

Start the dev server:

```bash
FLOW_MOCK=true npm run dev
```

Open `http://localhost:3000` in a browser and verify all of the following against your seeded test club:

1. **Default behavior preserved.** Log in as `parent@clupay.test`. `Pagar Ahora` still works (routes directly to Flow's mock checkout) because the seed club has all Flow toggles on and `pm_direct_transfer` off.
2. **Admin turns off all Flow methods, keeps direct transfer.** Log in as `club@clupay.test`, go to `/club/configuracion`, uncheck every Flow toggle, enable "Transferencia directa", fill in bank details (use RUT `76.123.456-7` or any valid RUT), save. The form should accept it.
3. **Admin tries to save zero methods.** Uncheck all 5 toggles and save. Form shows "Debes habilitar al menos un método de pago" and the save is blocked. Re-check at least one.
4. **Admin tries direct transfer without bank data.** Turn on `pm_direct_transfer` and leave bank fields blank. Save. Form shows the bank-data error.
5. **Admin tries direct transfer with invalid RUT.** Enter `11.111.111-1` (invalid). Save. Form shows the RUT error.
6. **Parent with 1 Flow method only.** With club in state (1) (card only), `Pagar Ahora` sends straight to Flow mock.
7. **Parent with direct transfer only.** Disable all Flow methods on the club, keep direct transfer. `Pagar Ahora` routes to `/app/pagos/transferencia/[invoiceId]` and displays the club's bank data with working copy buttons.
8. **Parent with 2+ methods.** Enable card + direct transfer. `Pagar Ahora` routes to `/app/pagos/metodo/[invoiceId]`, where each option renders and navigates correctly.
9. **Admin marks direct transfer paid.** After (7), go to the club's `/club/cobros`, find the same invoice, click `Marcar pagado`. Verify the invoice becomes `paid` and the parent receives the confirmation email (check the `notifications` table).
10. **Flow mock completes correctly.** After (6), complete the Flow mock flow; confirm `payments.method` is the correct enum value (`card_link` for card; use the Supabase SQL editor or `execute_sql`).

- [ ] **Step 6: Restore the club to production-like defaults**

After the smoke test, reset the seeded club to the defaults so subsequent manual runs start from a known state:

```sql
UPDATE clubs SET
  pm_card = true,
  pm_flow_transfer = true,
  pm_wallet = true,
  pm_installments = true,
  pm_direct_transfer = false,
  bank_holder_name = NULL,
  bank_holder_rut = NULL,
  bank_name = NULL,
  bank_account_type = NULL,
  bank_account_number = NULL,
  bank_notification_email = NULL
WHERE id = '<your-test-club-id>';
```

- [ ] **Step 7: Final commit (if anything touched during verification)**

Only commit if the verification uncovered a fix. Otherwise, nothing to commit.

---

## Done

All tasks complete means:

- The migration is applied and the columns + enum values exist in the database.
- All automated tests pass, including the new ones for `club-payments`, Flow client `paymentMethod`, `createFlowPayment`, and `updateClubPaymentConfig`.
- Manual smoke test scenarios 1-10 pass.
- The parent's `Pagar Ahora` routes correctly based on configured methods.
- The club admin can configure methods and bank data from `/club/configuracion`.
