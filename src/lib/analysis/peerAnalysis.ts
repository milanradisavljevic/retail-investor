import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getCompanyName } from '@/core/company';
import { getCompanyProfileIfFresh, type CompanyProfileSnapshot } from '@/data/repositories/profile_repo';
import {
  getFundamentalsIfFresh,
  getLatestFundamentals,
  type FundamentalsData,
} from '@/data/repositories/fundamentals_repo';
import { getLatestRunFile } from '@/run/files';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

export interface PeerMetrics {
  symbol: string;
  companyName: string;
  totalScore: number;
  metrics: {
    pe: number | null;
    marketCap: number | null;
    roe: number | null;
    oneYearReturn: number | null;
    riskScore: number;
  };
  ranking: {
    score: number;
    pe: number;
    roe: number;
    return: number;
    risk: number;
  };
}

export interface PeerComparisonData {
  targetSymbol: string;
  targetMetrics: PeerMetrics;
  peers: PeerMetrics[];
  sector: string;
  averages: {
    score: number;
    pe: number;
    roe: number;
    return: number;
  };
}

type ScoreEntry = RunV1SchemaJson['scores'][number];

const FUNDAMENTALS_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 90; // 90 days
const PROFILE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180; // 6 months
const ONE_YEAR_TRADING_DAYS = 252;
const HISTORICAL_DIR = path.join(process.cwd(), 'data', 'backtesting', 'historical');

interface DataCaches {
  fundamentals: Map<string, FundamentalsData | null>;
  profiles: Map<string, CompanyProfileSnapshot | null>;
  sectors: Map<string, string | null>;
  marketCaps: Map<string, number | null>;
  returns: Map<string, number | null>;
}

/**
 * Find peer companies based on sector and market cap similarity
 */
export async function findPeers(symbol: string, maxPeers: number = 5): Promise<PeerComparisonData> {
  const latestRun = getLatestRunFile();
  if (!latestRun) {
    throw new Error('No run data available');
  }

  const run = latestRun.run;
  const targetStock = run.scores.find((s) => s.symbol === symbol);
  if (!targetStock) {
    throw new Error(`Symbol ${symbol} not found in latest run`);
  }

  const caches: DataCaches = {
    fundamentals: new Map(),
    profiles: new Map(),
    sectors: new Map(),
    marketCaps: new Map(),
    returns: new Map(),
  };

  const sector = resolveSector(targetStock, caches) ?? 'Unknown Sector';

  const candidates = selectPeerCandidates(run, targetStock, sector, caches);
  const targetMarketCap = getMarketCap(targetStock.symbol, caches);

  const peersWithCaps = await Promise.all(
    candidates.map(async (stock) => ({
      stock,
      marketCap: getMarketCap(stock.symbol, caches),
    }))
  );

  const filteredByCap =
    targetMarketCap === null
      ? peersWithCaps
      : peersWithCaps.filter((entry) => {
          if (entry.marketCap === null) return true; // skip filtering when data missing
          const ratio = entry.marketCap / targetMarketCap;
          return ratio >= 0.5 && ratio <= 2.0;
        });

  const chosenPeers =
    filteredByCap.length > 0 ? filteredByCap.map((p) => p.stock) : peersWithCaps.map((p) => p.stock);

  const topPeers = chosenPeers.sort((a, b) => b.total_score - a.total_score).slice(0, maxPeers);

  const allStocks: ScoreEntry[] = [targetStock, ...topPeers];

  const peerMetrics: PeerMetrics[] = await Promise.all(allStocks.map((stock) => buildPeerMetrics(stock, caches)));

  const withRankings = calculateRankings(peerMetrics);
  const targetMetrics = withRankings.find((p) => p.symbol === symbol);

  if (!targetMetrics) {
    throw new Error(`Unable to build peer metrics for ${symbol}`);
  }

  const peers = withRankings.filter((p) => p.symbol !== symbol);
  const averages = {
    score: mean(withRankings.map((p) => p.totalScore)),
    pe: mean(withRankings.map((p) => p.metrics.pe).filter(isNumber)),
    roe: mean(withRankings.map((p) => p.metrics.roe).filter(isNumber)),
    return: mean(withRankings.map((p) => p.metrics.oneYearReturn).filter(isNumber)),
  };

  return {
    targetSymbol: symbol,
    targetMetrics,
    peers,
    sector,
    averages,
  };
}

/**
 * Build metrics object for a stock
 */
async function buildPeerMetrics(stock: ScoreEntry, caches: DataCaches): Promise<PeerMetrics> {
  const fundamentals = getFundamentals(stock.symbol, caches);
  const pe = extractPE(stock, fundamentals);
  const roe = extractROE(stock, fundamentals);
  const oneYearReturn = await getOneYearReturn(stock.symbol, caches);

  return {
    symbol: stock.symbol,
    companyName: stock.company_name ?? getCompanyName(stock.symbol),
    totalScore: stock.total_score,
    metrics: {
      pe,
      marketCap: getMarketCap(stock.symbol, caches),
      roe,
      oneYearReturn,
      riskScore: stock.evidence?.risk ?? 0,
    },
    ranking: {
      score: 0,
      pe: 0,
      roe: 0,
      return: 0,
      risk: 0,
    },
  };
}

/**
 * Calculate rankings (1-N, where 1 is best)
 */
function calculateRankings(peers: PeerMetrics[]): PeerMetrics[] {
  const sortedByScore = [...peers].sort((a, b) => b.totalScore - a.totalScore);
  const sortedByPE = [...peers]
    .filter((p) => p.metrics.pe !== null)
    .sort((a, b) => (a.metrics.pe ?? 0) - (b.metrics.pe ?? 0));
  const sortedByROE = [...peers]
    .filter((p) => p.metrics.roe !== null)
    .sort((a, b) => (b.metrics.roe ?? 0) - (a.metrics.roe ?? 0));
  const sortedByReturn = [...peers]
    .filter((p) => p.metrics.oneYearReturn !== null)
    .sort((a, b) => (b.metrics.oneYearReturn ?? 0) - (a.metrics.oneYearReturn ?? 0));
  const sortedByRisk = [...peers].sort((a, b) => (b.metrics.riskScore ?? 0) - (a.metrics.riskScore ?? 0));

  return peers.map((peer) => ({
    ...peer,
    ranking: {
      score: sortedByScore.findIndex((p) => p.symbol === peer.symbol) + 1,
      pe: (sortedByPE.findIndex((p) => p.symbol === peer.symbol) + 1) || 0,
      roe: (sortedByROE.findIndex((p) => p.symbol === peer.symbol) + 1) || 0,
      return: (sortedByReturn.findIndex((p) => p.symbol === peer.symbol) + 1) || 0,
      risk: sortedByRisk.findIndex((p) => p.symbol === peer.symbol) + 1,
    },
  }));
}

function selectPeerCandidates(
  run: RunV1SchemaJson,
  targetStock: ScoreEntry,
  sector: string,
  caches: DataCaches
): ScoreEntry[] {
  const sectorKey = normalizeSector(sector);
  const sectorMatches = run.scores.filter((s) => {
    if (s.symbol === targetStock.symbol) return false;
    const peerSector = resolveSector(s, caches);
    return sectorKey && normalizeSector(peerSector) === sectorKey;
  });

  if (sectorMatches.length > 0) {
    return sectorMatches;
  }

  // Fallback: similar total score window
  const similarByScore = run.scores.filter((s) => {
    if (s.symbol === targetStock.symbol) return false;
    return Math.abs(s.total_score - targetStock.total_score) <= 20;
  });

  if (similarByScore.length > 0) {
    return similarByScore;
  }

  // Ultimate fallback: all others
  return run.scores.filter((s) => s.symbol !== targetStock.symbol);
}

function resolveSector(stock: ScoreEntry, caches: DataCaches): string | null {
  const cached = caches.sectors.get(stock.symbol);
  if (cached !== undefined) {
    return cached;
  }

  const fromRun =
    stock.price_target_diagnostics?.inputs?.sector ??
    stock.price_target_diagnostics?.inputs?.industry ??
    stock.industry ??
    null;

  if (fromRun) {
    caches.sectors.set(stock.symbol, fromRun);
    return fromRun;
  }

  const profile = getProfile(stock.symbol, caches);
  const sector = profile?.profile.sector ?? profile?.profile.industry ?? null;
  caches.sectors.set(stock.symbol, sector);
  return sector;
}

function getMarketCap(symbol: string, caches: DataCaches): number | null {
  if (caches.marketCaps.has(symbol)) {
    return caches.marketCaps.get(symbol) ?? null;
  }

  const fundamentals = getFundamentals(symbol, caches);
  const profile = getProfile(symbol, caches);

  const marketCap =
    fundamentals?.marketCap ??
    (profile?.profile as any)?.marketCap ??
    (profile?.profile as any)?.marketCapitalization ??
    null;

  caches.marketCaps.set(symbol, marketCap ?? null);
  return marketCap ?? null;
}

function getFundamentals(symbol: string, caches: DataCaches): FundamentalsData | null {
  if (caches.fundamentals.has(symbol)) {
    return caches.fundamentals.get(symbol) ?? null;
  }

  const snapshot =
    getFundamentalsIfFresh(symbol, FUNDAMENTALS_MAX_AGE_MS) ?? getLatestFundamentals(symbol);

  const data = snapshot?.data ?? null;
  caches.fundamentals.set(symbol, data);
  return data;
}

function getProfile(symbol: string, caches: DataCaches): CompanyProfileSnapshot | null {
  if (caches.profiles.has(symbol)) {
    return caches.profiles.get(symbol) ?? null;
  }

  const profile = getCompanyProfileIfFresh(symbol, PROFILE_MAX_AGE_MS);
  caches.profiles.set(symbol, profile);
  return profile;
}

function extractPE(stock: ScoreEntry, fundamentals: FundamentalsData | null): number | null {
  const peSource = fundamentals?.peRatio;
  if (peSource !== null && peSource !== undefined && !Number.isNaN(peSource)) {
    return peSource;
  }
  const pe = stock.data_quality?.metrics?.peRatio?.value;
  return typeof pe === 'number' && !Number.isNaN(pe) ? pe : null;
}

function extractROE(stock: ScoreEntry, fundamentals: FundamentalsData | null): number | null {
  const roeSource = fundamentals?.roe;
  if (roeSource !== null && roeSource !== undefined && !Number.isNaN(roeSource)) {
    return roeSource;
  }
  const roe = stock.data_quality?.metrics?.roe?.value;
  return typeof roe === 'number' && !Number.isNaN(roe) ? roe : null;
}

async function getOneYearReturn(symbol: string, caches: DataCaches): Promise<number | null> {
  if (caches.returns.has(symbol)) {
    return caches.returns.get(symbol) ?? null;
  }

  const filePath = path.join(HISTORICAL_DIR, `${symbol}.csv`);
  if (!existsSync(filePath)) {
    caches.returns.set(symbol, null);
    return null;
  }

  try {
    const csv = await fs.readFile(filePath, 'utf-8');
    const rows = parseHistoricalCSV(csv);
    if (rows.length < 2) {
      caches.returns.set(symbol, null);
      return null;
    }

    const startIndex = Math.max(0, rows.length - ONE_YEAR_TRADING_DAYS);
    const start = rows[startIndex];
    const end = rows[rows.length - 1];

    if (!start || !end || start.close === 0) {
      caches.returns.set(symbol, null);
      return null;
    }

    const pct = ((end.close - start.close) / start.close) * 100;
    const value = Number(pct.toFixed(2));
    caches.returns.set(symbol, value);
    return value;
  } catch {
    caches.returns.set(symbol, null);
    return null;
  }
}

function parseHistoricalCSV(csv: string): { date: string; close: number }[] {
  const lines = csv.trim().split('\n');
  if (lines.length === 0) return [];

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const dateIdx = header.indexOf('date');
  const closeIdx = header.indexOf('close');
  if (dateIdx === -1 || closeIdx === -1) return [];

  const rows = lines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(','))
    .map((cols) => ({
      date: cols[dateIdx],
      close: Number.parseFloat(cols[closeIdx]),
    }))
    .filter((row) => !Number.isNaN(row.close));

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  const valid = values.filter((v) => !Number.isNaN(v));
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function normalizeSector(sector: string | null | undefined): string | null {
  if (!sector) return null;
  return sector.trim().toLowerCase();
}

function isNumber(value: number | null): value is number {
  return value !== null && !Number.isNaN(value);
}
