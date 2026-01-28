/**
 * API Route: Performance Summary
 * Returns aggregated performance metrics and trends
 */

import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type { PerformanceMetrics } from '@/lib/performance/tracker';

export const dynamic = 'force-dynamic';

interface PerformanceSummary {
  recent_runs: PerformanceMetrics[];
  averages: {
    total_duration_ms: number;
    data_fetch_ms: number;
    scoring_ms: number;
    selection_ms: number;
    persistence_ms: number;
    cache_hit_rate: number;
    symbols_per_run: number;
  };
  trends: {
    date: string;
    duration_ms: number;
    cache_hit_rate: number;
    symbol_count: number;
  }[];
}

export async function GET() {
  try {
    const perfDir = join(process.cwd(), 'data', 'performance');

    // Read all performance files
    const files = await readdir(perfDir).catch(() => []);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      return NextResponse.json({
        recent_runs: [],
        averages: {
          total_duration_ms: 0,
          data_fetch_ms: 0,
          scoring_ms: 0,
          selection_ms: 0,
          persistence_ms: 0,
          cache_hit_rate: 0,
          symbols_per_run: 0
        },
        trends: []
      } as PerformanceSummary);
    }

    // Load performance metrics (last 100 runs)
    const recentFiles = jsonFiles.slice(-100);
    const allRuns: PerformanceMetrics[] = [];

    for (const file of recentFiles) {
      try {
        const content = await readFile(join(perfDir, file), 'utf-8');
        const metrics = JSON.parse(content) as PerformanceMetrics;
        allRuns.push(metrics);
      } catch (err) {
        console.warn(`Failed to parse performance file ${file}:`, err);
      }
    }

    if (allRuns.length === 0) {
      return NextResponse.json({
        recent_runs: [],
        averages: {
          total_duration_ms: 0,
          data_fetch_ms: 0,
          scoring_ms: 0,
          selection_ms: 0,
          persistence_ms: 0,
          cache_hit_rate: 0,
          symbols_per_run: 0
        },
        trends: []
      } as PerformanceSummary);
    }

    // Calculate averages
    const averages = {
      total_duration_ms: mean(allRuns.map(r => r.totals.wall_clock_duration_ms)),
      data_fetch_ms: mean(allRuns.map(r => r.phases.data_fetch?.duration_ms ?? 0)),
      scoring_ms: mean(allRuns.map(r => r.phases.scoring?.duration_ms ?? 0)),
      selection_ms: mean(allRuns.map(r => r.phases.selection?.duration_ms ?? 0)),
      persistence_ms: mean(allRuns.map(r => r.phases.persistence?.duration_ms ?? 0)),
      cache_hit_rate: mean(allRuns.map(r => {
        const dataFetch = r.phases.data_fetch;
        if (!dataFetch || !('cache_hits' in dataFetch)) return 0;
        const symbolsProcessed = (dataFetch as any).symbols_processed || 1;
        return (dataFetch as any).cache_hits / symbolsProcessed;
      })),
      symbols_per_run: mean(allRuns.map(r => r.total_symbols))
    };

    // Build trends (group by day)
    const trends = groupByDay(allRuns).map(group => ({
      date: group.date,
      duration_ms: mean(group.runs.map(r => r.totals.wall_clock_duration_ms)),
      cache_hit_rate: mean(group.runs.map(r => {
        const dataFetch = r.phases.data_fetch;
        if (!dataFetch || !('cache_hits' in dataFetch)) return 0;
        const symbolsProcessed = (dataFetch as any).symbols_processed || 1;
        return (dataFetch as any).cache_hits / symbolsProcessed;
      })),
      symbol_count: mean(group.runs.map(r => r.total_symbols))
    }));

    // Return last 20 runs for the table
    const recentRuns = allRuns.slice(-20);

    return NextResponse.json({
      recent_runs: recentRuns,
      averages,
      trends
    } as PerformanceSummary);
  } catch (error) {
    console.error('Failed to load performance summary:', error);
    return NextResponse.json(
      { error: 'Failed to load performance data' },
      { status: 500 }
    );
  }
}

/**
 * Calculate mean of array
 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Group runs by date
 */
function groupByDay(runs: PerformanceMetrics[]): Array<{ date: string; runs: PerformanceMetrics[] }> {
  const grouped = new Map<string, PerformanceMetrics[]>();

  for (const run of runs) {
    const date = run.timestamp.split('T')[0];
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date)!.push(run);
  }

  return Array.from(grouped.entries())
    .map(([date, runs]) => ({ date, runs }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
