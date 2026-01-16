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
  scores: [
    {
      symbol: 'AAA',
      total_score: 70,
      breakdown: { fundamental: 60, technical: 80 },
      evidence: { valuation: 60, quality: 60, technical: 80, risk: 70 },
      data_quality: { missing_fields: [], assumptions: [], adjusted_price_mode: 'adjusted' },
    },
  ],
  selections: {
    top5: ['AAA', 'AAA', 'AAA', 'AAA', 'AAA'],
    top10: ['AAA', 'AAA', 'AAA', 'AAA', 'AAA', 'AAA', 'AAA', 'AAA', 'AAA', 'AAA'],
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
