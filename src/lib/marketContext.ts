/**
 * Market Context Provider
 *
 * Fetches real-time market data for major indices using Yahoo Finance Chart API.
 *
 * Implementation Notes:
 * - Yahoo Finance Quote API (v7) now returns 401 Unauthorized as of Jan 2024
 * - Switched to Chart API (v8) which still works and provides all needed data
 * - Current price extracted from most recent close price
 * - Daily change calculated from last two close prices
 * - 15-minute cache with stale-while-revalidate pattern
 *
 * Fixed by: Claude Code (2026-01-24)
 */

type IndexConfig = {
  symbol: string;
  name: string;
};

export type MarketIndexSnapshot = {
  symbol: string;
  name: string;
  value: number | null;
  changePercent: number | null;
  data: Array<{ value: number }>;
};

export type MarketContextResponse = {
  indices: MarketIndexSnapshot[];
  fetchedAt: string;
};

const INDICES: IndexConfig[] = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^RUT', name: 'Russell 2000' },
  { symbol: '^IXIC', name: 'NASDAQ' },
  { symbol: '^VIX', name: 'VIX (Fear)' },
];

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
let cachedContext: MarketContextResponse | null = null;
let lastFetchTs = 0;
let inflight: Promise<MarketContextResponse> | null = null;

type ChartResponse = {
  chart?: {
    result?: Array<{
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
      };
    }>;
  };
};

type IndexData = {
  currentPrice: number | null;
  changePct: number | null;
  sparkline: Array<{ value: number }>;
};

async function fetchIndexData(symbol: string): Promise<IndexData> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=60d&interval=1d`,
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Chart request failed for ${symbol} (${res.status})`);
  }

  const data = (await res.json()) as ChartResponse;
  const closes =
    data.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(
      (v): v is number => typeof v === 'number'
    ) ?? [];

  // Current price is the most recent close
  const currentPrice = closes.length > 0 ? closes[closes.length - 1] : null;

  // Calculate change from previous close
  let changePct: number | null = null;
  if (closes.length >= 2) {
    const prevClose = closes[closes.length - 2];
    if (prevClose && currentPrice) {
      changePct = ((currentPrice - prevClose) / prevClose) * 100;
    }
  }

  // Take last 30 days for sparkline
  const trimmed = closes.slice(-30);
  const sparkline = trimmed.map((value) => ({ value }));

  return { currentPrice, changePct, sparkline };
}

async function buildMarketContext(): Promise<MarketContextResponse> {
  // Fetch all indices in parallel using Chart API only
  const indexDataResults = await Promise.all(
    INDICES.map((idx) => fetchIndexData(idx.symbol))
  );

  const now = new Date().toISOString();
  const indices: MarketIndexSnapshot[] = INDICES.map((idx, i) => {
    const data = indexDataResults[i];

    return {
      symbol: idx.symbol,
      name: idx.name,
      value: data.currentPrice,
      changePercent: data.changePct,
      data: data.sparkline,
    };
  });

  return { indices, fetchedAt: now };
}

async function refreshCache(): Promise<MarketContextResponse> {
  if (inflight) return inflight;

  inflight = buildMarketContext()
    .then((ctx) => {
      cachedContext = ctx;
      lastFetchTs = Date.now();
      return ctx;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export async function getMarketContext(): Promise<MarketContextResponse> {
  const now = Date.now();
  const isFresh = cachedContext && now - lastFetchTs < CACHE_TTL_MS;

  if (isFresh && cachedContext) {
    return cachedContext;
  }

  if (cachedContext && now - lastFetchTs >= CACHE_TTL_MS) {
    void refreshCache();
    return cachedContext;
  }

  try {
    return await refreshCache();
  } catch (err) {
    if (cachedContext) {
      return cachedContext;
    }
    throw err;
  }
}

export function getMarketContextIndices(): IndexConfig[] {
  return INDICES;
}
