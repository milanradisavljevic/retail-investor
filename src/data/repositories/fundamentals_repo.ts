/**
 * Fundamentals repository for company financial data
 */

import { getDatabase } from '../db';
import { createChildLogger } from '@/utils/logger';

const logger = createChildLogger('fundamentals_repo');

export interface FundamentalsSnapshot {
  symbol: string;
  fetchedAt: number;
  data: FundamentalsData;
}

export interface FundamentalsData {
  _source?: string;
  _sources?: Record<string, string>;
  peRatio: number | null;
  pbRatio: number | null;
  psRatio: number | null;
  pegRatio: number | null;
  forwardPE?: number | null;
  roe: number | null;
  roa?: number | null;
  debtToEquity: number | null;
  currentRatio?: number | null;
  quickRatio?: number | null;
  profitMargin?: number | null;
  grossMargin?: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  freeCashFlow: number | null;
  fcf?: number | null;
  operatingCashFlow?: number | null;
  revenue?: number | null;
  netIncome?: number | null;
  marketCap: number | null;
  enterpriseValue: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  analystTargetMean: number | null;
  analystTargetLow: number | null;
  analystTargetHigh: number | null;
  analystCount: number | null;
  analystTargetPrice?: number | null;
  numberOfAnalysts?: number | null;
  nextEarningsDate: string | null;
  beta: number | null;
  roic?: number | null;
  evToEbitda?: number | null;
  eps?: number | null;
  bookValuePerShare?: number | null;
  revenuePerShare?: number | null;
  currentPrice?: number | null;
  secEdgar?: Record<string, unknown>;
  // Raw API response for debugging
  raw?: Record<string, unknown>;
}

const EMPTY_FUNDAMENTALS: FundamentalsData = {
  peRatio: null,
  pbRatio: null,
  psRatio: null,
  pegRatio: null,
  roe: null,
  debtToEquity: null,
  operatingMargin: null,
  netMargin: null,
  dividendYield: null,
  payoutRatio: null,
  freeCashFlow: null,
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
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeEpochMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return Date.now();
  }
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickOptionalNumber(...values: unknown[]): number | null | undefined {
  for (const value of values) {
    if (value === undefined) continue;
    if (value === null) return null;
    return toNullableNumber(value);
  }
  return undefined;
}

function parseFundamentalsData(dataJson: string): FundamentalsData {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(dataJson);
  } catch {
    return { ...EMPTY_FUNDAMENTALS };
  }

  if (!isRecord(parsed)) {
    return { ...EMPTY_FUNDAMENTALS };
  }

  const record = parsed;
  const secEdgar = isRecord(record.secEdgar) ? record.secEdgar : undefined;
  const data = { ...EMPTY_FUNDAMENTALS, ...(record as Partial<FundamentalsData>) };

  const roa = pickOptionalNumber(record.roa, secEdgar?.roa);
  if (roa !== undefined) data.roa = roa;

  const grossMargin = pickOptionalNumber(record.grossMargin, secEdgar?.grossMargin);
  if (grossMargin !== undefined) data.grossMargin = grossMargin;

  const currentRatio = pickOptionalNumber(record.currentRatio, secEdgar?.currentRatio);
  if (currentRatio !== undefined) data.currentRatio = currentRatio;

  const fcf = pickOptionalNumber(record.fcf, record.freeCashFlow);
  if (fcf !== undefined) {
    data.fcf = fcf;
    if (data.freeCashFlow === null) {
      data.freeCashFlow = fcf;
    }
  }

  const operatingCashFlow = pickOptionalNumber(
    record.operatingCashFlow,
    secEdgar?.operatingCashFlow
  );
  if (operatingCashFlow !== undefined) data.operatingCashFlow = operatingCashFlow;

  const revenue = pickOptionalNumber(record.revenue, secEdgar?.revenue);
  if (revenue !== undefined) data.revenue = revenue;

  const netIncome = pickOptionalNumber(record.netIncome, secEdgar?.netIncome);
  if (netIncome !== undefined) data.netIncome = netIncome;

  if (secEdgar) {
    data.secEdgar = secEdgar;
  }

  if (isRecord(record._sources)) {
    data._sources = Object.fromEntries(
      Object.entries(record._sources).filter(([, v]) => typeof v === 'string')
    ) as Record<string, string>;
  }

  return data;
}

export function saveFundamentals(
  symbol: string,
  data: FundamentalsData,
  fetchedAt: number = Date.now()
): void {
  const db = getDatabase();
  const normalizedFetchedAt = normalizeEpochMs(fetchedAt);
  const stmt = db.prepare(`
    INSERT INTO fundamentals_snapshot (symbol, fetched_at, data_json)
    VALUES (?, ?, ?)
  `);

  stmt.run(symbol, normalizedFetchedAt, JSON.stringify(data));
  logger.debug({ symbol }, 'Saved fundamentals snapshot');
}

export function getLatestFundamentals(symbol: string): FundamentalsSnapshot | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT symbol, fetched_at as fetchedAt, data_json
    FROM fundamentals_snapshot
    WHERE symbol = ?
    ORDER BY fetched_at DESC
    LIMIT 1
  `);

  const row = stmt.get(symbol) as
    | { symbol: string; fetchedAt: number; data_json: string }
    | undefined;

  if (!row) return null;

  return {
    symbol: row.symbol,
    fetchedAt: normalizeEpochMs(row.fetchedAt),
    data: parseFundamentalsData(row.data_json),
  };
}

export function getLatestFundamentalsBySource(
  symbol: string,
  source: string
): FundamentalsSnapshot | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT symbol, fetched_at as fetchedAt, data_json
    FROM fundamentals_snapshot
    WHERE symbol = ?
      AND json_extract(data_json, '$._source') = ?
    ORDER BY fetched_at DESC
    LIMIT 1
  `);

  const row = stmt.get(symbol, source) as
    | { symbol: string; fetchedAt: number; data_json: string }
    | undefined;

  if (!row) return null;

  return {
    symbol: row.symbol,
    fetchedAt: normalizeEpochMs(row.fetchedAt),
    data: parseFundamentalsData(row.data_json),
  };
}

export function getFundamentalsIfFresh(
  symbol: string,
  maxAgeMs: number
): FundamentalsSnapshot | null {
  const latest = getLatestFundamentals(symbol);
  if (!latest) return null;

  const age = Date.now() - latest.fetchedAt;
  if (age > maxAgeMs) {
    return null;
  }

  return latest;
}

export function getAllLatestFundamentals(): Map<string, FundamentalsSnapshot> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT symbol, fetched_at as fetchedAt, data_json
    FROM fundamentals_snapshot f1
    WHERE fetched_at = (
      SELECT MAX(fetched_at)
      FROM fundamentals_snapshot f2
      WHERE f2.symbol = f1.symbol
    )
  `);

  const rows = stmt.all() as {
    symbol: string;
    fetchedAt: number;
    data_json: string;
  }[];

  const result = new Map<string, FundamentalsSnapshot>();
  for (const row of rows) {
    result.set(row.symbol, {
      symbol: row.symbol,
      fetchedAt: normalizeEpochMs(row.fetchedAt),
      data: parseFundamentalsData(row.data_json),
    });
  }

  return result;
}

export function getUniverseMedians(symbols: string[]): Partial<FundamentalsData> {
  const all = getAllLatestFundamentals();
  const relevantData: FundamentalsData[] = [];

  for (const symbol of symbols) {
    const snapshot = all.get(symbol);
    if (snapshot) {
      relevantData.push(snapshot.data);
    }
  }

  if (relevantData.length === 0) {
    return {};
  }

  return {
    peRatio: calculateMedian(relevantData.map((d) => d.peRatio)),
    pbRatio: calculateMedian(relevantData.map((d) => d.pbRatio)),
    psRatio: calculateMedian(relevantData.map((d) => d.psRatio)),
    roe: calculateMedian(relevantData.map((d) => d.roe)),
    roa: calculateMedian(relevantData.map((d) => d.roa ?? null)),
    debtToEquity: calculateMedian(relevantData.map((d) => d.debtToEquity)),
    grossMargin: calculateMedian(relevantData.map((d) => d.grossMargin ?? null)),
  };
}

function calculateMedian(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && !isNaN(v));
  if (valid.length === 0) return null;

  valid.sort((a, b) => a - b);
  const mid = Math.floor(valid.length / 2);

  if (valid.length % 2 === 0) {
    return (valid[mid - 1] + valid[mid]) / 2;
  }

  return valid[mid];
}

export function deleteFundamentals(symbol: string): number {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM fundamentals_snapshot WHERE symbol = ?');
  const result = stmt.run(symbol);
  return result.changes;
}
