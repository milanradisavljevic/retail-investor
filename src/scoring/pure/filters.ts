import type { MarketDataSnapshot } from './types';

type FilterMap = Record<string, unknown> | null | undefined;

export interface FilterResult {
  ok: boolean;
  removedBy: Record<string, number>;
  ignoredKeys: string[];
  unsupportedKeys: string[];
}

const numeric = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const fieldMap: Record<string, (s: MarketDataSnapshot) => number | null> = {
  pe: (s) => s.fundamentals?.peRatio ?? (s.fundamentals as any)?.pe ?? null,
  pb: (s) => s.fundamentals?.pbRatio ?? (s.fundamentals as any)?.pb ?? null,
  ps: (s) => s.fundamentals?.psRatio ?? (s.fundamentals as any)?.ps ?? null,
  peg: (s) => (s.fundamentals as any)?.pegRatio ?? null,
  ev_ebitda: (s) => (s.fundamentals as any)?.evToEbitda ?? null,
  debt_equity: (s) => s.fundamentals?.debtToEquity ?? null,
  roe: (s) => s.fundamentals?.roe ?? null,
  payout_ratio: (s) => (s.fundamentals as any)?.payoutRatio ?? null,
  dividend_yield: (s) => (s.fundamentals as any)?.dividendYield ?? null,
  beta: (s) => s.fundamentals?.beta ?? null,
  market_cap: (s) => s.fundamentals?.marketCap ?? null,
  volatility: (s) => s.technical.volatility3m ?? null, // alias for max_volatility
  volatility_3m: (s) => s.technical.volatility3m ?? null,
};

export function applyPresetFilters(
  snapshot: MarketDataSnapshot,
  filters: FilterMap
): FilterResult {
  if (!filters) return { ok: true, removedBy: {}, ignoredKeys: [], unsupportedKeys: [] };

  const removedBy: Record<string, number> = {};
  const ignoredKeys: string[] = [];
  const unsupportedKeys: string[] = [];
  let ok = true;

  for (const [key, value] of Object.entries(filters)) {
    const numVal = numeric(value);
    const recordRemoval = () => {
      removedBy[key] = (removedBy[key] || 0) + 1;
      ok = false;
    };

    if (key.startsWith('min_') && key.endsWith('_score')) {
      ignoredKeys.push(key); // handled after scoring
      continue;
    }

    const minMatch = key.match(/^min_(.+)$/);
    const maxMatch = key.match(/^max_(.+)$/);
    if (minMatch || maxMatch) {
      if (numVal === null) {
        throw new Error(`preset_invalid_filter_value: ${key}=${String(value)}`);
      }
      const field = (minMatch ?? maxMatch)![1];
      const getter = fieldMap[field];
      if (getter) {
        const v = getter(snapshot);
        if (v != null) {
          let threshold = numVal;
          if (maxMatch && field === 'volatility' && threshold <= 1.5) {
            // Treat fractions (e.g., 0.3) as percentages
            threshold = threshold * 100;
          }
          if (minMatch && v < threshold) recordRemoval();
          if (maxMatch && v > threshold) recordRemoval();
        }
      } else {
        unsupportedKeys.push(key);
      }
      continue;
    }

    if (key.startsWith('max_') || key.startsWith('min_')) {
      unsupportedKeys.push(key);
      continue;
    }

    ignoredKeys.push(key);
  }

  return { ok, removedBy, ignoredKeys, unsupportedKeys };
}
