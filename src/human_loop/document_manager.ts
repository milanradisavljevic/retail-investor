/**
 * Document Manager
 * Handles import and storage of user-provided financial documents
 */

import { readFileSync, readdirSync, renameSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getDatabase } from '@/data/db';
import { createChildLogger } from '@/utils/logger';
import { validatePacket, checkPacketConsistency } from './packet_validator';
import { getPendingRequests, markRequestFulfilled } from './trigger';
import type { FinancialPacketV1SchemaJson } from '@/types/generated/financial_packet_v1';

const logger = createChildLogger('document_manager');

export interface ImportResult {
  success: boolean;
  symbol: string;
  filePath: string;
  errors: string[];
  warnings: string[];
}

export function getIncomingDocumentsPath(): string {
  const projectRoot = process.cwd();
  return join(projectRoot, 'data', 'documents', 'incoming');
}

export function getProcessedDocumentsPath(): string {
  const projectRoot = process.cwd();
  return join(projectRoot, 'data', 'documents', 'processed');
}

export function scanIncomingDocuments(): string[] {
  const incomingPath = getIncomingDocumentsPath();

  if (!existsSync(incomingPath)) {
    return [];
  }

  const files = readdirSync(incomingPath);
  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(incomingPath, f));
}

export function importDocument(filePath: string): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  logger.info({ filePath }, 'Importing document');

  // Read file
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      symbol: '',
      filePath,
      errors: [`Failed to read file: ${message}`],
      warnings: [],
    };
  }

  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (error) {
    return {
      success: false,
      symbol: '',
      filePath,
      errors: ['Invalid JSON format'],
      warnings: [],
    };
  }

  // Validate against schema
  const validation = validatePacket(data);
  if (!validation.valid) {
    return {
      success: false,
      symbol: '',
      filePath,
      errors: validation.errors ?? ['Validation failed'],
      warnings: [],
    };
  }

  const packet = validation.data!;
  const symbol = packet.meta.symbol;

  // Check consistency
  const consistency = checkPacketConsistency(packet);
  if (!consistency.passed) {
    errors.push(...consistency.errors);
  }
  warnings.push(...consistency.warnings);

  if (errors.length > 0) {
    return {
      success: false,
      symbol,
      filePath,
      errors,
      warnings,
    };
  }

  // Save to database
  savePacket(packet);

  // Move file to processed
  const processedPath = moveToProcessed(filePath, symbol);

  // Check if this fulfills a pending request
  fulfillPendingRequest(symbol, processedPath);

  logger.info({ symbol, processedPath }, 'Document imported successfully');

  return {
    success: true,
    symbol,
    filePath: processedPath,
    errors: [],
    warnings,
  };
}

function savePacket(packet: FinancialPacketV1SchemaJson): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO financial_packets (
      symbol, period_end, period_type, data_json, source_type, imported_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, period_end, period_type) DO UPDATE SET
      data_json = excluded.data_json,
      source_type = excluded.source_type,
      imported_at = excluded.imported_at
  `);

  stmt.run(
    packet.meta.symbol,
    packet.meta.period_end,
    packet.meta.period_type,
    JSON.stringify(packet),
    packet.meta.source.type,
    new Date().toISOString()
  );
}

function moveToProcessed(sourcePath: string, symbol: string): string {
  const processedDir = getProcessedDocumentsPath();

  if (!existsSync(processedDir)) {
    mkdirSync(processedDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destPath = join(processedDir, `${symbol}_${timestamp}.json`);

  renameSync(sourcePath, destPath);
  return destPath;
}

function fulfillPendingRequest(symbol: string, filePath: string): void {
  const pending = getPendingRequests();
  const matchingRequest = pending.find((r) => r.symbol === symbol);

  if (matchingRequest) {
    markRequestFulfilled(matchingRequest.id, filePath);
  }
}

export function processAllIncoming(): ImportResult[] {
  const files = scanIncomingDocuments();
  const results: ImportResult[] = [];

  for (const file of files) {
    results.push(importDocument(file));
  }

  return results;
}

export function getPacket(
  symbol: string,
  periodType?: string
): FinancialPacketV1SchemaJson | null {
  const db = getDatabase();

  let sql = `
    SELECT data_json
    FROM financial_packets
    WHERE symbol = ?
  `;
  const params: string[] = [symbol];

  if (periodType) {
    sql += ' AND period_type = ?';
    params.push(periodType);
  }

  sql += ' ORDER BY period_end DESC LIMIT 1';

  const stmt = db.prepare(sql);
  const row = stmt.get(...params) as { data_json: string } | undefined;

  if (!row) return null;

  return JSON.parse(row.data_json) as FinancialPacketV1SchemaJson;
}
