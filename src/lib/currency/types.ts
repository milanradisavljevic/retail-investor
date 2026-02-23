export type DisplayCurrency = "USD" | "EUR";

export interface FxRateSnapshot {
  pair: "USD_EUR";
  rate: number;
  asOf: string;
  provider: "ecb" | "yahoo" | "cache";
  fetchedAt: string;
  stale?: boolean;
}
