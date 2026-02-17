import { basename } from 'path';
import { getLatestRunFile, loadRunFiles } from '@/run/files';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

export interface LoadedRun {
  run: RunV1SchemaJson;
  filePath: string;
}

export interface RunMeta {
  runId: string;
  runDate: string;
  asOfDate: string;
  universe: string;
  preset: string;
  provider: string;
  symbolCount: number;
  filePath: string;
  fileName: string;
  mtimeMs: number;
  configKey: string;
}

const MAX_RUN_SCAN = 500;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function extractPresetLabel(run: RunV1SchemaJson): string {
  const raw = asRecord(run);
  const preset = typeof raw.preset === 'string' ? raw.preset : null;
  const strategy = typeof raw.strategy === 'string' ? raw.strategy : null;
  const fromEnv = typeof process.env.PRESET === 'string' ? process.env.PRESET : null;
  const value = preset ?? strategy ?? fromEnv ?? 'Live Run';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getRunTimestamp(run: RunV1SchemaJson): number {
  const parsed = Date.parse(run.run_date ?? run.as_of_date ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toLoadedRun(entry: { run: RunV1SchemaJson; filePath: string }): LoadedRun {
  return { run: entry.run, filePath: entry.filePath };
}

function toRunMeta(entry: { run: RunV1SchemaJson; filePath: string; mtimeMs: number }): RunMeta {
  const preset = extractPresetLabel(entry.run);
  const universe = entry.run.universe?.definition?.name ?? 'Unknown Universe';
  return {
    runId: entry.run.run_id,
    runDate: entry.run.run_date,
    asOfDate: entry.run.as_of_date,
    universe,
    preset,
    provider: entry.run.provider?.name ?? 'unknown',
    symbolCount: entry.run.scores.length,
    filePath: entry.filePath,
    fileName: basename(entry.filePath),
    mtimeMs: entry.mtimeMs,
    configKey: `${universe}__${preset}`,
  };
}

export function getLatestRun(): LoadedRun | null {
  const latest = getLatestRunFile();
  if (!latest) return null;
  return { run: latest.run, filePath: latest.filePath };
}

export function getAvailableRuns(limit: number = 100): RunMeta[] {
  const scanLimit = Math.max(limit, MAX_RUN_SCAN);
  return loadRunFiles(scanLimit)
    .map((entry) => toRunMeta(entry))
    .slice(0, limit);
}

export function loadRun(runId: string): LoadedRun | null {
  return getRunById(runId);
}

export function getRunById(runId: string): LoadedRun | null {
  const runs = loadRunFiles(MAX_RUN_SCAN);
  const match = runs.find((r) => r.run.run_id === runId);
  if (!match) return null;
  return toLoadedRun(match);
}

export function getRecentRuns(count: number = 2): LoadedRun[] {
  return loadRunFiles(count).map((entry) => toLoadedRun(entry));
}

export function getRunPair(currentRunId?: string): {
  current: LoadedRun | null;
  previous: LoadedRun | null;
} {
  const all = loadRunFiles(MAX_RUN_SCAN);
  if (all.length === 0) {
    return { current: null, previous: null };
  }

  const currentIndex = currentRunId
    ? all.findIndex((entry) => entry.run.run_id === currentRunId)
    : 0;

  const effectiveIndex = currentIndex >= 0 ? currentIndex : 0;
  const currentEntry = all[effectiveIndex];
  if (!currentEntry) {
    return { current: null, previous: null };
  }

  const currentMeta = toRunMeta(currentEntry);
  const previousEntry =
    all
      .slice(effectiveIndex + 1)
      .find((entry) => toRunMeta(entry).configKey === currentMeta.configKey) ?? null;

  return {
    current: toLoadedRun(currentEntry),
    previous: previousEntry ? toLoadedRun(previousEntry) : null,
  };
}

export function getRunHistory(days: number, universe: string, preset: string): LoadedRun[] {
  const now = Date.now();
  const startTs = now - days * 24 * 60 * 60 * 1000;

  return loadRunFiles(MAX_RUN_SCAN)
    .filter((entry) => {
      const meta = toRunMeta(entry);
      if (meta.universe !== universe || meta.preset !== preset) {
        return false;
      }
      const ts = getRunTimestamp(entry.run);
      return ts >= startTs;
    })
    .sort((a, b) => getRunTimestamp(a.run) - getRunTimestamp(b.run))
    .map((entry) => toLoadedRun(entry));
}
