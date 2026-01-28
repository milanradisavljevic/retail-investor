#!/usr/bin/env tsx
/**
 * Performance Report CLI Tool
 * Generates comprehensive analysis of run performance over time
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type { PerformanceMetrics } from '../src/lib/performance/tracker';
import { calculateStats, formatDuration } from '../src/lib/performance/tracker';

async function generateReport() {
  const perfDir = join(process.cwd(), 'data', 'performance');

  try {
    const files = await readdir(perfDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      console.log('\n⚠️  No performance data found in data/performance/');
      console.log('Run some scoring operations first to generate performance metrics.\n');
      return;
    }

    // Load all runs
    const runs: PerformanceMetrics[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await readFile(join(perfDir, file), 'utf-8');
        runs.push(JSON.parse(content));
      } catch (err) {
        console.warn(`Failed to parse ${file}:`, err);
      }
    }

    if (runs.length === 0) {
      console.log('\n⚠️  No valid performance data could be loaded.\n');
      return;
    }

    // Sort by timestamp
    runs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    console.log('\n' + '='.repeat(80));
    console.log('PERFORMANCE REPORT'.padStart(45));
    console.log('='.repeat(80));
    console.log();

    // Basic info
    console.log(`Total Runs Analyzed: ${runs.length}`);
    console.log(`Date Range: ${runs[0].timestamp.split('T')[0]} to ${runs[runs.length - 1].timestamp.split('T')[0]}`);
    console.log();

    // Overall duration statistics
    const durations = runs.map(r => r.totals.wall_clock_duration_ms);
    const durationStats = calculateStats(durations);

    console.log('Overall Duration Statistics:');
    console.log(`  Average:          ${formatDuration(durationStats.mean)}`);
    console.log(`  Median:           ${formatDuration(durationStats.median)}`);
    console.log(`  Min:              ${formatDuration(durationStats.min)}`);
    console.log(`  Max:              ${formatDuration(durationStats.max)}`);
    console.log(`  Std Deviation:    ${formatDuration(durationStats.stdDev)}`);
    console.log();

    // Phase breakdown
    const dataFetchDurations = runs.map(r => r.phases.data_fetch?.duration_ms ?? 0);
    const scoringDurations = runs.map(r => r.phases.scoring?.duration_ms ?? 0);
    const selectionDurations = runs.map(r => r.phases.selection?.duration_ms ?? 0);
    const persistenceDurations = runs.map(r => r.phases.persistence?.duration_ms ?? 0);

    console.log('Average Phase Durations:');
    console.log(`  Data Fetch:       ${formatDuration(mean(dataFetchDurations))} (${((mean(dataFetchDurations) / durationStats.mean) * 100).toFixed(1)}%)`);
    console.log(`  Scoring:          ${formatDuration(mean(scoringDurations))} (${((mean(scoringDurations) / durationStats.mean) * 100).toFixed(1)}%)`);
    console.log(`  Selection:        ${formatDuration(mean(selectionDurations))} (${((mean(selectionDurations) / durationStats.mean) * 100).toFixed(1)}%)`);
    console.log(`  Persistence:      ${formatDuration(mean(persistenceDurations))} (${((mean(persistenceDurations) / durationStats.mean) * 100).toFixed(1)}%)`);
    console.log();

    // Cache performance
    const cacheHitRates = runs
      .filter(r => r.phases.data_fetch && 'cache_hits' in r.phases.data_fetch)
      .map(r => {
        const dataFetch = r.phases.data_fetch as any;
        return dataFetch.cache_hits / dataFetch.symbols_processed;
      });

    if (cacheHitRates.length > 0) {
      const cacheStats = calculateStats(cacheHitRates);
      console.log('Cache Performance:');
      console.log(`  Average Hit Rate: ${(cacheStats.mean * 100).toFixed(1)}%`);
      console.log(`  Median Hit Rate:  ${(cacheStats.median * 100).toFixed(1)}%`);
      console.log(`  Min Hit Rate:     ${(cacheStats.min * 100).toFixed(1)}%`);
      console.log(`  Max Hit Rate:     ${(cacheStats.max * 100).toFixed(1)}%`);
      console.log();
    }

    // Performance per symbol
    const symbolCounts = runs.map(r => r.total_symbols);
    const msPerSymbol = runs.map((r, i) => durations[i] / symbolCounts[i]);
    const msPerSymbolStats = calculateStats(msPerSymbol);

    console.log('Performance Per Symbol:');
    console.log(`  Average:          ${formatDuration(msPerSymbolStats.mean)}/symbol`);
    console.log(`  Median:           ${formatDuration(msPerSymbolStats.median)}/symbol`);
    console.log(`  Best:             ${formatDuration(msPerSymbolStats.min)}/symbol`);
    console.log(`  Worst:            ${formatDuration(msPerSymbolStats.max)}/symbol`);
    console.log();

    // Bottleneck analysis
    const allBottlenecks = runs.flatMap(r => r.bottlenecks);
    const bottleneckCounts = new Map<string, number>();

    for (const b of allBottlenecks) {
      bottleneckCounts.set(b.phase, (bottleneckCounts.get(b.phase) || 0) + 1);
    }

    if (allBottlenecks.length > 0) {
      console.log('Most Common Bottlenecks:');
      Array.from(bottleneckCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([phase, count]) => {
          const percentage = (count / runs.length) * 100;
          console.log(`  ${phase.padEnd(20)} ${count} occurrences (${percentage.toFixed(1)}% of runs)`);
        });
      console.log();
    } else {
      console.log('✓ No bottlenecks detected in any runs');
      console.log();
    }

    // Universe breakdown
    const universeStats = new Map<string, number[]>();
    for (const run of runs) {
      if (!universeStats.has(run.universe)) {
        universeStats.set(run.universe, []);
      }
      universeStats.get(run.universe)!.push(run.totals.wall_clock_duration_ms);
    }

    if (universeStats.size > 1) {
      console.log('Performance by Universe:');
      Array.from(universeStats.entries())
        .sort((a, b) => mean(a[1]) - mean(b[1]))
        .forEach(([universe, durations]) => {
          const stats = calculateStats(durations);
          console.log(`  ${universe.padEnd(30)} ${durations.length} runs, avg ${formatDuration(stats.mean)}`);
        });
      console.log();
    }

    // Memory statistics
    const memoryPeaks = runs.map(r => r.totals.memory_peak_mb);
    const memoryStats = calculateStats(memoryPeaks);

    console.log('Memory Usage:');
    console.log(`  Average Peak:     ${memoryStats.mean.toFixed(1)} MB`);
    console.log(`  Median Peak:      ${memoryStats.median.toFixed(1)} MB`);
    console.log(`  Max Peak:         ${memoryStats.max.toFixed(1)} MB`);
    console.log();

    // Recent performance trend
    const recentRuns = runs.slice(-10);
    const recentDurations = recentRuns.map(r => r.totals.wall_clock_duration_ms);
    const recentAvg = mean(recentDurations);
    const overallAvg = durationStats.mean;
    const trend = recentAvg < overallAvg ? '↓' : recentAvg > overallAvg ? '↑' : '→';
    const trendPct = ((recentAvg - overallAvg) / overallAvg) * 100;

    console.log('Recent Trend (Last 10 Runs):');
    console.log(`  Recent Average:   ${formatDuration(recentAvg)}`);
    console.log(`  Overall Average:  ${formatDuration(overallAvg)}`);
    console.log(`  Trend:            ${trend} ${trendPct > 0 ? '+' : ''}${trendPct.toFixed(1)}%`);
    console.log();

    // Recommendations
    console.log('Recommendations:');

    const cacheStatsAvailable = cacheHitRates.length > 0;
    if (cacheStatsAvailable) {
      const avgCacheHitRate = mean(cacheHitRates);
      if (avgCacheHitRate < 0.7) {
        console.log('  ⚠️  Cache hit rate is below 70% - consider increasing TTL or cache warming');
      }
    }

    if (msPerSymbolStats.mean > 200) {
      console.log('  ⚠️  Average time per symbol is >200ms - profile for optimization opportunities');
    }

    if (bottleneckCounts.size > 0) {
      const topBottleneck = Array.from(bottleneckCounts.entries())
        .sort((a, b) => b[1] - a[1])[0];
      console.log(`  ⚠️  "${topBottleneck[0]}" is the most common bottleneck - focus optimization here`);
    }

    if (memoryStats.max > 1000) {
      console.log('  ⚠️  Memory peaks above 1GB detected - check for memory leaks');
    }

    if (trendPct > 20) {
      console.log('  ⚠️  Performance degrading over time - investigate recent changes');
    } else if (trendPct < -20) {
      console.log('  ✓ Performance improving over time - recent optimizations are working');
    }

    if (!allBottlenecks.length && cacheStatsAvailable && mean(cacheHitRates) > 0.8 && msPerSymbolStats.mean < 100) {
      console.log('  ✓ Performance is excellent across all metrics!');
    }

    console.log();
    console.log('='.repeat(80));
    console.log();
  } catch (error) {
    console.error('\n❌ Error generating performance report:', error);
    process.exit(1);
  }
}

/**
 * Calculate mean of array
 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Run the report
generateReport().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
