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
      async getPaymentStatus() {
        throw new Error(
          "getPaymentStatus should not be called in FLOW_MOCK mode"
        );
      },
    };
  }

  const apiBase = requireEnv("FLOW_API_BASE");
  const apiKey = requireEnv("FLOW_API_KEY");
  const secretKey = requireEnv("FLOW_SECRET_KEY");

  function signedRequest(
    path: string,
    params: Record<string, string>
  ): { url: string; body: string } {
    const withKey = { ...params, apiKey };
    const s = signFlowParams(withKey, secretKey);
    const query = new URLSearchParams({ ...withKey, s }).toString();
    return { url: `${apiBase}${path}`, body: query };
  }

  async function handleResponse<T>(path: string, res: Response): Promise<T> {
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
      const { url, body } = signedRequest("/payment/create", params);
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      return handleResponse<FlowCreatePaymentResult>("/payment/create", res);
    },

    async getPaymentStatus(token) {
      // Flow's /payment/getStatus expects GET with query params, not POST
      // (verified against https://developers.flow.cl/api). POSTing returns
      // code 105 "No services available".
      const { url, body } = signedRequest("/payment/getStatus", { token });
      const res = await fetch(`${url}?${body}`, { method: "GET" });
      const raw = await handleResponse<
        Omit<FlowPaymentStatus, "amount"> & { amount: number | string }
      >("/payment/getStatus", res);
      // Flow returns amount as a string ("1000") in the JSON response; coerce
      // so downstream integer comparisons (amount mismatch check) work.
      return { ...raw, amount: Number(raw.amount) };
    },
  };
}
