export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ETFMetadata, ETFDetailResponse, ETFScoreData, ETFCategory } from '@/types/etf';
import { getLatestRun } from '@/lib/runLoader';
import { calculateETFScoreFromPillars } from '@/scoring/etf-score';

interface ETFMetadataFile {
  fetched_at: string;
  etfs: Record<string, RawETFMetadata>;
}

interface RawETFMetadata {
  name: string;
  ticker: string;
  expense_ratio: number | null;
  aum: number | null;
  category: string | null;
  fund_family: string | null;
  distribution_policy: 'accumulating' | 'distributing';
  management_style: 'passive' | 'active';
  asset_class: 'equity' | 'fixed_income' | 'commodity' | 'crypto' | 'multi_asset';
  etf_category: string;
  top_holdings: Array<{ symbol: string; weight: number; name: string }>;
  benchmark_index: string | null;
  inception_date: number | null;
  currency: string;
  exchange: string;
  data_quality: string;
}

interface MacroDataFile {
  tickers: Record<string, {
    price_current: number | null;
    change_1d: number | null;
    change_1w: number | null;
    change_1m: number | null;
    change_3m: number | null;
    change_ytd: number | null;
    sparkline_30d: number[];
  }>;
}

const ETF_DATA_PATH = join(process.cwd(), 'data', 'etf', 'metadata.json');
const MACRO_DATA_PATH = join(process.cwd(), 'data', 'macro', 'commodities.json');
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=300' } as const;

const COMMODITY_ETF_TO_MACRO: Record<string, string> = {
  GLD: 'GC=F',
  IAU: 'GC=F',
  SLV: 'SI=F',
  GDX: 'GC=F',
  USO: 'CL=F',
  UNG: 'NG=F',
};

function normalizeCategory(raw: string): ETFCategory {
  const mapping: Record<string, ETFCategory> = {
    broad_market: 'broad_market',
    sector: 'sector',
    factor: 'factor_smart_beta',
    factor_smart_beta: 'factor_smart_beta',
    fixed_income: 'fixed_income',
    commodity: 'commodity_etf',
    commodity_etf: 'commodity_etf',
    regional: 'regional',
    thematic: 'thematic',
    crypto: 'crypto_adjacent',
    crypto_adjacent: 'crypto_adjacent',
  };
  return mapping[raw] || 'broad_market';
}

function normalizeDataQuality(raw: string): 'ok' | 'failed' | 'stale' {
  if (raw === 'ok') return 'ok';
  if (raw === 'failed') return 'failed';
  if (raw.startsWith('warning:') || raw.includes('stale')) return 'stale';
  return 'ok';
}

function transformMetadata(raw: RawETFMetadata): ETFMetadata {
  return {
    ticker: raw.ticker,
    name: raw.name,
    expense_ratio: raw.expense_ratio,
    aum: raw.aum,
    category: raw.category,
    fund_family: raw.fund_family,
    distribution_policy: raw.distribution_policy,
    management_style: raw.management_style,
    asset_class: raw.asset_class,
    etf_category: normalizeCategory(raw.etf_category),
    top_holdings: raw.top_holdings || [],
    benchmark_index: raw.benchmark_index,
    inception_date: raw.inception_date,
    currency: raw.currency,
    exchange: raw.exchange,
    data_quality: normalizeDataQuality(raw.data_quality),
  };
}

function loadETFMetadata(): ETFMetadataFile | null {
  if (!existsSync(ETF_DATA_PATH)) return null;
  try {
    const content = readFileSync(ETF_DATA_PATH, 'utf-8');
    return JSON.parse(content) as ETFMetadataFile;
  } catch {
    return null;
  }
}

function loadMacroData(): MacroDataFile | null {
  if (!existsSync(MACRO_DATA_PATH)) return null;
  try {
    const content = readFileSync(MACRO_DATA_PATH, 'utf-8');
    return JSON.parse(content) as MacroDataFile;
  } catch {
    return null;
  }
}

interface RunScoreEntry {
  symbol: string;
  price_target?: {
    current_price: number | null;
  } | null;
  evidence?: {
    technical: number;
    risk: number;
  } | null;
}

function getETFScoreAndPrice(ticker: string): {
  score: ETFScoreData | null;
  price: ETFDetailResponse['price'];
} {
  const runData = getLatestRun();
  const metadata = loadETFMetadata();

  if (!runData || !metadata) {
    return { score: null, price: null };
  }

  const rawMeta = metadata.etfs[ticker];
  const expenseRatio = rawMeta?.expense_ratio ?? null;

  for (const score of runData.run.scores as RunScoreEntry[]) {
    if (score.symbol !== ticker) continue;

    const technicalPillar = score.evidence?.technical ?? null;
    const riskPillar = score.evidence?.risk ?? null;

    const etfScore = calculateETFScoreFromPillars(
      ticker,
      technicalPillar,
      riskPillar,
      expenseRatio
    );

    const currentPrice = score.price_target?.current_price ?? null;

    let price: ETFDetailResponse['price'] = null;
    if (currentPrice !== null) {
      price = {
        current: currentPrice,
        change_1d: null,
        change_1w: null,
        change_1m: null,
        change_3m: null,
        change_ytd: null,
        sparkline_30d: [],
      };
    }

    return { score: etfScore, price };
  }

  return { score: null, price: null };
}

function getCommodityETFPrice(ticker: string): ETFDetailResponse['price'] {
  const macroData = loadMacroData();
  if (!macroData) return null;

  const macroTicker = COMMODITY_ETF_TO_MACRO[ticker];
  if (!macroTicker) return null;

  const data = macroData.tickers[macroTicker];
  if (!data || data.price_current === null) return null;

  return {
    current: data.price_current,
    change_1d: data.change_1d ?? null,
    change_1w: data.change_1w ?? null,
    change_1m: data.change_1m ?? null,
    change_3m: data.change_3m ?? null,
    change_ytd: data.change_ytd ?? null,
    sparkline_30d: data.sparkline_30d || [],
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  const metadata = loadETFMetadata();

  if (!metadata) {
    return NextResponse.json(
      { error: 'ETF metadata not available.' },
      { status: 503 }
    );
  }

  const rawETF = metadata.etfs[upperTicker];

  if (!rawETF) {
    return NextResponse.json(
      { error: `ETF with ticker "${upperTicker}" not found.` },
      { status: 404 }
    );
  }

  const transformed = transformMetadata(rawETF);

  let { score, price } = getETFScoreAndPrice(upperTicker);

  if (!price && transformed.asset_class === 'commodity') {
    price = getCommodityETFPrice(upperTicker);
  }

  if (!score) {
    score = calculateETFScoreFromPillars(
      upperTicker,
      null,
      null,
      transformed.expense_ratio
    );
  }

  const response: ETFDetailResponse = {
    metadata: transformed,
    score,
    price,
  };

  return NextResponse.json(response, { headers: CACHE_HEADERS });
}
