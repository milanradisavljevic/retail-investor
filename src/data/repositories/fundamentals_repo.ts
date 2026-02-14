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
  peRatio: number | null;
  pbRatio: number | null;
  psRatio: number | null;
  pegRatio: number | null;
  forwardPE?: number | null;
  roe: number | null;
  roa: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio?: number | null;
  profitMargin?: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  freeCashFlow: number | null;
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
  // Raw API response for debugging
  raw?: Record<string, unknown>;
}

export function saveFundamentals(
  symbol: string,
  data: FundamentalsData,
  fetchedAt: number = Date.now()
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO fundamentals_snapshot (symbol, fetched_at, data_json)
    VALUES (?, ?, ?)
  `);

  stmt.run(symbol, fetchedAt, JSON.stringify(data));
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
    fetchedAt: row.fetchedAt,
    data: JSON.parse(row.data_json) as FundamentalsData,
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
    fetchedAt: row.fetchedAt,
    data: JSON.parse(row.data_json) as FundamentalsData,
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
      fetchedAt: row.fetchedAt,
      data: JSON.parse(row.data_json) as FundamentalsData,
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
    debtToEquity: calculateMedian(relevantData.map((d) => d.debtToEquity)),
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
