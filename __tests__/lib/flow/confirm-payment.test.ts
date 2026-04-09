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
