/**
 * Run Writer
 * Saves run records to disk and database
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getDatabase } from '@/data/db';
import { createChildLogger } from '@/utils/logger';
import { contentHash } from '@/core/seed';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

const logger = createChildLogger('run_writer');

export interface WriteResult {
  runId: string;
  filePath: string;
  contentHash: string;
}

export function writeRunRecord(run: RunV1SchemaJson): WriteResult {
  const projectRoot = process.cwd();
  const runsDir = join(projectRoot, 'data', 'runs');

  // Ensure directory exists
  if (!existsSync(runsDir)) {
    mkdirSync(runsDir, { recursive: true });
  }

  // Generate file path
  const fileName = `${run.run_id}.json`;
  const filePath = join(runsDir, fileName);

  // Calculate content hash
  const hash = contentHash(run);

  // Write to file
  const content = JSON.stringify(run, null, 2);
  writeFileSync(filePath, content, 'utf-8');

  logger.info({ runId: run.run_id, filePath }, 'Run record written');

  // Save to index
  saveToIndex(run, filePath, hash);

  return {
    runId: run.run_id,
    filePath,
    contentHash: hash,
  };
}

function saveToIndex(run: RunV1SchemaJson, filePath: string, hash: string): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO run_index (run_id, timestamp, file_path, content_hash, symbol_count, top5, pick_of_day)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id) DO UPDATE SET
      timestamp = excluded.timestamp,
      file_path = excluded.file_path,
      content_hash = excluded.content_hash,
      symbol_count = excluded.symbol_count,
      top5 = excluded.top5,
      pick_of_day = excluded.pick_of_day
  `);

  stmt.run(
    run.run_id,
    new Date().toISOString(),
    filePath,
    hash,
    run.scores.length,
    run.selections.top5.join(','),
    run.selections.pick_of_the_day
  );

  logger.debug({ runId: run.run_id }, 'Run indexed in database');
}

export function getLatestRun(): { runId: string; filePath: string; timestamp: string } | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT run_id as runId, file_path as filePath, timestamp
    FROM run_index
    ORDER BY timestamp DESC
    LIMIT 1
  `);

  const row = stmt.get() as
    | { runId: string; filePath: string; timestamp: string }
    | undefined;

  return row ?? null;
}

export function getRunHistory(
  limit: number = 10
): Array<{ runId: string; timestamp: string; pickOfDay: string }> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT run_id as runId, timestamp, pick_of_day as pickOfDay
    FROM run_index
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  return stmt.all(limit) as Array<{
    runId: string;
    timestamp: string;
    pickOfDay: string;
  }>;
}
