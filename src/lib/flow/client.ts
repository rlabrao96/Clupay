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
