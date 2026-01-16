/**
 * Human-in-the-Loop Trigger
 * Determines when to request documents from user
 */

import { getDatabase } from '@/data/db';
import { createChildLogger } from '@/utils/logger';
import type { SymbolScore } from '@/scoring/engine';

const logger = createChildLogger('human_loop_trigger');

const EVIDENCE_THRESHOLD = 40;
const MAX_PENDING_REQUESTS = 2;

export interface DocumentRequest {
  symbol: string;
  reason: string;
  lowPillars: string[];
  priority: 'high' | 'medium';
}

export function shouldRequestDocuments(
  score: SymbolScore,
  rank: number
): DocumentRequest | null {
  // Only consider top 10
  if (rank > 10) {
    return null;
  }

  // Check if any pillar is below threshold
  const lowPillars: string[] = [];
  const { valuation, quality, technical, risk } = score.evidence;

  if (valuation < EVIDENCE_THRESHOLD) lowPillars.push('valuation');
  if (quality < EVIDENCE_THRESHOLD) lowPillars.push('quality');
  if (technical < EVIDENCE_THRESHOLD) lowPillars.push('technical');
  if (risk < EVIDENCE_THRESHOLD) lowPillars.push('risk');

  // Also check for significant missing data
  const hasMissingData = (score.dataQuality.missingFields?.length ?? 0) > 3;

  if (lowPillars.length === 0 && !hasMissingData) {
    return null;
  }

  const reason = buildReason(score, lowPillars, hasMissingData);
  const priority = rank <= 5 ? 'high' : 'medium';

  return {
    symbol: score.symbol,
    reason,
    lowPillars,
    priority,
  };
}

function buildReason(
  score: SymbolScore,
  lowPillars: string[],
  hasMissingData: boolean
): string {
  const parts: string[] = [];

  if (lowPillars.length > 0) {
    parts.push(`Low evidence in: ${lowPillars.join(', ')}`);
  }

  if (hasMissingData && score.dataQuality.missingFields) {
    parts.push(`Missing data: ${score.dataQuality.missingFields.slice(0, 3).join(', ')}`);
  }

  return parts.join('. ');
}

export function getPendingRequestCount(): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM document_requests
    WHERE status = 'pending'
  `);

  const result = stmt.get() as { count: number };
  return result.count;
}

export function canCreateNewRequest(): boolean {
  return getPendingRequestCount() < MAX_PENDING_REQUESTS;
}

export function createDocumentRequest(request: DocumentRequest): number {
  if (!canCreateNewRequest()) {
    logger.warn(
      { symbol: request.symbol },
      'Cannot create request - max pending reached'
    );
    return -1;
  }

  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO document_requests (symbol, reason, requested_at, status)
    VALUES (?, ?, ?, 'pending')
  `);

  const result = stmt.run(
    request.symbol,
    request.reason,
    new Date().toISOString()
  );

  logger.info(
    { symbol: request.symbol, id: result.lastInsertRowid },
    'Document request created'
  );

  return Number(result.lastInsertRowid);
}

export function getPendingRequests(): Array<{
  id: number;
  symbol: string;
  reason: string;
  requestedAt: string;
}> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, symbol, reason, requested_at as requestedAt
    FROM document_requests
    WHERE status = 'pending'
    ORDER BY requested_at ASC
  `);

  return stmt.all() as Array<{
    id: number;
    symbol: string;
    reason: string;
    requestedAt: string;
  }>;
}

export function markRequestFulfilled(id: number, filePath: string): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE document_requests
    SET status = 'fulfilled', fulfilled_at = ?, file_path = ?
    WHERE id = ?
  `);

  stmt.run(new Date().toISOString(), filePath, id);
  logger.info({ id, filePath }, 'Document request fulfilled');
}

export function markRequestIgnored(id: number): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE document_requests
    SET status = 'ignored'
    WHERE id = ?
  `);

  stmt.run(id);
  logger.info({ id }, 'Document request ignored');
}
