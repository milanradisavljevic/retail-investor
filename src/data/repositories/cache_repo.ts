/**
 * Cache repository for managing cached API responses
 */

import { getDatabase } from '../db';
import { createChildLogger } from '@/utils/logger';

const logger = createChildLogger('cache_repo');

export interface CacheEntry {
  key: string;
  lastUpdated: number;
  ttlSeconds: number;
  hitCount: number;
}

export function getCacheEntry(key: string): CacheEntry | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT key, last_updated as lastUpdated, ttl_seconds as ttlSeconds, hit_count as hitCount
    FROM cache_meta
    WHERE key = ?
  `);

  const row = stmt.get(key) as CacheEntry | undefined;
  return row ?? null;
}

export function setCacheEntry(
  key: string,
  ttlSeconds: number,
  now: number = Date.now()
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO cache_meta (key, last_updated, ttl_seconds, hit_count)
    VALUES (?, ?, ?, 0)
    ON CONFLICT(key) DO UPDATE SET
      last_updated = excluded.last_updated,
      ttl_seconds = excluded.ttl_seconds
  `);

  stmt.run(key, now, ttlSeconds);
}

export function incrementCacheHit(key: string): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE cache_meta
    SET hit_count = hit_count + 1
    WHERE key = ?
  `);

  stmt.run(key);
}

export function isCacheValid(key: string, now: number = Date.now()): boolean {
  const entry = getCacheEntry(key);
  if (!entry) {
    return false;
  }

  const expiresAt = entry.lastUpdated + entry.ttlSeconds * 1000;
  const valid = now < expiresAt;

  if (valid) {
    incrementCacheHit(key);
  }

  return valid;
}

export function invalidateCache(key: string): void {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM cache_meta WHERE key = ?');
  stmt.run(key);
}

export function invalidateCacheByPattern(pattern: string): number {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM cache_meta WHERE key LIKE ?');
  const result = stmt.run(pattern);
  return result.changes;
}

export function getCacheStats(): {
  totalEntries: number;
  totalHits: number;
  expiredCount: number;
} {
  const db = getDatabase();
  const now = Date.now();

  const totalStmt = db.prepare('SELECT COUNT(*) as count FROM cache_meta');
  const hitsStmt = db.prepare('SELECT SUM(hit_count) as total FROM cache_meta');
  const expiredStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM cache_meta
    WHERE last_updated + (ttl_seconds * 1000) < ?
  `);

  const total = (totalStmt.get() as { count: number }).count;
  const hits = (hitsStmt.get() as { total: number | null }).total ?? 0;
  const expired = (expiredStmt.get(now) as { count: number }).count;

  return {
    totalEntries: total,
    totalHits: hits,
    expiredCount: expired,
  };
}

export function cleanupExpiredCache(now: number = Date.now()): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    DELETE FROM cache_meta
    WHERE last_updated + (ttl_seconds * 1000) < ?
  `);

  const result = stmt.run(now);
  if (result.changes > 0) {
    logger.info({ removed: result.changes }, 'Cleaned up expired cache entries');
  }

  return result.changes;
}
