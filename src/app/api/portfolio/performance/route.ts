export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getDatabase } from '@/data/db';

interface Snapshot {
  snapshot_date: string;
  total_value_usd: number;
}

interface BenchmarkPoint {
  date: string;
  value: number;
}

interface PerformanceMetrics {
  portfolio_return: number;
  spy_return: number;
  qqq_return: number;
  alpha_vs_spy: number;
  tracking_error: number | null;
}

interface PerformanceResponse {
  portfolio: BenchmarkPoint[];
  benchmarks: {
    spy: BenchmarkPoint[];
    qqq: BenchmarkPoint[];
  };
  metrics: PerformanceMetrics;
  period: string;
  start_date: string;
  end_date: string;
  snapshot_count: number;
}

const PERIOD_DAYS: Record<string, number> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
  'max': 3650,
};

function getSnapshots(days: number): Snapshot[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT snapshot_date, total_value_usd
    FROM portfolio_snapshots
    WHERE user_id = 'default'
    AND date(snapshot_date) >= date('now', ?)
    ORDER BY snapshot_date ASC
  `);
  const rows = stmt.all(`-${days} days`) as Snapshot[];
  return rows;
}

function parseCsv(content: string): Map<string, number> {
  const lines = content.trim().split('\n');
  const data = new Map<string, number>();
  
  for (let i = 1; i < lines.length; i++) {
    const [date, , , , close] = lines[i].split(',');
    if (date && close) {
      data.set(date, parseFloat(close));
    }
  }
  
  return data;
}

function loadBenchmarkData(symbol: string, days: number): BenchmarkPoint[] {
  const csvPath = join(process.cwd(), 'data', 'backtesting', 'historical', `${symbol}.csv`);
  
  if (!existsSync(csvPath)) {
    return [];
  }
  
  try {
    const content = readFileSync(csvPath, 'utf-8');
    const priceData = parseCsv(content);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    
    const points: BenchmarkPoint[] = [];
    const sortedDates = Array.from(priceData.keys()).filter(d => d >= cutoffStr).sort();
    
    for (const date of sortedDates) {
      const value = priceData.get(date);
      if (value !== undefined) {
        points.push({ date, value });
      }
    }
    
    return points;
  } catch {
    return [];
  }
}

function normalizeToBase100(data: BenchmarkPoint[]): BenchmarkPoint[] {
  if (data.length === 0) return [];
  
  const baseValue = data[0].value;
  if (baseValue === 0) return data;
  
  return data.map(point => ({
    date: point.date,
    value: (point.value / baseValue) * 100,
  }));
}

function alignDates(
  portfolio: BenchmarkPoint[],
  spy: BenchmarkPoint[],
  qqq: BenchmarkPoint[]
): { portfolio: BenchmarkPoint[]; spy: BenchmarkPoint[]; qqq: BenchmarkPoint[] } {
  if (portfolio.length === 0) {
    return { portfolio: [], spy: [], qqq: [] };
  }
  
  if (spy.length === 0 && qqq.length === 0) {
    return { portfolio, spy: [], qqq: [] };
  }
  
  if (spy.length > 0) {
    const portfolioDates = new Set(portfolio.map(p => p.date));
    const alignedSpy = spy.filter(p => portfolioDates.has(p.date));
    
    if (alignedSpy.length === 0) {
      return { portfolio: [], spy: [], qqq: [] };
    }
    
    const spyDates = new Set(alignedSpy.map(p => p.date));
    const alignedPortfolio = portfolio.filter(p => spyDates.has(p.date));
    const alignedQqq = qqq.filter(p => spyDates.has(p.date));
    
    return {
      portfolio: alignedPortfolio,
      spy: alignedSpy,
      qqq: alignedQqq,
    };
  }
  
  if (qqq.length > 0) {
    const portfolioDates = new Set(portfolio.map(p => p.date));
    const alignedQqq = qqq.filter(p => portfolioDates.has(p.date));
    
    if (alignedQqq.length === 0) {
      return { portfolio: [], spy: [], qqq: [] };
    }
    
    const qqqDates = new Set(alignedQqq.map(p => p.date));
    const alignedPortfolio = portfolio.filter(p => qqqDates.has(p.date));
    
    return {
      portfolio: alignedPortfolio,
      spy: [],
      qqq: alignedQqq,
    };
  }
  
  return { portfolio, spy: [], qqq: [] };
}

function calculateReturn(data: BenchmarkPoint[]): number {
  if (data.length < 2) return 0;
  const startValue = data[0].value;
  const endValue = data[data.length - 1].value;
  if (startValue === 0) return 0;
  return (endValue - startValue) / startValue;
}

function calculateTrackingError(portfolio: BenchmarkPoint[], benchmark: BenchmarkPoint[]): number | null {
  if (portfolio.length !== benchmark.length || portfolio.length < 5) {
    return null;
  }
  
  const differences: number[] = [];
  for (let i = 1; i < portfolio.length; i++) {
    const portReturn = (portfolio[i].value - portfolio[i - 1].value) / portfolio[i - 1].value;
    const benchReturn = (benchmark[i].value - benchmark[i - 1].value) / benchmark[i - 1].value;
    differences.push(portReturn - benchReturn);
  }
  
  if (differences.length === 0) return null;
  
  const mean = differences.reduce((a, b) => a + b, 0) / differences.length;
  const variance = differences.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / differences.length;
  
  return Math.sqrt(variance);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || '3m';
  
  const days = PERIOD_DAYS[period] || 90;
  
  try {
    const snapshots = getSnapshots(days);
    
    if (snapshots.length < 2) {
      return NextResponse.json({
        portfolio: [],
        benchmarks: { spy: [], qqq: [] },
        metrics: {
          portfolio_return: 0,
          spy_return: 0,
          qqq_return: 0,
          alpha_vs_spy: 0,
          tracking_error: null,
        },
        period,
        start_date: '',
        end_date: '',
        snapshot_count: snapshots.length,
        message: snapshots.length === 0 
          ? 'Keine Snapshots vorhanden. Führe `python scripts/portfolio/generate_snapshot.py` aus.'
          : `Nur ${snapshots.length} Snapshot(s). Mindestens 2 benötigt für Performance-Berechnung.`,
      });
    }
    
    const portfolioRaw: BenchmarkPoint[] = snapshots.map(s => ({
      date: s.snapshot_date,
      value: s.total_value_usd,
    }));
    
    const spyRaw = loadBenchmarkData('SPY', days);
    const qqqRaw = loadBenchmarkData('QQQ', days);
    
    const aligned = alignDates(portfolioRaw, spyRaw, qqqRaw);
    
    if (aligned.portfolio.length < 2) {
      return NextResponse.json({
        portfolio: [],
        benchmarks: { spy: [], qqq: [] },
        metrics: {
          portfolio_return: 0,
          spy_return: 0,
          qqq_return: 0,
          alpha_vs_spy: 0,
          tracking_error: null,
        },
        period,
        start_date: '',
        end_date: '',
        snapshot_count: snapshots.length,
        message: 'Nicht genug überlappende Daten mit Benchmarks.',
      });
    }
    
    const normalizedPortfolio = normalizeToBase100(aligned.portfolio);
    const normalizedSpy = normalizeToBase100(aligned.spy);
    const normalizedQqq = normalizeToBase100(aligned.qqq);
    
    const portfolioReturn = calculateReturn(normalizedPortfolio);
    const spyReturn = calculateReturn(normalizedSpy);
    const qqqReturn = calculateReturn(normalizedQqq);
    const alphaVsSpy = portfolioReturn - spyReturn;
    const trackingError = calculateTrackingError(normalizedPortfolio, normalizedSpy);
    
    const response: PerformanceResponse = {
      portfolio: normalizedPortfolio,
      benchmarks: {
        spy: normalizedSpy,
        qqq: normalizedQqq,
      },
      metrics: {
        portfolio_return: Math.round(portfolioReturn * 10000) / 10000,
        spy_return: Math.round(spyReturn * 10000) / 10000,
        qqq_return: Math.round(qqqReturn * 10000) / 10000,
        alpha_vs_spy: Math.round(alphaVsSpy * 10000) / 10000,
        tracking_error: trackingError !== null ? Math.round(trackingError * 10000) / 10000 : null,
      },
      period,
      start_date: normalizedPortfolio[0]?.date || '',
      end_date: normalizedPortfolio[normalizedPortfolio.length - 1]?.date || '',
      snapshot_count: snapshots.length,
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[API /portfolio/performance] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load performance data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
