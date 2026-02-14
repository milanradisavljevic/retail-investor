export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300;

import { NextResponse } from 'next/server';
import { initializeDatabase, closeDatabase } from '@/data/db';
import { getPositions } from '@/data/portfolio';
import { enrichPositions } from '@/data/portfolioEnrichment';
import {
  loadEarningsCalendar,
  parseDaysParam,
  sanitizeSymbolList,
} from '@/lib/earnings';
import type { EarningsApiResponse, EarningsCalendarEntry } from '@/types/earnings';

function filterByDays(entries: EarningsCalendarEntry[], days: number): EarningsCalendarEntry[] {
  return entries.filter((entry) => entry.days_until >= 0 && entry.days_until <= days);
}

function mapPortfolioContext(
  entries: EarningsCalendarEntry[],
  portfolioSymbols: Set<string>,
  portfolioContext: Map<
    string,
    { name: string; score: number | null; quality: number | null }
  >
): EarningsCalendarEntry[] {
  return entries
    .filter((entry) => portfolioSymbols.has(entry.symbol))
    .map((entry) => {
      const context = portfolioContext.get(entry.symbol);
      return {
        ...entry,
        name: context?.name || entry.name,
        score: context?.score ?? null,
        pillar_quality: context?.quality ?? null,
        is_portfolio_holding: true,
      };
    });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseDaysParam(searchParams.get('days'), 30);
  const symbolFilter = sanitizeSymbolList(searchParams.get('symbols'));
  const portfolioOnly = searchParams.get('portfolio') === 'true';

  const loaded = loadEarningsCalendar();
  if (!loaded) {
    return NextResponse.json(
      {
        error: 'Earnings data not available. Run: python scripts/etl/fetch_earnings.py',
      },
      { status: 503 }
    );
  }

  const { fetched_at, upcoming, stale, source_file } = loaded;
  let filtered = filterByDays(upcoming, days);
  let source: 'all' | 'symbols' | 'portfolio' = 'all';

  if (symbolFilter.length > 0) {
    const symbolSet = new Set(symbolFilter);
    filtered = filtered.filter((entry) => symbolSet.has(entry.symbol));
    source = 'symbols';
  } else if (portfolioOnly) {
    source = 'portfolio';
    try {
      initializeDatabase();
      const positions = enrichPositions(getPositions()).filter((p) => p.asset_type === 'equity');
      const context = new Map<string, { name: string; score: number | null; quality: number | null }>();

      for (const pos of positions) {
        if (!context.has(pos.symbol)) {
          context.set(pos.symbol, {
            name: pos.display_name || pos.symbol,
            score: pos.total_score ?? null,
            quality: pos.pillar_scores?.quality ?? null,
          });
        }
      }

      filtered = mapPortfolioContext(filtered, new Set(context.keys()), context);
    } catch (error) {
      console.error('[API /earnings] Failed to load portfolio context:', error);
      return NextResponse.json(
        { error: 'Failed to load portfolio context' },
        { status: 500 }
      );
    } finally {
      closeDatabase();
    }
  }

  const response: EarningsApiResponse = {
    data: filtered,
    meta: {
      fetched_at,
      total: filtered.length,
      days,
      source,
      stale,
    },
  };

  return new NextResponse(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      'X-Earnings-Source': source_file,
    },
  });
}
