/**
 * Technical metrics cache using filesystem + cache meta TTLs.
 * Avoids unnecessary Finnhub calls between runs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { isCacheValid, setCacheEntry } from './cache_repo';
import type { TechnicalMetrics } from '@/providers/types';

const CACHE_FOLDER = join(process.cwd(), 'data', 'cache', 'technical');

function getCacheFilePath(symbol: string): string {
  if (!existsSync(CACHE_FOLDER)) {
    mkdirSync(CACHE_FOLDER, { recursive: true });
  }
  return join(CACHE_FOLDER, `${symbol}.json`);
}

export interface CachedTechnicalMetrics {
  symbol: string;
  fetchedAt: number;
  data: TechnicalMetrics;
}

export function getCachedTechnicalMetrics(
  symbol: string,
  ttlSeconds: number,
  now: number = Date.now()
): CachedTechnicalMetrics | null {
  const cacheKey = `technical_${symbol}`;
  const cachePath = getCacheFilePath(symbol);

  if (!isCacheValid(cacheKey, now) || !existsSync(cachePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(cachePath, 'utf-8')) as CachedTechnicalMetrics;
    const expired = now - parsed.fetchedAt > ttlSeconds * 1000;
    if (expired) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveTechnicalMetricsCache(
  symbol: string,
  data: TechnicalMetrics,
  ttlSeconds: number,
  now: number = Date.now()
): void {
  const cacheKey = `technical_${symbol}`;
  const cachePath = getCacheFilePath(symbol);

  const payload: CachedTechnicalMetrics = {
    symbol,
    fetchedAt: now,
    data,
  };

  writeFileSync(cachePath, JSON.stringify(payload), 'utf-8');
  setCacheEntry(cacheKey, ttlSeconds, now);
}
