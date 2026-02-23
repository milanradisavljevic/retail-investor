import type { Currency } from '@/types/portfolio';
import { FX_RATES_TO_USD } from '@/types/portfolio';
import type { DisplayCurrency } from '@/lib/settings/types';

function currencyToUsd(value: number, currency: Currency, fxRatesToUsd: Record<Currency, number>): number {
  const rate = fxRatesToUsd[currency] ?? 1;
  return value * rate;
}

function usdToCurrency(valueUsd: number, currency: DisplayCurrency, usdToEurRate: number): number {
  if (currency === 'EUR') return valueUsd * usdToEurRate;
  return valueUsd;
}

export function convertFromUsd(value: number | null | undefined, displayCurrency: DisplayCurrency, usdToEurRate: number): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return usdToCurrency(value, displayCurrency, usdToEurRate);
}

export function convertBetweenCurrencies(
  value: number | null | undefined,
  fromCurrency: Currency,
  toCurrency: DisplayCurrency,
  usdToEurRate: number,
  fxRatesToUsd: Record<Currency, number> = FX_RATES_TO_USD
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;

  if (fromCurrency === toCurrency) return value;

  const valueUsd = currencyToUsd(value, fromCurrency, fxRatesToUsd);
  return usdToCurrency(valueUsd, toCurrency, usdToEurRate);
}

export function formatMoney(value: number | null | undefined, currency: DisplayCurrency): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
