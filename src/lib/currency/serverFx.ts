import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { FxRateSnapshot } from './types';

const FX_CACHE_FILE = join(process.cwd(), 'data', 'cache', 'fx-usd-eur.json');
const FX_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

function parseIsoDate(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function loadCache(): FxRateSnapshot | null {
  if (!existsSync(FX_CACHE_FILE)) return null;

  try {
    const raw = readFileSync(FX_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<FxRateSnapshot>;
    if (
      parsed?.pair === 'USD_EUR' &&
      typeof parsed.rate === 'number' &&
      Number.isFinite(parsed.rate) &&
      parsed.rate > 0 &&
      typeof parsed.asOf === 'string' &&
      typeof parsed.fetchedAt === 'string'
    ) {
      return {
        pair: 'USD_EUR',
        rate: parsed.rate,
        asOf: parsed.asOf,
        fetchedAt: parsed.fetchedAt,
        provider:
          parsed.provider === 'ecb' || parsed.provider === 'yahoo' || parsed.provider === 'cache'
            ? parsed.provider
            : 'cache',
        stale: Boolean(parsed.stale),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function saveCache(snapshot: FxRateSnapshot): void {
  const dir = join(process.cwd(), 'data', 'cache');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(FX_CACHE_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'user-agent': 'INTRINSIC-FX/1.0',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchUsdEurFromEcb(): Promise<FxRateSnapshot | null> {
  const response = await fetchWithTimeout('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml');
  if (!response.ok) return null;

  const xml = await response.text();
  const dateMatch = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/i);
  const usdMatch = xml.match(/currency=['"]USD['"]\s+rate=['"]([0-9]+(?:\.[0-9]+)?)['"]/i);

  if (!dateMatch?.[1] || !usdMatch?.[1]) return null;

  const eurToUsd = Number(usdMatch[1]);
  if (!Number.isFinite(eurToUsd) || eurToUsd <= 0) return null;

  return {
    pair: 'USD_EUR',
    rate: 1 / eurToUsd,
    asOf: dateMatch[1],
    fetchedAt: new Date().toISOString(),
    provider: 'ecb',
  };
}

async function fetchUsdEurFromYahoo(): Promise<FxRateSnapshot | null> {
  const response = await fetchWithTimeout('https://query1.finance.yahoo.com/v7/finance/quote?symbols=EURUSD=X');
  if (!response.ok) return null;

  const body = (await response.json()) as {
    quoteResponse?: { result?: Array<{ regularMarketPrice?: number; regularMarketTime?: number }> };
  };

  const quote = body.quoteResponse?.result?.[0];
  const eurUsd = quote?.regularMarketPrice;
  if (typeof eurUsd !== 'number' || !Number.isFinite(eurUsd) || eurUsd <= 0) return null;

  const marketTime =
    typeof quote?.regularMarketTime === 'number'
      ? new Date(quote.regularMarketTime * 1000).toISOString()
      : new Date().toISOString();

  return {
    pair: 'USD_EUR',
    rate: 1 / eurUsd,
    asOf: marketTime,
    fetchedAt: new Date().toISOString(),
    provider: 'yahoo',
  };
}

export async function getUsdEurRate(options?: { forceRefresh?: boolean }): Promise<FxRateSnapshot> {
  const forceRefresh = options?.forceRefresh === true;
  const cached = loadCache();
  const cachedTs = cached ? parseIsoDate(cached.fetchedAt) : 0;
  const cacheIsFresh = Boolean(cached && cachedTs > 0 && Date.now() - cachedTs < FX_TTL_MS);

  if (!forceRefresh && cacheIsFresh && cached) {
    return {
      ...cached,
      provider: 'cache',
      stale: false,
    };
  }

  const providers = [fetchUsdEurFromEcb, fetchUsdEurFromYahoo];
  for (const provider of providers) {
    try {
      const snapshot = await provider();
      if (!snapshot) continue;
      saveCache(snapshot);
      return snapshot;
    } catch {
      // try next provider
    }
  }

  if (cached) {
    return {
      ...cached,
      provider: 'cache',
      stale: true,
    };
  }

  throw new Error('FX rate unavailable');
}
