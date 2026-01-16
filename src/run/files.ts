import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

export interface RunFileInfo {
  filePath: string;
  run: RunV1SchemaJson;
  mtimeMs: number;
}

function getRunDirectory(): string {
  return join(process.cwd(), 'data', 'runs');
}

export function loadRunFiles(limit: number = 20): RunFileInfo[] {
  const runsDir = getRunDirectory();

  if (!existsSync(runsDir)) {
    return [];
  }

  const files = readdirSync(runsDir)
    .filter((f) => f.endsWith('.json') && !f.includes('_llm'));

  const parsed: RunFileInfo[] = [];

  for (const file of files) {
    const filePath = join(runsDir, file);
    try {
      const run = JSON.parse(readFileSync(filePath, 'utf-8')) as RunV1SchemaJson;
      const stats = statSync(filePath);
      parsed.push({
        filePath,
        run,
        mtimeMs: stats.mtimeMs,
      });
    } catch {
      // Skip invalid files quietly
    }
  }

  return parsed
    .sort((a, b) => {
      if (b.mtimeMs !== a.mtimeMs) {
        return b.mtimeMs - a.mtimeMs;
      }

      const aDate = Date.parse(a.run.run_date ?? a.run.as_of_date ?? '');
      const bDate = Date.parse(b.run.run_date ?? b.run.as_of_date ?? '');

      if (!Number.isNaN(aDate) && !Number.isNaN(bDate) && bDate !== aDate) {
        return bDate - aDate;
      }

      return b.filePath.localeCompare(a.filePath);
    })
    .slice(0, limit);
}

export function getLatestRunFile(): RunFileInfo | null {
  const [latest] = loadRunFiles(1);
  return latest ?? null;
}
