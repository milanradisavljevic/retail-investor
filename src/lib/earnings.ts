import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { EarningsCalendarEntry, EarningsQuarterResult } from '@/types/earnings';
import { getCompanyName } from '@/core/company';

interface RawEarningsQuarterResult {
  date?: string;
  eps_actual?: number | null;
  eps_estimate?: number | null;
  surprise_pct?: number | null;
}

interface RawEarningsEntry {
  symbol?: string;
  earnings_date?: string;
  time?: string;
  eps_estimate?: number | null;
  revenue_estimate?: number | null;
  last_4_quarters?: RawEarningsQuarterResult[];
}

interface RawEarningsJson {
  fetched_at?: string;
  upcoming?: RawEarningsEntry[];
}

const EARNINGS_DATA_PATH = path.join(process.cwd(), 'data', 'earnings', 'calendar.json');
const EARNINGS_DEV_FALLBACK_PATH = path.join(
  process.cwd(),
  'data',
  'earnings',
  'calendar.test20.json'
);
const STALE_THRESHOLD_HOURS = 24;
const DAY_MS = 24 * 60 * 60 * 1000;

function toNumberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function parseDateOnly(dateString: string): Date | null {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function normalizeQuarter(raw: RawEarningsQuarterResult): EarningsQuarterResult | null {
  if (!raw || typeof raw.date !== 'string') {
    return null;
  }
  if (!parseDateOnly(raw.date)) {
    return null;
  }

  let surprise = toNumberOrNull(raw.surprise_pct ?? null);
  const actual = toNumberOrNull(raw.eps_actual ?? null);
  const estimate = toNumberOrNull(raw.eps_estimate ?? null);

  if (surprise === null && actual !== null && estimate !== null && estimate !== 0) {
    surprise = ((actual - estimate) / Math.abs(estimate)) * 100;
  }

  return {
    date: raw.date,
    eps_actual: actual,
    eps_estimate: estimate,
    surprise_pct: surprise !== null ? Number(surprise.toFixed(4)) : null,
  };
}

function getLastSurprisePct(lastQuarters: EarningsQuarterResult[]): number | null {
  for (const q of lastQuarters) {
    if (typeof q.surprise_pct === 'number' && Number.isFinite(q.surprise_pct)) {
      return Number(q.surprise_pct.toFixed(4));
    }
  }
  return null;
}

export function sanitizeSymbolList(rawValue: string | null): string[] {
  if (!rawValue) return [];
  const parts = rawValue
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  const unique = new Set<string>();
  for (const symbol of parts) {
    if (/^[A-Z0-9.^:=-]{1,24}$/.test(symbol)) {
      unique.add(symbol);
    }
  }

  return Array.from(unique);
}

export function parseDaysParam(raw: string | null, fallback: number = 30): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 365);
}

export function isEarningsStale(fetchedAt: string | null): boolean {
  if (!fetchedAt) return true;
  const fetchedDate = new Date(fetchedAt);
  if (Number.isNaN(fetchedDate.getTime())) return true;
  const hours = (Date.now() - fetchedDate.getTime()) / (1000 * 60 * 60);
  return hours > STALE_THRESHOLD_HOURS;
}

export function getDaysUntil(dateString: string, now: Date = new Date()): number {
  const dayStartUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = parseDateOnly(dateString);
  if (!target) return Number.POSITIVE_INFINITY;
  return Math.floor((target.getTime() - dayStartUtc) / DAY_MS);
}

export function loadEarningsCalendar():
  | { fetched_at: string | null; upcoming: EarningsCalendarEntry[]; stale: boolean; source_file: string }
  | null {
  const filePath = existsSync(EARNINGS_DATA_PATH)
    ? EARNINGS_DATA_PATH
    : existsSync(EARNINGS_DEV_FALLBACK_PATH)
      ? EARNINGS_DEV_FALLBACK_PATH
      : null;

  if (!filePath) return null;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as RawEarningsJson;
    const fetchedAt = typeof parsed.fetched_at === 'string' ? parsed.fetched_at : null;
    const stale = isEarningsStale(fetchedAt);

    const normalized: EarningsCalendarEntry[] = [];
    for (const raw of parsed.upcoming ?? []) {
      const symbol = typeof raw.symbol === 'string' ? raw.symbol.toUpperCase().trim() : '';
      const earningsDate = typeof raw.earnings_date === 'string' ? raw.earnings_date : '';
      if (!symbol || !earningsDate || !parseDateOnly(earningsDate)) continue;

      const quarters = (raw.last_4_quarters ?? [])
        .map(normalizeQuarter)
        .filter((q): q is EarningsQuarterResult => q !== null);

      normalized.push({
        symbol,
        name: getCompanyName(symbol),
        earnings_date: earningsDate,
        time: typeof raw.time === 'string' ? raw.time : 'unknown',
        eps_estimate: toNumberOrNull(raw.eps_estimate ?? null),
        revenue_estimate: toNumberOrNull(raw.revenue_estimate ?? null),
        last_4_quarters: quarters,
        last_surprise_pct: getLastSurprisePct(quarters),
        days_until: getDaysUntil(earningsDate),
        score: null,
        pillar_quality: null,
        is_portfolio_holding: false,
      });
    }

    return {
      fetched_at: fetchedAt,
      upcoming: normalized.sort((a, b) =>
        a.earnings_date === b.earnings_date
          ? a.symbol.localeCompare(b.symbol)
          : a.earnings_date.localeCompare(b.earnings_date)
      ),
      stale,
      source_file: path.relative(process.cwd(), filePath),
    };
  } catch (error) {
    console.error('[earnings] Failed to load earnings calendar:', error);
    return null;
  }
}
