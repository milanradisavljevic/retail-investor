/**
 * Application configuration loaded from JSON files
 */

import { existsSync, readFileSync } from 'fs';
import { isAbsolute, join } from 'path';

export interface UniverseConfig {
  name: string;
  symbols: string[];
  provider?: string;
  benchmark?: string;
  description?: string;
  version?: string;
  selection_rule?: string;
  survivorship_bias_note?: string;
}

export interface CacheTtlConfig {
  prices_ttl_hours: number;
  fundamentals_ttl_days: number;
  news_ttl_minutes: number;
  profile_ttl_days: number;
}

export interface AppConfig {
  universe: UniverseConfig;
  cacheTtl: CacheTtlConfig;
  projectRoot: string;
}

let cachedConfig: AppConfig | null = null;

function getProjectRoot(): string {
  return process.cwd();
}

function resolveUniversePath(projectRoot: string): string {
  const configDir = join(projectRoot, 'config');
  const envPath =
    process.env.UNIVERSE_CONFIG || process.env.UNIVERSE_FILE || process.env.UNIVERSE;

  if (envPath) {
    const universeDir = join(configDir, 'universes');
    const asPack =
      envPath.endsWith('.json') || envPath.includes('/')
        ? envPath
        : join('universes', `${envPath}.json`);
    const packPath = isAbsolute(asPack)
      ? asPack
      : join(projectRoot, asPack.startsWith('config/') ? asPack : join('config', asPack));
    if (existsSync(packPath)) {
      return packPath;
    }

    if (isAbsolute(envPath)) {
      return envPath;
    }
    // If caller already provided a path under config/, keep it relative to project root
    if (envPath.startsWith('config/')) {
      return join(projectRoot, envPath);
    }
    return join(configDir, envPath);
  }

  const defaultPack = join(configDir, 'universe.json');
  if (existsSync(defaultPack)) return defaultPack;

  const fallbackPack = join(configDir, 'universes', 'test.json');
  return fallbackPack;
}

function normalizeUniverse(raw: any): UniverseConfig {
  const symbols = Array.isArray(raw.symbols) ? raw.symbols : [];
  const normalizedSymbols: string[] = [];
  const seen = new Set<string>();
  for (const sym of symbols) {
    if (typeof sym !== 'string') continue;
    const upper = sym.trim().toUpperCase();
    if (upper && !seen.has(upper)) {
      seen.add(upper);
      normalizedSymbols.push(upper);
    }
  }

  return {
    name: raw.name ?? 'Universe',
    provider: raw.provider ?? raw.default_provider ?? 'finnhub',
    benchmark: raw.benchmark ?? raw.default_benchmark ?? 'SPY',
    description: raw.description ?? '',
    version: raw.version ?? '1',
    selection_rule: raw.selection_rule ?? raw.rule ?? '',
    survivorship_bias_note: raw.survivorship_bias_note ?? raw.note ?? '',
    symbols: normalizedSymbols,
  };
}

export function loadConfig(): AppConfig {
  const projectRoot = getProjectRoot();
  const configPath = join(projectRoot, 'config');

  const universePath = resolveUniversePath(projectRoot);
  const universeJson = readFileSync(universePath, 'utf-8');
  const universe = normalizeUniverse(JSON.parse(universeJson));

  const cacheTtlJson = readFileSync(join(configPath, 'cache_ttl.json'), 'utf-8');
  const cacheTtl: CacheTtlConfig = JSON.parse(cacheTtlJson);

  return {
    universe,
    cacheTtl,
    projectRoot,
  };
}

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}
