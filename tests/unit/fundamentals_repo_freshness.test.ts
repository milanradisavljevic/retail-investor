import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { closeDatabase } from '@/data/db';
import {
  getFundamentalsIfFresh,
  getLatestFundamentals,
  saveFundamentals,
  type FundamentalsData,
} from '@/data/repositories/fundamentals_repo';

let originalCwd: string;
let tempDir: string;

function makeFundamentals(overrides: Partial<FundamentalsData> = {}): FundamentalsData {
  return {
    peRatio: null,
    pbRatio: null,
    psRatio: null,
    pegRatio: null,
    roe: null,
    roa: null,
    debtToEquity: null,
    currentRatio: null,
    grossMargin: null,
    operatingMargin: null,
    netMargin: null,
    dividendYield: null,
    payoutRatio: null,
    freeCashFlow: null,
    fcf: null,
    operatingCashFlow: null,
    revenue: null,
    netIncome: null,
    marketCap: null,
    enterpriseValue: null,
    revenueGrowth: null,
    earningsGrowth: null,
    analystTargetMean: null,
    analystTargetLow: null,
    analystTargetHigh: null,
    analystCount: null,
    nextEarningsDate: null,
    beta: null,
    ...overrides,
  };
}

describe('fundamentals_repo freshness timestamp normalization', () => {
  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), 'fundamentals-repo-'));

    const sourceMigrationsDir = join(originalCwd, 'src', 'data', 'migrations');
    const targetMigrationsDir = join(tempDir, 'src', 'data', 'migrations');
    mkdirSync(targetMigrationsDir, { recursive: true });
    cpSync(sourceMigrationsDir, targetMigrationsDir, { recursive: true });

    process.chdir(tempDir);
  });

  afterEach(() => {
    closeDatabase();
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('normalizes seconds-based fetched_at values to milliseconds on read', () => {
    const nowSeconds = Math.floor(Date.now() / 1000) - 5;
    saveFundamentals('AAA', makeFundamentals({ _source: 'sec_edgar_bulk' }), nowSeconds);

    const latest = getLatestFundamentals('AAA');
    expect(latest).not.toBeNull();
    expect(latest!.fetchedAt).toBe(nowSeconds * 1000);
  });

  it('treats seconds-based snapshots as fresh when within TTL', () => {
    const nowSeconds = Math.floor(Date.now() / 1000) - 30;
    saveFundamentals('BBB', makeFundamentals({ _source: 'fmp' }), nowSeconds);

    const snapshot = getFundamentalsIfFresh('BBB', 5 * 60 * 1000);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.symbol).toBe('BBB');
  });

  it('returns null when snapshot age exceeds TTL', () => {
    const staleMs = Date.now() - 3 * 24 * 60 * 60 * 1000;
    saveFundamentals('CCC', makeFundamentals({ _source: 'fmp' }), staleMs);

    const snapshot = getFundamentalsIfFresh('CCC', 24 * 60 * 60 * 1000);
    expect(snapshot).toBeNull();
  });
});
