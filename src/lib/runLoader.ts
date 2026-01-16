import { getLatestRunFile, loadRunFiles } from '@/run/files';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

export interface LoadedRun {
  run: RunV1SchemaJson;
  filePath: string;
}

export function getLatestRun(): LoadedRun | null {
  const latest = getLatestRunFile();
  if (!latest) return null;
  return { run: latest.run, filePath: latest.filePath };
}

export function getRunById(runId: string): LoadedRun | null {
  const runs = loadRunFiles(50);
  const match = runs.find((r) => r.run.run_id === runId);
  if (!match) return null;
  return { run: match.run, filePath: match.filePath };
}

export function getRecentRuns(count: number = 2): LoadedRun[] {
  return loadRunFiles(count).map((entry) => ({
    run: entry.run,
    filePath: entry.filePath,
  }));
}
