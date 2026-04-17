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
