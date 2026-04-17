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
