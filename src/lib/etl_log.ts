import fs from 'fs';
import path from 'path';

export type EtlProvider = 'sec' | 'fmp' | 'yfinance' | 'daily_run';
export type EtlStatus = 'success' | 'failed' | 'running';

export interface EtlRun {
  id: string;
  provider: EtlProvider;
  status: EtlStatus;
  started_at: string;
  finished_at: string | null;
  duration_sec: number | null;
  symbol_count: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
}

export interface EtlLogStore {
  version: string;
  runs: EtlRun[];
}

const LOG_FILE = path.join(process.cwd(), 'data/logs/etl_runs.json');
const MAX_RUNS = 100;

function loadStore(): EtlLogStore {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return { version: '1.0.0', runs: [] };
    }
    const raw = fs.readFileSync(LOG_FILE, 'utf-8');
    return JSON.parse(raw) as EtlLogStore;
  } catch {
    return { version: '1.0.0', runs: [] };
  }
}

function saveStore(store: EtlLogStore): void {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(LOG_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

export function startEtlRun(
  provider: EtlProvider,
  metadata: Record<string, unknown> = {}
): string {
  const store = loadStore();
  const id = `${provider}_${Date.now()}`;
  const run: EtlRun = {
    id,
    provider,
    status: 'running',
    started_at: new Date().toISOString(),
    finished_at: null,
    duration_sec: null,
    symbol_count: null,
    error_message: null,
    metadata,
  };
  store.runs.unshift(run);
  store.runs = store.runs.slice(0, MAX_RUNS);
  saveStore(store);
  return id;
}

export function finishEtlRun(
  id: string,
  status: 'success' | 'failed',
  symbolCount: number | null = null,
  errorMessage: string | null = null,
  metadata: Record<string, unknown> = {}
): void {
  const store = loadStore();
  const run = store.runs.find((r) => r.id === id);
  if (!run) return;

  run.status = status;
  run.finished_at = new Date().toISOString();
  run.duration_sec = Math.round(
    (new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000
  );
  run.symbol_count = symbolCount;
  run.error_message = errorMessage;
  run.metadata = { ...run.metadata, ...metadata };
  saveStore(store);
}

export function getRecentEtlRuns(limit: number = 20): EtlRun[] {
  const store = loadStore();
  return store.runs.slice(0, limit);
}

export function getEtlRunsByProvider(provider: EtlProvider, limit: number = 10): EtlRun[] {
  const store = loadStore();
  return store.runs.filter((r) => r.provider === provider).slice(0, limit);
}

export function getLastSuccessfulRun(provider: EtlProvider): EtlRun | null {
  const store = loadStore();
  return store.runs.find((r) => r.provider === provider && r.status === 'success') || null;
}
