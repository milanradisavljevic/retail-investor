/**
 * Performance Tracking System
 * Measures and analyzes run performance to identify bottlenecks
 */

import { writeFile } from 'fs/promises';
import { join } from 'path';
import { createChildLogger } from '@/utils/logger';

const logger = createChildLogger('perf_tracker');

export interface PhaseMetrics {
  duration_ms: number;
  [key: string]: any;
}

export interface DataFetchMetrics extends PhaseMetrics {
  symbols_processed: number;
  cache_hits: number;
  cache_misses: number;
  provider_calls: number;
  failed_fetches: number;
  avg_ms_per_symbol: number;
}

export interface ScoringMetrics extends PhaseMetrics {
  symbols_scored: number;
  avg_ms_per_symbol: number;
  pillar_breakdown?: {
    valuation_ms?: number;
    quality_ms?: number;
    technical_ms?: number;
    risk_ms?: number;
  };
}

export interface SelectionMetrics extends PhaseMetrics {
  picks_generated: number;
  diversification_passes?: number;
}

export interface PersistenceMetrics extends PhaseMetrics {
  json_write_ms: number;
  file_size_bytes: number;
}

export interface Bottleneck {
  phase: string;
  percentage_of_total: number;
  recommendation: string;
}

export interface PerformanceMetrics {
  run_id: string;
  universe: string;
  total_symbols: number;
  timestamp: string;

  phases: {
    data_fetch?: DataFetchMetrics;
    scoring?: ScoringMetrics;
    selection?: SelectionMetrics;
    persistence?: PersistenceMetrics;
    [key: string]: PhaseMetrics | undefined;
  };

  totals: {
    wall_clock_duration_ms: number;
    cpu_time_ms: number;
    memory_peak_mb: number;
  };

  bottlenecks: Bottleneck[];
}

/**
 * Performance tracker for run operations
 * Instruments each phase and generates performance reports
 */
export class PerformanceTracker {
  private startTime: number;
  private phaseTimers: Map<string, number>;
  private phaseStartMemory: Map<string, number>;
  private metrics: Partial<PerformanceMetrics>;

  constructor(runId: string, universe: string, symbolCount: number) {
    this.startTime = performance.now();
    this.phaseTimers = new Map();
    this.phaseStartMemory = new Map();
    this.metrics = {
      run_id: runId,
      universe: universe,
      total_symbols: symbolCount,
      timestamp: new Date().toISOString(),
      phases: {},
      totals: {} as any,
      bottlenecks: []
    };

    logger.debug({ run_id: runId, universe, symbol_count: symbolCount }, 'Performance tracker initialized');
  }

  /**
   * Start timing a phase
   */
  startPhase(phase: string): void {
    const now = performance.now();
    this.phaseTimers.set(phase, now);

    if (typeof process !== 'undefined' && process.memoryUsage) {
      this.phaseStartMemory.set(phase, process.memoryUsage().heapUsed);
    }

    logger.debug({ phase }, 'Phase started');
  }

  /**
   * End timing a phase and record metrics
   */
  endPhase(phase: string, additionalData?: Record<string, any>): void {
    const startTime = this.phaseTimers.get(phase);
    if (!startTime) {
      logger.warn({ phase }, 'Phase was not started, cannot end');
      return;
    }

    const duration = performance.now() - startTime;

    // Calculate memory delta if available
    let memoryDelta: number | undefined;
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const startMemory = this.phaseStartMemory.get(phase);
      if (startMemory) {
        const currentMemory = process.memoryUsage().heapUsed;
        memoryDelta = Math.round((currentMemory - startMemory) / 1024 / 1024); // MB
      }
    }

    this.metrics.phases![phase] = {
      duration_ms: Math.round(duration),
      memory_delta_mb: memoryDelta,
      ...additionalData
    };

    this.phaseTimers.delete(phase);
    this.phaseStartMemory.delete(phase);

    logger.debug({
      phase,
      duration_ms: Math.round(duration),
      memory_delta_mb: memoryDelta
    }, 'Phase completed');
  }

  /**
   * Get the duration of a completed phase
   */
  getPhaseTime(phase: string): number {
    const phaseData = this.metrics.phases![phase];
    return phaseData?.duration_ms ?? 0;
  }

  /**
   * Finalize metrics and identify bottlenecks
   */
  finalize(): PerformanceMetrics {
    const totalDuration = performance.now() - this.startTime;

    // Calculate totals
    let cpuTimeMs = 0;
    let memoryPeakMb = 0;

    if (typeof process !== 'undefined') {
      if (process.cpuUsage) {
        cpuTimeMs = Math.round(process.cpuUsage().user / 1000);
      }
      if (process.memoryUsage) {
        memoryPeakMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      }
    }

    this.metrics.totals = {
      wall_clock_duration_ms: Math.round(totalDuration),
      cpu_time_ms: cpuTimeMs,
      memory_peak_mb: memoryPeakMb
    };

    // Identify bottlenecks (phases > 30% of total time)
    const phases = this.metrics.phases!;
    this.metrics.bottlenecks = Object.entries(phases)
      .filter(([, data]) => data !== undefined)
      .map(([phase, data]) => ({
        phase,
        percentage_of_total: (data!.duration_ms / totalDuration) * 100,
        recommendation: this.getRecommendation(phase, data!)
      }))
      .filter(b => b.percentage_of_total > 30)
      .sort((a, b) => b.percentage_of_total - a.percentage_of_total);

    logger.info({
      run_id: this.metrics.run_id,
      total_duration_ms: Math.round(totalDuration),
      total_duration_formatted: this.formatDuration(totalDuration),
      bottleneck_count: this.metrics.bottlenecks.length,
      bottlenecks: this.metrics.bottlenecks.map(b => `${b.phase} (${b.percentage_of_total.toFixed(1)}%)`)
    }, 'Performance metrics finalized');

    return this.metrics as PerformanceMetrics;
  }

  /**
   * Generate optimization recommendations based on phase data
   */
  private getRecommendation(phase: string, data: PhaseMetrics): string {
    if (phase === 'data_fetch' && 'cache_hits' in data && 'symbols_processed' in data) {
      const cacheHitRate = (data as DataFetchMetrics).cache_hits / (data as DataFetchMetrics).symbols_processed;

      if (cacheHitRate < 0.5) {
        return 'Low cache hit rate (<50%) - consider increasing cache TTL or warming cache before runs';
      }

      const avgPerSymbol = (data as DataFetchMetrics).avg_ms_per_symbol;
      if (avgPerSymbol > 500) {
        return 'Slow per-symbol fetches (>500ms) - implement batch API calls or increase concurrency';
      }

      const failureRate = (data as DataFetchMetrics).failed_fetches / (data as DataFetchMetrics).symbols_processed;
      if (failureRate > 0.1) {
        return `High failure rate (${(failureRate * 100).toFixed(1)}%) - investigate provider issues or add retry logic`;
      }
    }

    if (phase === 'scoring' && 'avg_ms_per_symbol' in data) {
      const avgPerSymbol = (data as ScoringMetrics).avg_ms_per_symbol;

      if (avgPerSymbol > 100) {
        return 'Scoring is slow (>100ms/symbol) - profile pillar breakdown and optimize hot paths';
      }
    }

    if (phase === 'persistence' && 'file_size_bytes' in data) {
      const sizeMb = (data as PersistenceMetrics).file_size_bytes / 1024 / 1024;

      if (sizeMb > 10) {
        return `Large output file (${sizeMb.toFixed(1)}MB) - consider compression or data structure optimization`;
      }
    }

    return 'Phase taking significant time - profile for specific bottlenecks';
  }

  /**
   * Format duration for logging
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}min`;
  }

  /**
   * Save metrics to file system
   */
  async save(): Promise<void> {
    try {
      const metrics = this.finalize();
      const filename = join(process.cwd(), 'data', 'performance', `${metrics.run_id}.json`);
      await writeFile(filename, JSON.stringify(metrics, null, 2), 'utf-8');

      logger.info({
        run_id: metrics.run_id,
        filename,
        duration: this.formatDuration(metrics.totals.wall_clock_duration_ms)
      }, 'Performance metrics saved');
    } catch (error) {
      logger.error({ error, run_id: this.metrics.run_id }, 'Failed to save performance metrics');
      throw error;
    }
  }

  /**
   * Generate a console-friendly summary
   */
  printSummary(): void {
    const metrics = this.metrics as PerformanceMetrics;

    console.log('\n========================================');
    console.log('PERFORMANCE SUMMARY');
    console.log('========================================');
    console.log(`Run ID: ${metrics.run_id}`);
    console.log(`Universe: ${metrics.universe} (${metrics.total_symbols} symbols)`);
    console.log(`Total Duration: ${this.formatDuration(metrics.totals.wall_clock_duration_ms)}`);
    console.log(`Memory Peak: ${metrics.totals.memory_peak_mb}MB`);
    console.log('\nPhase Breakdown:');

    Object.entries(metrics.phases)
      .filter(([, data]) => data !== undefined)
      .forEach(([phase, data]) => {
        const pct = (data!.duration_ms / metrics.totals.wall_clock_duration_ms) * 100;
        console.log(`  ${phase.padEnd(20)} ${this.formatDuration(data!.duration_ms).padStart(10)} (${pct.toFixed(1)}%)`);
      });

    if (metrics.bottlenecks.length > 0) {
      console.log('\nBottlenecks Detected:');
      metrics.bottlenecks.forEach(b => {
        console.log(`  ⚠️  ${b.phase} (${b.percentage_of_total.toFixed(1)}%)`);
        console.log(`      → ${b.recommendation}`);
      });
    } else {
      console.log('\n✓ No major bottlenecks detected');
    }

    console.log('========================================\n');
  }
}

/**
 * Helper to format duration consistently
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}min`;
}

/**
 * Helper to calculate statistics
 */
export function calculateStats(values: number[]): {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
} {
  if (values.length === 0) {
    return { mean: 0, median: 0, min: 0, max: 0, stdDev: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  const stdDev = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);

  return { mean, median, min, max, stdDev };
}
