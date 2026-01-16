#!/usr/bin/env npx tsx
/**
 * API Stress Test for S&P 500 (500 Symbols)
 *
 * Tests API performance and reliability with full universe.
 * Tracks: latency, error rates, cache hits, memory usage.
 *
 * Usage:
 *   npm run stress-test              # Default: yfinance
 *   npm run stress-test -- --provider=finnhub
 *   npm run stress-test -- --symbols=100   # Limit symbols
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// Configuration
const DEFAULT_PROVIDER = 'yfinance';
const UNIVERSE_FILE = 'config/universes/sp500-full.json';
const OUTPUT_DIR = 'data/stress-tests';
const BATCH_SIZE = 10; // Symbols per batch for progress reporting
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 2000;

// Targets
const TARGETS = {
  maxTimePerSymbolMs: 2000,      // 2 seconds per symbol
  maxTotalTimeMinutes: 10,       // 10 minutes total
  maxErrorRate: 0.02,            // 2% error rate
  minDataCompleteness: 0.90,     // 90% complete data
  maxMemoryMB: 2048,             // 2GB peak memory
};

interface SymbolResult {
  symbol: string;
  success: boolean;
  timeMs: number;
  error?: string;
  retries: number;
  dataComplete: boolean;
  fields: {
    price: boolean;
    pe: boolean;
    pb: boolean;
    roe: boolean;
    high52w: boolean;
    low52w: boolean;
  };
}

interface StressTestMetrics {
  timestamp: string;
  provider: string;
  config: {
    universe: string;
    totalSymbols: number;
    batchSize: number;
    retryCount: number;
  };
  performance: {
    totalTimeMs: number;
    totalTimeMinutes: number;
    avgTimePerSymbolMs: number;
    medianTimePerSymbolMs: number;
    p95TimePerSymbolMs: number;
    symbolsPerMinute: number;
  };
  reliability: {
    successfulFetches: number;
    failedFetches: number;
    errorRate: number;
    totalRetries: number;
    errorsByType: Record<string, number>;
  };
  dataQuality: {
    symbolsWithCompleteData: number;
    completenessRate: number;
    fieldCoverage: Record<string, number>;
  };
  memory: {
    peakMemoryMB: number;
    startMemoryMB: number;
    endMemoryMB: number;
  };
  targets: {
    timePerSymbolPassed: boolean;
    totalTimePassed: boolean;
    errorRatePassed: boolean;
    completenessPassed: boolean;
    memoryPassed: boolean;
    allPassed: boolean;
  };
  symbolResults: SymbolResult[];
}

/**
 * Load universe symbols
 */
function loadUniverse(limit?: number): string[] {
  const data = JSON.parse(fs.readFileSync(UNIVERSE_FILE, 'utf-8'));
  let symbols = data.symbols as string[];
  if (limit && limit > 0) {
    symbols = symbols.slice(0, limit);
  }
  return symbols;
}

/**
 * Get memory usage in MB
 */
function getMemoryMB(): number {
  const usage = process.memoryUsage();
  return Math.round(usage.heapUsed / 1024 / 1024);
}

/**
 * Calculate percentile
 */
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Fetch data for a single symbol using yfinance CLI
 */
async function fetchSymbolYFinance(symbol: string): Promise<{
  success: boolean;
  data: Record<string, unknown> | null;
  error?: string;
}> {
  return new Promise((resolve) => {
    const py = spawn('python3', [
      '-c',
      `
import yfinance as yf
import json
import sys

try:
    ticker = yf.Ticker("${symbol}")
    info = ticker.info or {}
    result = {
        "price": info.get("currentPrice") or info.get("regularMarketPrice"),
        "pe": info.get("trailingPE"),
        "pb": info.get("priceToBook"),
        "roe": info.get("returnOnEquity"),
        "high52w": info.get("fiftyTwoWeekHigh"),
        "low52w": info.get("fiftyTwoWeekLow"),
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`,
    ]);

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    py.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    py.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const data = JSON.parse(stdout.trim());
          resolve({ success: true, data });
        } catch {
          resolve({ success: false, data: null, error: 'JSON parse error' });
        }
      } else {
        resolve({
          success: false,
          data: null,
          error: stderr.trim() || `Exit code ${code}`,
        });
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      py.kill();
      resolve({ success: false, data: null, error: 'Timeout (30s)' });
    }, 30000);
  });
}

/**
 * Fetch with retries
 */
async function fetchWithRetry(
  symbol: string,
  provider: string
): Promise<{ result: SymbolResult; peakMemory: number }> {
  const startTime = Date.now();
  let lastError = '';
  let retries = 0;
  let peakMemory = getMemoryMB();

  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    if (attempt > 0) {
      retries++;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }

    const fetchFn = provider === 'yfinance' ? fetchSymbolYFinance : fetchSymbolYFinance; // TODO: Add Finnhub
    const { success, data, error } = await fetchFn(symbol);

    peakMemory = Math.max(peakMemory, getMemoryMB());

    if (success && data) {
      const fields = {
        price: data.price != null,
        pe: data.pe != null,
        pb: data.pb != null,
        roe: data.roe != null,
        high52w: data.high52w != null,
        low52w: data.low52w != null,
      };

      const dataComplete = Object.values(fields).filter(Boolean).length >= 4; // At least 4/6 fields

      return {
        result: {
          symbol,
          success: true,
          timeMs: Date.now() - startTime,
          retries,
          dataComplete,
          fields,
        },
        peakMemory,
      };
    }

    lastError = error || 'Unknown error';
  }

  return {
    result: {
      symbol,
      success: false,
      timeMs: Date.now() - startTime,
      error: lastError,
      retries,
      dataComplete: false,
      fields: {
        price: false,
        pe: false,
        pb: false,
        roe: false,
        high52w: false,
        low52w: false,
      },
    },
    peakMemory,
  };
}

/**
 * Run the stress test
 */
async function runStressTest(
  provider: string,
  symbolLimit?: number
): Promise<StressTestMetrics> {
  console.log('='.repeat(60));
  console.log('API STRESS TEST');
  console.log('='.repeat(60));

  const symbols = loadUniverse(symbolLimit);
  console.log(`\nProvider: ${provider}`);
  console.log(`Symbols: ${symbols.length}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Retries: ${RETRY_COUNT}`);
  console.log('\nTargets:');
  console.log(`  Max time/symbol: ${TARGETS.maxTimePerSymbolMs}ms`);
  console.log(`  Max total time: ${TARGETS.maxTotalTimeMinutes} minutes`);
  console.log(`  Max error rate: ${TARGETS.maxErrorRate * 100}%`);
  console.log(`  Min completeness: ${TARGETS.minDataCompleteness * 100}%`);
  console.log(`  Max memory: ${TARGETS.maxMemoryMB}MB`);
  console.log('\n' + '-'.repeat(60));

  const startTime = Date.now();
  const startMemory = getMemoryMB();
  let peakMemory = startMemory;

  const results: SymbolResult[] = [];
  const errorsByType: Record<string, number> = {};

  // Process symbols
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const { result, peakMemory: pm } = await fetchWithRetry(symbol, provider);
    results.push(result);
    peakMemory = Math.max(peakMemory, pm);

    if (!result.success && result.error) {
      const errorType = result.error.includes('Timeout')
        ? 'Timeout'
        : result.error.includes('rate')
        ? 'RateLimit'
        : 'Other';
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    }

    // Progress report
    if ((i + 1) % BATCH_SIZE === 0 || i === symbols.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const errors = results.filter((r) => !r.success).length;
      const rate = ((i + 1) / ((Date.now() - startTime) / 60000)).toFixed(1);
      console.log(
        `[${i + 1}/${symbols.length}] ${errors} errors, ${elapsed}s elapsed, ${rate} symbols/min, ${peakMemory}MB mem`
      );
    }
  }

  const totalTimeMs = Date.now() - startTime;
  const endMemory = getMemoryMB();

  // Calculate metrics
  const successfulResults = results.filter((r) => r.success);
  const times = successfulResults.map((r) => r.timeMs);

  const metrics: StressTestMetrics = {
    timestamp: new Date().toISOString(),
    provider,
    config: {
      universe: UNIVERSE_FILE,
      totalSymbols: symbols.length,
      batchSize: BATCH_SIZE,
      retryCount: RETRY_COUNT,
    },
    performance: {
      totalTimeMs,
      totalTimeMinutes: Math.round((totalTimeMs / 60000) * 100) / 100,
      avgTimePerSymbolMs: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
      medianTimePerSymbolMs: times.length > 0 ? percentile(times, 50) : 0,
      p95TimePerSymbolMs: times.length > 0 ? percentile(times, 95) : 0,
      symbolsPerMinute: Math.round((symbols.length / (totalTimeMs / 60000)) * 10) / 10,
    },
    reliability: {
      successfulFetches: successfulResults.length,
      failedFetches: results.filter((r) => !r.success).length,
      errorRate: Math.round((results.filter((r) => !r.success).length / results.length) * 1000) / 1000,
      totalRetries: results.reduce((sum, r) => sum + r.retries, 0),
      errorsByType,
    },
    dataQuality: {
      symbolsWithCompleteData: successfulResults.filter((r) => r.dataComplete).length,
      completenessRate:
        successfulResults.length > 0
          ? Math.round((successfulResults.filter((r) => r.dataComplete).length / successfulResults.length) * 1000) / 1000
          : 0,
      fieldCoverage: {
        price: successfulResults.filter((r) => r.fields.price).length,
        pe: successfulResults.filter((r) => r.fields.pe).length,
        pb: successfulResults.filter((r) => r.fields.pb).length,
        roe: successfulResults.filter((r) => r.fields.roe).length,
        high52w: successfulResults.filter((r) => r.fields.high52w).length,
        low52w: successfulResults.filter((r) => r.fields.low52w).length,
      },
    },
    memory: {
      peakMemoryMB: peakMemory,
      startMemoryMB: startMemory,
      endMemoryMB: endMemory,
    },
    targets: {
      timePerSymbolPassed: (times.length > 0 ? percentile(times, 95) : 0) <= TARGETS.maxTimePerSymbolMs,
      totalTimePassed: totalTimeMs / 60000 <= TARGETS.maxTotalTimeMinutes,
      errorRatePassed: results.filter((r) => !r.success).length / results.length <= TARGETS.maxErrorRate,
      completenessPassed:
        successfulResults.length > 0
          ? successfulResults.filter((r) => r.dataComplete).length / successfulResults.length >= TARGETS.minDataCompleteness
          : false,
      memoryPassed: peakMemory <= TARGETS.maxMemoryMB,
      allPassed: false, // Set below
    },
    symbolResults: results,
  };

  metrics.targets.allPassed =
    metrics.targets.timePerSymbolPassed &&
    metrics.targets.totalTimePassed &&
    metrics.targets.errorRatePassed &&
    metrics.targets.completenessPassed &&
    metrics.targets.memoryPassed;

  return metrics;
}

/**
 * Print summary
 */
function printSummary(metrics: StressTestMetrics): void {
  console.log('\n' + '='.repeat(60));
  console.log('STRESS TEST RESULTS');
  console.log('='.repeat(60));

  console.log('\n📊 PERFORMANCE:');
  console.log(`  Total time: ${metrics.performance.totalTimeMinutes} minutes`);
  console.log(`  Avg time/symbol: ${metrics.performance.avgTimePerSymbolMs}ms`);
  console.log(`  Median time/symbol: ${metrics.performance.medianTimePerSymbolMs}ms`);
  console.log(`  P95 time/symbol: ${metrics.performance.p95TimePerSymbolMs}ms`);
  console.log(`  Throughput: ${metrics.performance.symbolsPerMinute} symbols/min`);

  console.log('\n✅ RELIABILITY:');
  console.log(`  Successful: ${metrics.reliability.successfulFetches}/${metrics.config.totalSymbols}`);
  console.log(`  Failed: ${metrics.reliability.failedFetches}`);
  console.log(`  Error rate: ${(metrics.reliability.errorRate * 100).toFixed(1)}%`);
  console.log(`  Total retries: ${metrics.reliability.totalRetries}`);
  if (Object.keys(metrics.reliability.errorsByType).length > 0) {
    console.log(`  Errors by type: ${JSON.stringify(metrics.reliability.errorsByType)}`);
  }

  console.log('\n📈 DATA QUALITY:');
  console.log(`  Complete data: ${metrics.dataQuality.symbolsWithCompleteData}/${metrics.reliability.successfulFetches}`);
  console.log(`  Completeness rate: ${(metrics.dataQuality.completenessRate * 100).toFixed(1)}%`);
  console.log('  Field coverage:');
  for (const [field, count] of Object.entries(metrics.dataQuality.fieldCoverage)) {
    const pct = ((count / metrics.reliability.successfulFetches) * 100).toFixed(0);
    console.log(`    ${field}: ${count} (${pct}%)`);
  }

  console.log('\n💾 MEMORY:');
  console.log(`  Peak: ${metrics.memory.peakMemoryMB}MB`);
  console.log(`  Start: ${metrics.memory.startMemoryMB}MB`);
  console.log(`  End: ${metrics.memory.endMemoryMB}MB`);

  console.log('\n🎯 TARGETS:');
  const check = (passed: boolean) => (passed ? '✓' : '✗');
  console.log(`  ${check(metrics.targets.timePerSymbolPassed)} Time/symbol ≤ ${TARGETS.maxTimePerSymbolMs}ms (P95: ${metrics.performance.p95TimePerSymbolMs}ms)`);
  console.log(`  ${check(metrics.targets.totalTimePassed)} Total time ≤ ${TARGETS.maxTotalTimeMinutes}min (Actual: ${metrics.performance.totalTimeMinutes}min)`);
  console.log(`  ${check(metrics.targets.errorRatePassed)} Error rate ≤ ${TARGETS.maxErrorRate * 100}% (Actual: ${(metrics.reliability.errorRate * 100).toFixed(1)}%)`);
  console.log(`  ${check(metrics.targets.completenessPassed)} Completeness ≥ ${TARGETS.minDataCompleteness * 100}% (Actual: ${(metrics.dataQuality.completenessRate * 100).toFixed(1)}%)`);
  console.log(`  ${check(metrics.targets.memoryPassed)} Memory ≤ ${TARGETS.maxMemoryMB}MB (Peak: ${metrics.memory.peakMemoryMB}MB)`);

  console.log('\n' + '='.repeat(60));
  if (metrics.targets.allPassed) {
    console.log('🎉 ALL TARGETS PASSED!');
  } else {
    console.log('⚠️  SOME TARGETS FAILED - See details above');
  }
  console.log('='.repeat(60));
}

/**
 * Save results to JSON
 */
function saveResults(metrics: StressTestMetrics): string {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `stress-test-${metrics.provider}-${timestamp}.json`;
  const filepath = path.join(OUTPUT_DIR, filename);

  // Save without full symbol results for readability
  const summary = { ...metrics };
  delete (summary as Record<string, unknown>).symbolResults;

  fs.writeFileSync(filepath, JSON.stringify(metrics, null, 2));
  console.log(`\n📁 Full results saved to: ${filepath}`);

  // Also save a summary file
  const summaryPath = path.join(OUTPUT_DIR, 'latest-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`📁 Summary saved to: ${summaryPath}`);

  return filepath;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Parse args
  const args = process.argv.slice(2);
  let provider = DEFAULT_PROVIDER;
  let symbolLimit: number | undefined;

  for (const arg of args) {
    if (arg.startsWith('--provider=')) {
      provider = arg.split('=')[1];
    } else if (arg.startsWith('--symbols=')) {
      symbolLimit = parseInt(arg.split('=')[1], 10);
    }
  }

  try {
    const metrics = await runStressTest(provider, symbolLimit);
    printSummary(metrics);
    saveResults(metrics);

    process.exit(metrics.targets.allPassed ? 0 : 1);
  } catch (error) {
    console.error('Stress test failed:', error);
    process.exit(1);
  }
}

main();
