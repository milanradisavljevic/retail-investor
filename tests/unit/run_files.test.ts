import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, utimesSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getLatestRunFile, loadRunFiles } from '@/run/files';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

let originalCwd: string;
let tempDir: string;

const baseRun: RunV1SchemaJson = {
  run_id: 'RUN',
  run_date: '2026-01-01',
  as_of_date: '2026-01-01',
  provider: {
    name: 'finnhub',
    cache_policy: {
      prices_ttl_hours: 12,
      fundamentals_ttl_days: 14,
      news_ttl_minutes: 60,
    },
    rate_limit_observed: {
      max_concurrency: 5,
      requests_made: 1,
    },
  },
  universe: {
    definition: {
      name: 'Test',
      selection_rule: 'Test',
      version: '1',
    },
    symbols: ['AAA', 'BBB'],
  },
  benchmark: {
    type: 'proxy_instrument',
    name: 'S&P 500 ETF',
    provider_symbol: 'SPY',
  },
  mode: {
    model_version: 'test',
    label: 'NEUTRAL',
    score: 50,
    confidence: 0.5,
    benchmark: 'SPY',
    features: {
      ma50: undefined,
      ma200: undefined,
      vol20: undefined,
      vol60: undefined,
      breadth: undefined,
    },
  },
  data_quality_summary: {
    avg_data_quality_score: 70,
    pct_high: 0.5,
    pct_medium: 0.3,
    pct_low: 0.2,
    tickers_with_critical_fallback: [],
    most_missing_metrics: [],
    generated_at: '2026-01-01T00:00:00Z',
    universe_name: 'Test',
  },
  scores: [
    {
      symbol: 'AAA',
      total_score: 70,
      breakdown: { fundamental: 60, technical: 80 },
      evidence: { valuation: 60, quality: 60, technical: 80, risk: 70 },
      data_quality: {
        data_quality_score: 70,
        data_quality_confidence: 0.7,
        completeness_ratio: 0.9,
        imputed_ratio: 0.1,
        missing_critical: [],
        metrics: {},
        missing_fields: [],
        assumptions: [] as [],
        adjusted_price_mode: 'adjusted',
      },
    },
  ],
  selections: {
    top5: ['AAA', 'AAA', 'AAA', 'AAA', 'AAA'],
    top10: ['AAA', 'AAA', 'AAA', 'AAA', 'AAA', 'AAA', 'AAA', 'AAA', 'AAA', 'AAA'],
    top15: ['AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA'],
    top20: ['AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA'],
    top30: [
      'AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA',
      'AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA',
      'AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA','AAA'
    ],
    pick_of_the_day: 'AAA',
  },
  flags: {
    user_documents_missing: [],
    prompt_injection_suspected: [],
  },
  integrity: {
    score_version: 'test',
    config_hash: 'hash',
    inputs_hash: 'inputs',
  },
};

describe('run files ordering', () => {
  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), 'run-files-'));
    process.chdir(tempDir);
    mkdirSync(join(tempDir, 'data', 'runs'), { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('prefers newest mtime over filename order', () => {
    const runsDir = join(tempDir, 'data', 'runs');

    const olderPath = join(runsDir, '2026-01-01__AAAA.json');
    const newerPath = join(runsDir, '2025-12-31__ZZZZ.json');

    writeFileSync(olderPath, JSON.stringify({ ...baseRun, run_id: 'older' }));
    writeFileSync(newerPath, JSON.stringify({ ...baseRun, run_id: 'newer' }));

    // Force mtimes so newerPath is latest even though filename sorts earlier
    const oldTime = new Date('2026-01-02T00:00:00Z');
    const newTime = new Date('2026-01-03T00:00:00Z');
    utimesSync(olderPath, oldTime, oldTime);
    utimesSync(newerPath, newTime, newTime);

    const latest = getLatestRunFile();
    expect(latest?.run.run_id).toBe('newer');

    const ordered = loadRunFiles(2);
    expect(ordered[0]?.run.run_id).toBe('newer');
    expect(ordered[1]?.run.run_id).toBe('older');
  });
});
