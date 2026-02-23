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

  // Save to score history
  saveToScoreHistory(run);

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

/**
 * Save scores to score_history table for trend analysis
 */
function saveToScoreHistory(run: RunV1SchemaJson): void {
  const db = getDatabase();
  
  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT INTO score_history (
      symbol, run_date, universe, total_score,
      valuation_score, quality_score, technical_score, risk_score,
      rank, sector, industry
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Prepare delete statement for re-runs (delete existing entries for this run_date + universe)
  const deleteStmt = db.prepare(`
    DELETE FROM score_history WHERE run_date = ? AND universe = ?
  `);

  const runDate = run.run_date;
  const universe = run.universe?.definition?.name || 'unknown';

  // Delete any existing entries for this run (in case of re-run)
  deleteStmt.run(runDate, universe);

  // Insert all scores from this run
  const insertMany = db.transaction((scores: any[]) => {
    for (const score of scores) {
      const breakdown = score.breakdown || {};
      const raw = score.raw || {};
      const fundamentals = raw.fundamentals || {};
      
      // Map breakdown fields - note: current structure uses 'fundamental' and 'technical'
      // valuation/quality/risk may be added in future scoring engine versions
      const valuationScore = breakdown.valuation ?? breakdown.fundamental ?? null;
      const qualityScore = breakdown.quality ?? null;
      const technicalScore = breakdown.technical ?? null;
      const riskScore = breakdown.risk ?? null;
      
      insertStmt.run(
        score.symbol,
        runDate,
        universe,
        score.total_score ?? null,
        valuationScore,
        qualityScore,
        technicalScore,
        riskScore,
        null, // rank - can be calculated later if needed
        fundamentals.sector || null,
        fundamentals.industry || score.industry || null
      );
    }
  });

  insertMany(run.scores || []);
  
  logger.info(
    { runId: run.run_id, symbolCount: run.scores?.length || 0 },
    'Scores saved to history'
  );
}
