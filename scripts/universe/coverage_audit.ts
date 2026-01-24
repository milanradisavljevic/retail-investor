import fs from 'fs';
import path from 'path';
import { YFinanceProvider } from '@/providers/yfinance_provider';
import { FinnhubClient } from '@/providers/finnhub/client';
import type { Candles } from '@/providers/types';

type UniversePack = {
  name: string;
  benchmark?: string;
  symbols: string[];
  description?: string;
};

type PriceResult = { ok: boolean; count: number; error?: string };
type FundamentalResult = { ok: boolean; error?: string };

const DEFAULT_DAYS_BACK = 504; // ~2 years of trading days
const MIN_POINTS = 252;
const DEFAULT_CONCURRENCY = Number(process.env.AUDIT_CONCURRENCY || 3);
const DEFAULT_THROTTLE_MS = Number(process.env.AUDIT_THROTTLE_MS || 300);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSymbols(symbols: string[]): string[] {
  const set = new Set<string>();
  for (const raw of symbols) {
    if (typeof raw !== 'string') continue;
    const norm = raw.trim().toUpperCase();
    if (norm) set.add(norm);
  }
  return Array.from(set);
}

function listUniverseFiles(): { id: string; file: string }[] {
  const base = path.join(process.cwd(), 'config');
  const universesDir = path.join(base, 'universes');
  const files: { id: string; file: string }[] = [];

  const defaultPack = path.join(base, 'universe.json');
  if (fs.existsSync(defaultPack)) {
    files.push({ id: 'default', file: defaultPack });
  }

  if (fs.existsSync(universesDir)) {
    for (const entry of fs.readdirSync(universesDir)) {
      if (entry.endsWith('.json')) {
        files.push({
          id: entry.replace(/\.json$/, ''),
          file: path.join(universesDir, entry),
        });
      }
    }
  }
  return files;
}

function loadUniverse(file: string): UniversePack {
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return {
    name: raw.name ?? path.basename(file),
    benchmark: raw.benchmark ?? raw.default_benchmark ?? 'SPY',
    symbols: normalizeSymbols(Array.isArray(raw.symbols) ? raw.symbols : []),
    description: raw.description,
  };
}

function ensureAuditDir(): string {
  const dir = path.join(process.cwd(), 'data', 'audits');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function withThrottle<T>(fn: () => Promise<T>, throttleMs: number): Promise<T> {
  const result = await fn();
  if (throttleMs > 0) {
    await sleep(throttleMs);
  }
  return result;
}

async function checkPrice(
  yf: YFinanceProvider,
  symbol: string,
  throttleMs: number
): Promise<PriceResult> {
  const cacheDir = path.join(process.cwd(), 'data', 'audits', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const cacheFile = path.join(cacheDir, `${symbol}-candles-${DEFAULT_DAYS_BACK}.json`);

  const readCached = (): PriceResult | null => {
    try {
      const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if (raw && typeof raw.count === 'number' && typeof raw.ok === 'boolean') {
        return raw;
      }
    } catch {
      return null;
    }
    return null;
  };

  const cached = readCached();
  if (cached) return cached;

  try {
    const candles: Candles = await withThrottle(
      () => yf.getCandles(symbol, DEFAULT_DAYS_BACK),
      throttleMs
    );
    const count = Array.isArray(candles?.c) ? candles.c.length : 0;
    const ok = candles?.s === 'ok' && count >= MIN_POINTS;
    const result = { ok, count };
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = { ok: false, count: 0, error: message };
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2));
    return result;
  }
}

async function checkFundamentals(
  finnhub: FinnhubClient | null,
  symbol: string,
  throttleMs: number
): Promise<FundamentalResult> {
  if (!finnhub) return { ok: false, error: 'skipped_no_key' };
  try {
    const profile = await withThrottle(() => finnhub.fetchProfile(symbol), throttleMs);
    const ok = Boolean(profile?.ticker || profile?.name || profile?.currency);
    return { ok, error: ok ? undefined : 'missing_fields' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runUniverseAudit(
  id: string,
  file: string,
  opts: { throttleMs: number; concurrency: number }
) {
  const pack = loadUniverse(file);
  const symbols = pack.symbols;
  const benchmark = (pack.benchmark ?? 'SPY').trim().toUpperCase();

  const yf = new YFinanceProvider();
  const finnhubKey = process.env.FINNHUB_API_KEY || process.env.FINNHUB_TOKEN;
  const finnhub = finnhubKey ? new FinnhubClient(finnhubKey) : null;

  const resultsPrice: Record<string, PriceResult> = {};
  const resultsFund: Record<string, FundamentalResult> = {};
  const warnings: string[] = [];

  const queue = [...symbols];
  let active = 0;
  let index = 0;

  async function worker(symbol: string) {
    active += 1;
    try {
      resultsPrice[symbol] = await checkPrice(yf, symbol, opts.throttleMs);
      resultsFund[symbol] = await checkFundamentals(finnhub, symbol, opts.throttleMs);
    } catch (err) {
      warnings.push(`${symbol}: ${(err as Error)?.message ?? String(err)}`);
    } finally {
      active -= 1;
    }
  }

  const pending: Promise<void>[] = [];
  while (index < queue.length || active > 0) {
    while (active < opts.concurrency && index < queue.length) {
      const sym = queue[index++];
      pending.push(worker(sym));
    }
    await Promise.race([Promise.all(pending), sleep(50)]);
  }

  const benchmarkPrice = await checkPrice(yf, benchmark, opts.throttleMs);

  const priceOk = Object.values(resultsPrice).filter((r) => r.ok).length;
  const fundOk = Object.values(resultsFund).filter((r) => r.ok).length;
  const fundSkipped = !finnhub ? symbols.length : 0;

  const audit = {
    universe_id: id,
    name: pack.name,
    benchmark,
    symbol_count: symbols.length,
    price_ok: priceOk,
    price_percent: symbols.length ? Math.round((priceOk / symbols.length) * 1000) / 10 : 0,
    fundamentals_ok: fundOk,
    fundamentals_percent: finnhub
      ? symbols.length
        ? Math.round((fundOk / symbols.length) * 1000) / 10
        : 0
      : null,
    fundamentals_skipped: !finnhub,
    benchmark_ok: benchmarkPrice.ok,
    benchmark_points: benchmarkPrice.count,
    warnings,
    sampled_at: new Date().toISOString(),
  };

  const auditDir = ensureAuditDir();
  fs.writeFileSync(
    path.join(auditDir, `${id}.json`),
    JSON.stringify(audit, null, 2)
  );

  // CLI summary row
  const pricePct = audit.price_percent.toFixed(1).padStart(6);
  const fundPct = finnhub ? `${audit.fundamentals_percent?.toFixed(1) ?? '0.0'}` : 'skip';
  console.log(
    `${id.padEnd(22)} | ${String(symbols.length).padStart(6)} | ${String(priceOk).padStart(
      6
    )} | ${pricePct}% | ${finnhub ? String(fundOk).padStart(6) : 'skip  '} | ${fundPct}% | ${
      audit.benchmark_ok ? 'ok' : 'fail'
    }`
  );
}

async function main() {
  const args = process.argv.slice(2);
  const universeArg = args.find((a) => a.startsWith('--universe='));
  const all = args.includes('--all');
  const selectedId = universeArg ? universeArg.split('=')[1] : null;

  const files = listUniverseFiles();
  const targets =
    all || !selectedId
      ? files
      : files.filter((f) => f.id === selectedId || path.basename(f.file) === selectedId);

  if (targets.length === 0) {
    console.error('No universes matched. Use --all or --universe=<id>');
    process.exit(1);
  }

  console.log(
    'UniverseId              | Symbols | PriceOK | Price% | FundOK | Fund% | Benchmark'
  );

  for (const t of targets) {
    await runUniverseAudit(t.id, t.file, {
      throttleMs: DEFAULT_THROTTLE_MS,
      concurrency: DEFAULT_CONCURRENCY,
    });
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
