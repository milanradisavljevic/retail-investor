export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ETFMetadata, ETFListResponse, ETFCategory, ETFScoreData } from '@/types/etf';
import { getLatestRun } from '@/lib/runLoader';
import { calculateETFScoreFromPillars } from '@/scoring/etf-score';

interface ETFMetadataFile {
  fetched_at: string;
  etfs: Record<string, RawETFMetadata>;
  summary: {
    total: number;
    success: number;
    failed: string[];
    last_updated: string;
    last_run_elapsed_seconds: number;
  };
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

const ETF_DATA_PATH = join(process.cwd(), 'data', 'etf', 'metadata.json');
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=300' } as const;

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

function loadETFMetadata(): ETFMetadataFile | null {
  if (!existsSync(ETF_DATA_PATH)) {
    return null;
  }

  try {
    const content = readFileSync(ETF_DATA_PATH, 'utf-8');
    return JSON.parse(content) as ETFMetadataFile;
  } catch {
    return null;
  }
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

interface RunScoreEntry {
  symbol: string;
  evidence?: {
    technical: number;
    risk: number;
  };
}

function getETFScoresFromRun(): Map<string, ETFScoreData> {
  const scoreMap = new Map<string, ETFScoreData>();
  const runData = getLatestRun();

  if (!runData) {
    return scoreMap;
  }

  const metadata = loadETFMetadata();
  if (!metadata) {
    return scoreMap;
  }

  const etfTickers = new Set(Object.keys(metadata.etfs));

  for (const score of runData.run.scores as RunScoreEntry[]) {
    if (!etfTickers.has(score.symbol)) continue;

    const technicalPillar = score.evidence?.technical ?? null;
    const riskPillar = score.evidence?.risk ?? null;
    const rawMeta = metadata.etfs[score.symbol];
    const expenseRatio = rawMeta?.expense_ratio ?? null;

    const etfScore = calculateETFScoreFromPillars(
      score.symbol,
      technicalPillar,
      riskPillar,
      expenseRatio
    );

    scoreMap.set(score.symbol, etfScore);
  }

  return scoreMap;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') as ETFCategory | null;
  const tickerParam = searchParams.get('ticker');

  const metadata = loadETFMetadata();

  if (!metadata) {
    return NextResponse.json(
      { error: 'ETF metadata not available. Run the ETF metadata fetcher first.' },
      { status: 503 }
    );
  }

  const requestedTickers = tickerParam
    ? tickerParam.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)
    : null;

  const scores = getETFScoresFromRun();

  const etfList: Array<{ metadata: ETFMetadata; score: ETFScoreData | null }> = [];

  for (const [ticker, raw] of Object.entries(metadata.etfs)) {
    if (requestedTickers && !requestedTickers.includes(ticker)) {
      continue;
    }

    if (category && normalizeCategory(raw.etf_category) !== category) {
      continue;
    }

    const transformed = transformMetadata(raw);
    etfList.push({
      metadata: transformed,
      score: scores.get(ticker) ?? null,
    });
  }

  etfList.sort((a, b) => {
    const scoreA = a.score?.combined_score ?? -1;
    const scoreB = b.score?.combined_score ?? -1;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.metadata.ticker.localeCompare(b.metadata.ticker);
  });

  const response: ETFListResponse = {
    etfs: etfList,
    meta: {
      fetched_at: metadata.fetched_at,
      total: etfList.length,
      filtered_by: category || tickerParam || undefined,
    },
  };

  return NextResponse.json(response, { headers: CACHE_HEADERS });
}
