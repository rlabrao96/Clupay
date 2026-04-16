/**
 * @jest-environment node
 */
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

    it("getPaymentStatus GETs /payment/getStatus with signed query params", async () => {
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

        // Flow requires GET with query params for /payment/getStatus
        const [url, init] = fetchSpy.mock.calls[0];
        expect(init?.method).toBe("GET");
        expect(String(url)).toContain(
          "https://www.flow.cl/api/payment/getStatus?"
        );
        expect(String(url)).toContain("apiKey=test_api_key");
        expect(String(url)).toContain("token=tok_123");
        expect(String(url)).toMatch(/&s=[0-9a-f]{64}$/);
      });

      fetchSpy.mockRestore();
    });
  });
});
