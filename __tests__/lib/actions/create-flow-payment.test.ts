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
