import { promises as fs } from 'fs';
import path from 'path';
import { getLatestRun } from '@/lib/runLoader';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';
import type { WatchlistEntry } from './types';

type StoredEntry = {
  symbol: string;
  companyName: string;
  addedAt: string;
};

const WATCHLIST_PATH = path.join(process.cwd(), 'data', 'watchlist.json');

async function readWatchlistFile(): Promise<StoredEntry[]> {
  try {
    const raw = await fs.readFile(WATCHLIST_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.symbol === 'string')
      .map((item) => ({
        symbol: String(item.symbol).toUpperCase(),
        companyName: String(item.companyName ?? item.symbol ?? '').trim() || String(item.symbol).toUpperCase(),
        addedAt: item.addedAt ?? new Date().toISOString(),
      }));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error('[watchlist] Failed to read file:', error);
    return [];
  }
}

async function writeWatchlistFile(entries: StoredEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(WATCHLIST_PATH), { recursive: true });
  await fs.writeFile(WATCHLIST_PATH, JSON.stringify(entries, null, 2), 'utf-8');
}

export async function getStoredWatchlist(): Promise<StoredEntry[]> {
  return readWatchlistFile();
}

export async function addStoredEntry(entry: { symbol: string; companyName: string }): Promise<StoredEntry> {
  const symbol = entry.symbol.toUpperCase();
  const companyName = entry.companyName?.trim() || symbol;
  const list = await readWatchlistFile();
  const existing = list.find((item) => item.symbol === symbol);
  if (!existing) {
    const record = { symbol, companyName, addedAt: new Date().toISOString() };
    list.push(record);
    await writeWatchlistFile(list);
    return record;
  }
  return existing;
}

export async function removeStoredEntry(symbol: string): Promise<void> {
  const list = await readWatchlistFile();
  const next = list.filter((item) => item.symbol !== symbol.toUpperCase());
  await writeWatchlistFile(next);
}

export async function clearStoredEntries(): Promise<void> {
  await writeWatchlistFile([]);
}

function buildScoreLookup(run: RunV1SchemaJson | null): Record<string, RunV1SchemaJson['scores'][number]> {
  if (!run) return {};
  const map: Record<string, RunV1SchemaJson['scores'][number]> = {};
  for (const score of run.scores) {
    map[score.symbol.toUpperCase()] = score;
  }
  return map;
}

export async function getWatchlistWithScores(): Promise<WatchlistEntry[]> {
  const entries = await readWatchlistFile();
  const latest = getLatestRun();
  const scoreMap = buildScoreLookup(latest?.run ?? null);

  return entries.map((entry) => {
    const score = scoreMap[entry.symbol];
    return {
      ...entry,
      companyName: entry.companyName || score?.company_name || entry.symbol,
      lastScore: score?.total_score ?? null,
      lastPrice: score?.price_target?.current_price ?? null,
    };
  });
}
