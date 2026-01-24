/**
 * Fetches free index membership from Wikipedia, maps to Yahoo tickers,
 * validates via yfinance candles, and writes snapshots for universes.
 *
 * Usage:
 *   npm run tsx -- scripts/universe/fetch_wikipedia_membership.ts --universe=dax
 *   npm run tsx -- scripts/universe/fetch_wikipedia_membership.ts --all
 *
 * Notes:
 * - No paid APIs. Only Wikipedia + yfinance candles.
 * - Mapping heuristics per index (suffixes) and best-candle coverage wins.
 * - Writes snapshot to data/universes/snapshots/<id>/<YYYY-MM-DD>.json
 */

import fs from 'fs';
import path from 'path';
import { YFinanceProvider } from '@/providers/yfinance_provider';
import type { Candles } from '@/providers/types';

type TargetUniverse = {
  id: string;
  wiki: string;
  suffixes: string[];
};

const TARGETS: TargetUniverse[] = [
  { id: 'cac40', wiki: 'https://en.wikipedia.org/wiki/CAC_40', suffixes: ['.PA'] },
  { id: 'dax', wiki: 'https://en.wikipedia.org/wiki/DAX', suffixes: ['.DE'] },
  { id: 'eurostoxx50', wiki: 'https://en.wikipedia.org/wiki/EURO_STOXX_50', suffixes: ['.PA', '.DE', '.AS', '.MI', '.MC', '.BR'] },
  { id: 'ftse100', wiki: 'https://en.wikipedia.org/wiki/FTSE_100_Index', suffixes: ['.L'] },
  { id: 'sensex', wiki: 'https://en.wikipedia.org/wiki/BSE_SENSEX', suffixes: ['.NS', '.BO'] },
  { id: 'nikkei225', wiki: 'https://en.wikipedia.org/wiki/Nikkei_225', suffixes: ['.T'] },
];

const DAYS_BACK = 504; // ~2y trading days
const MIN_POINTS = 60; // more lenient for thin coverage
const MAX_CONCURRENCY = Number(process.env.FETCH_CONCURRENCY || 4);
const THROTTLE_MS = Number(process.env.FETCH_THROTTLE_MS || 50);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&eacute;/g, 'é')
    .trim();
}

function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractBestTable(html: string): string[][] {
  const tables = Array.from(
    html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)
  );

  let best: { rows: string[][]; score: number } = { rows: [], score: 0 };

  for (const match of tables) {
    const tableHtml = match[1];
    const rows = Array.from(tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((row) => {
      const cells = Array.from(row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((c) =>
        stripTags(c[1])
      );
      return cells;
    });

    if (rows.length <= 1) continue;
    const header = rows[0].map((h) => h.toLowerCase());
    const headerMatch = header.some((h) =>
      ['company', 'constituent', 'ticker', 'symbol', 'ric'].some((k) => h.includes(k))
    );
    const score = (headerMatch ? 100 : 0) + rows.length;
    if (score > best.score) {
      best = { rows, score };
    }
  }

  return best.rows;
}

function pickSymbolColumn(rows: string[][]): { index: number; headerRow: number } {
  if (rows.length === 0) return { index: 0, headerRow: 0 };
  const candidates = ['ticker', 'symbol', 'code', 'ric', 'isin'];
  for (let r = 0; r < Math.min(rows.length, 3); r++) {
    const header = rows[r].map((h) => h.toLowerCase());
    for (const cand of candidates) {
      const idx = header.findIndex((h) => h.includes(cand));
      if (idx !== -1) return { index: idx, headerRow: r };
    }
  }
  // fallback to first row / first column
  return { index: 0, headerRow: 0 };
}

function normalizeRawSymbol(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, '').replace(/\u200e/g, '').replace(/\u00a0/g, '');
  if (!cleaned) return null;
  // remove trailing dots on some wiki codes
  return cleaned.replace(/\.+$/, '');
}

async function bestYahooSymbol(
  yf: YFinanceProvider,
  base: string,
  suffixes: string[]
): Promise<{ ticker: string | null; count: number; warning?: string }> {
  const hasSuffix = base.includes('.');
  const candidates = hasSuffix
    ? [base]
    : suffixes.length > 0
      ? suffixes.map((s) => `${base}${s}`)
      : [base];
  let best: { ticker: string | null; count: number; warning?: string } = {
    ticker: null,
    count: 0,
    warning: 'no_candidates',
  };

  for (const candidate of candidates) {
    try {
      const candles: Candles = await yf.getCandles(candidate, DAYS_BACK);
      const count = Array.isArray(candles?.c) ? candles.c.length : 0;
      if (candles?.s === 'ok' && count >= best.count) {
        best = {
          ticker: candidate,
          count,
          warning: count >= MIN_POINTS ? undefined : `thin_coverage_${count}`,
        };
      }
      if (THROTTLE_MS > 0) await sleep(THROTTLE_MS);
    } catch (err) {
      best.warning = err instanceof Error ? err.message : String(err);
    }
  }

  return best;
}

async function fetchUniverse(target: TargetUniverse) {
  console.log(`\n[${target.id}] Fetching Wikipedia membership from ${target.wiki}`);
  const res = await fetch(target.wiki);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${target.wiki}: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const rows = extractBestTable(html);
  if (rows.length <= 1) {
    throw new Error('No wikitable with rows found');
  }

  const symbolMeta = pickSymbolColumn(rows);
  const symbolCol = symbolMeta.index;
  const yf = new YFinanceProvider();
  const warnings: string[] = [];
  const symbols: string[] = [];
  const coverageHints: string[] = [];

  // skip header rows up to symbolMeta.headerRow
  const workQueue = rows.slice(symbolMeta.headerRow + 1);
  let idx = 0;
  let active = 0;
  const promises: Promise<void>[] = [];

  async function worker(entry: string[]) {
    active += 1;
    try {
      const raw = normalizeRawSymbol(entry[symbolCol]);
      if (!raw) return;
      const base = raw;
      const best = await bestYahooSymbol(yf, base, target.suffixes);
      if (best.ticker) {
        symbols.push(best.ticker);
        if (best.warning) coverageHints.push(`${best.ticker}:${best.warning}`);
      } else {
        warnings.push(`Unmapped: ${raw} (${best.warning ?? 'no coverage'})`);
      }
    } catch (err) {
      warnings.push(`Error mapping ${entry[symbolCol]}: ${(err as Error)?.message ?? String(err)}`);
    } finally {
      active -= 1;
    }
  }

  while (idx < workQueue.length || active > 0) {
    while (active < MAX_CONCURRENCY && idx < workQueue.length) {
      const row = workQueue[idx++];
      const p = worker(row);
      promises.push(p);
    }
    await Promise.race([Promise.allSettled(promises), sleep(50)]);
  }

  // dedupe
  const unique = Array.from(new Set(symbols)).sort();

  const snapshot = {
    schema_version: 1,
    universe_id: target.id,
    as_of: new Date().toISOString().slice(0, 10),
    source_ref: target.wiki,
    symbols: unique,
    warnings: [...warnings, ...coverageHints],
  };

  const dir = path.join(process.cwd(), 'data', 'universes', 'snapshots', target.id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${snapshot.as_of}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));

  console.log(
    `[${target.id}] Done. Symbols: ${unique.length} (warnings: ${warnings.length}) -> ${file}`
  );

  return { file, snapshot };
}

function parseArgs(): { ids: string[] } {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const universeArg = args.find((a) => a.startsWith('--universe='));
  const id = universeArg ? universeArg.split('=')[1] : null;
  if (all || !id) {
    return { ids: TARGETS.map((t) => t.id) };
  }
  return { ids: [id] };
}

async function main() {
  const { ids } = parseArgs();
  for (const id of ids) {
    const target = TARGETS.find((t) => t.id === id);
    if (!target) {
      console.warn(`Unknown universe id: ${id} (skipping)`);
      continue;
    }
    try {
      await fetchUniverse(target);
    } catch (err) {
      console.error(`[${id}] failed: ${(err as Error)?.message ?? String(err)}`);
    }
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
