import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { closeDatabase } from '@/data/db';
import {
  saveFundamentals,
  type FundamentalsData,
} from '@/data/repositories/fundamentals_repo';
import {
  getMergedFundamentals,
  getProviderCoverage,
} from '@/data/repositories/provider_merge';

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

describe('provider merge repository', () => {
  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), 'provider-merge-'));

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

  it('merges FMP and yfinance with field-level priority', () => {
    const now = Date.now();

    saveFundamentals(
      'AAA',
      makeFundamentals({
        _source: 'yfinance',
        peRatio: 31,
        roe: 14,
        beta: 1.12,
        freeCashFlow: 987_000_000,
      }),
      now - 10_000
    );

    saveFundamentals(
      'AAA',
      makeFundamentals({
        _source: 'fmp',
        peRatio: 18,
        roe: 22,
        beta: 0.8,
        freeCashFlow: 123_000_000,
      }),
      now
    );

    const merged = getMergedFundamentals('AAA');
    expect(merged).not.toBeNull();
    expect(merged?.peRatio).toBe(18); // FMP preferred
    expect(merged?.roe).toBe(22); // FMP preferred
    expect(merged?.beta).toBe(1.12); // yfinance preferred
    expect(merged?.freeCashFlow).toBe(987_000_000); // yfinance preferred
    expect(merged?._merge_meta?.fmp_available).toBe(true);
    expect(merged?._merge_meta?.yfinance_available).toBe(true);
    expect(merged?._merge_meta?.sources.peRatio).toBe('fmp');
    expect(merged?._merge_meta?.sources.beta).toBe('yfinance');
  });

  it('returns yfinance data when FMP data is absent', () => {
    saveFundamentals(
      'BBB',
      makeFundamentals({
        peRatio: 27,
        roe: 11,
        beta: 1.3,
      }),
      Date.now()
    );

    const merged = getMergedFundamentals('BBB');
    expect(merged).not.toBeNull();
    expect(merged?.peRatio).toBe(27);
    expect(merged?.roe).toBe(11);
    expect(merged?.beta).toBe(1.3);
    expect(merged?._merge_meta?.fmp_available).toBe(false);
    expect(merged?._merge_meta?.yfinance_available).toBe(true);
  });

  it('prefers sec_edgar_bulk over yfinance for accounting metrics', () => {
    const now = Date.now();

    saveFundamentals(
      'SEC1',
      makeFundamentals({
        _source: 'yfinance',
        roe: 9,
        debtToEquity: 1.9,
      }),
      now - 10_000
    );

    saveFundamentals(
      'SEC1',
      makeFundamentals({
        _source: 'sec_edgar_bulk',
        roe: 17,
        roa: 8.4,
        debtToEquity: 0.42,
        grossMargin: 36.5,
        currentRatio: 1.9,
        fcf: 55_000_000,
        operatingCashFlow: 88_000_000,
        revenue: 410_000_000,
        netIncome: 33_000_000,
      }),
      now
    );

    const merged = getMergedFundamentals('SEC1');
    expect(merged).not.toBeNull();
    expect(merged?.roe).toBe(17);
    expect(merged?.roa).toBe(8.4);
    expect(merged?.debtToEquity).toBe(0.42);
    expect(merged?.grossMargin).toBe(36.5);
    expect(merged?.currentRatio).toBe(1.9);
    expect(merged?.fcf).toBe(55_000_000);
    expect(merged?.freeCashFlow).toBe(55_000_000);
    expect(merged?.operatingCashFlow).toBe(88_000_000);
    expect(merged?.revenue).toBe(410_000_000);
    expect(merged?.netIncome).toBe(33_000_000);
    expect(merged?._merge_meta?.sources.roe).toBe('sec_edgar_bulk');
    expect(merged?._merge_meta?.sources.roa).toBe('sec_edgar_bulk');
    expect(merged?._merge_meta?.sources.debtToEquity).toBe('sec_edgar_bulk');
    expect(merged?._merge_meta?.sources.grossMargin).toBe('sec_edgar_bulk');
    expect(merged?._merge_meta?.sources.currentRatio).toBe('sec_edgar_bulk');
    expect(merged?._merge_meta?.sources.fcf).toBe('sec_edgar_bulk');
    expect(merged?._merge_meta?.sources.operatingCashFlow).toBe('sec_edgar_bulk');
    expect(merged?._merge_meta?.sources.revenue).toBe('sec_edgar_bulk');
    expect(merged?._merge_meta?.sources.netIncome).toBe('sec_edgar_bulk');
  });

  it('computes provider coverage statistics for mixed availability', () => {
    const now = Date.now();

    // both
    saveFundamentals(
      'AAA',
      makeFundamentals({
        _source: 'yfinance',
        peRatio: null,
        beta: 1.05,
      }),
      now - 5_000
    );
    saveFundamentals(
      'AAA',
      makeFundamentals({
        _source: 'fmp',
        peRatio: 19,
      }),
      now
    );

    // fmp only
    saveFundamentals(
      'BBB',
      makeFundamentals({
        _source: 'fmp',
        peRatio: 12,
      }),
      now
    );

    // yfinance only (default source marker omitted intentionally)
    saveFundamentals(
      'CCC',
      makeFundamentals({
        peRatio: 33,
        beta: 0.92,
      }),
      now
    );

    const stats = getProviderCoverage(['AAA', 'BBB', 'CCC', 'DDD']);
    expect(stats.total).toBe(4);
    expect(stats.both).toBe(1);
    expect(stats.fmp_only).toBe(1);
    expect(stats.yfinance_only).toBe(1);
    expect(stats.neither).toBe(1);

    expect(stats.field_coverage.peRatio.fmp).toBe(2); // AAA, BBB
    expect(stats.field_coverage.peRatio.yfinance).toBe(1); // CCC
    expect(stats.field_coverage.peRatio.merged).toBe(3); // AAA, BBB, CCC

    expect(stats.field_coverage.beta.fmp).toBe(0);
    expect(stats.field_coverage.beta.yfinance).toBe(2); // AAA, CCC
    expect(stats.field_coverage.beta.merged).toBe(2); // AAA, CCC
  });
});
