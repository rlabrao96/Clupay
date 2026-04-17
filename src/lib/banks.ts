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
