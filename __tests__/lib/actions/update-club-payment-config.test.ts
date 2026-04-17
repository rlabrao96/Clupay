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
      bank_holder_rut: "11.111.111-0",
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
      bank_holder_rut: "76.100.000-4",
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
