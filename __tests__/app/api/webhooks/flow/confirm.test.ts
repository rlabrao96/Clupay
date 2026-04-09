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
