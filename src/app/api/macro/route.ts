export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300;

import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { MacroTickerData, MacroCategory, MacroApiResponse } from '@/types/macro';

const MACRO_DATA_PATH = path.join(process.cwd(), 'data', 'macro', 'commodities.json');
const STALE_THRESHOLD_HOURS = 24;

interface RawTickerData {
  name: string;
  category: string;
  price_current: number | null;
  price_currency?: string;
  change_1d: number | null;
  change_1w: number | null;
  change_1m: number | null;
  change_3m: number | null;
  change_ytd: number | null;
  sparkline_30d: number[];
  last_updated: string;
  data_quality: 'ok' | 'failed';
}

interface RawMacroJson {
  fetched_at: string;
  tickers: Record<string, RawTickerData>;
  summary: {
    total: number;
    success: number;
    failed: string[];
    fetch_duration_seconds: number;
  };
}

const VALID_CATEGORIES: MacroCategory[] = [
  'precious_metals',
  'base_metals',
  'energy',
  'agriculture',
  'rates',
  'currency',
];

function isMacroCategory(value: string): value is MacroCategory {
  return VALID_CATEGORIES.includes(value as MacroCategory);
}

function isStale(fetchedAt: string): boolean {
  try {
    const fetchedDate = new Date(fetchedAt);
    const now = new Date();
    const hoursSinceFetch = (now.getTime() - fetchedDate.getTime()) / (1000 * 60 * 60);
    return hoursSinceFetch > STALE_THRESHOLD_HOURS;
  } catch {
    return true;
  }
}

function transformTickerData(
  ticker: string,
  data: RawTickerData,
  stale: boolean
): MacroTickerData | null {
  if (!isMacroCategory(data.category)) {
    console.warn(`[API /macro] Skipping ticker with invalid category: ${ticker} -> ${data.category}`);
    return null;
  }

  let dataQuality: 'ok' | 'failed' | 'stale' = data.data_quality;
  if (stale && dataQuality === 'ok') {
    dataQuality = 'stale';
  }

  return {
    ticker,
    name: data.name,
    category: data.category,
    price_current: data.price_current,
    change_1d: data.change_1d,
    change_1w: data.change_1w,
    change_1m: data.change_1m,
    change_3m: data.change_3m,
    change_ytd: data.change_ytd,
    sparkline_30d: data.sparkline_30d || [],
    last_updated: data.last_updated,
    data_quality: dataQuality,
  };
}

function loadMacroData(): { data: RawMacroJson; stale: boolean } | null {
  if (!existsSync(MACRO_DATA_PATH)) {
    return null;
  }

  try {
    const content = readFileSync(MACRO_DATA_PATH, 'utf-8');
    const data = JSON.parse(content) as RawMacroJson;
    const stale = isStale(data.fetched_at);
    return { data, stale };
  } catch (err) {
    console.error('[API /macro] Failed to parse macro data:', err);
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const ticker = searchParams.get('ticker');
  const requestedTickers = ticker
    ? ticker
        .split(',')
        .map((symbol) => symbol.trim())
        .filter(Boolean)
    : [];

  const loaded = loadMacroData();

  if (!loaded) {
    const fileExists = existsSync(MACRO_DATA_PATH);
    if (!fileExists) {
      return NextResponse.json(
        {
          error: 'Macro data not available. Run: python scripts/etl/fetch_commodities.py',
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'Corrupt macro data file' },
      { status: 500 }
    );
  }

  const { data: rawData, stale } = loaded;
  let tickerData: MacroTickerData[] = [];

  for (const [symbol, info] of Object.entries(rawData.tickers)) {
    const transformed = transformTickerData(symbol, info, stale);
    if (transformed) {
      tickerData.push(transformed);
    }
  }

  if (category && isMacroCategory(category)) {
    tickerData = tickerData.filter((t) => t.category === category);
  }

  if (requestedTickers.length > 0) {
    const tickerSet = new Set(requestedTickers);
    tickerData = tickerData.filter((t) => tickerSet.has(t.ticker));
  }

  const response: MacroApiResponse = {
    data: tickerData,
    meta: {
      fetched_at: rawData.fetched_at,
      total: tickerData.length,
      stale,
    },
  };

  return new NextResponse(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
