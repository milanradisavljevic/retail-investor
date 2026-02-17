/**
 * Application configuration loaded from JSON files
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
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

function resolveUniverseByDisplayName(projectRoot: string, universeName: string): string | null {
  const normalized = universeName.trim().toLowerCase();
  if (!normalized) return null;

  const universeDir = join(projectRoot, 'config', 'universes');
  if (!existsSync(universeDir)) return null;

  const files = readdirSync(universeDir).filter((file) => file.endsWith('.json'));
  for (const file of files) {
    const filePath = join(universeDir, file);
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as { name?: string };
      const candidate = typeof parsed.name === 'string' ? parsed.name.trim().toLowerCase() : '';
      if (candidate && candidate === normalized) {
        return filePath;
      }
    } catch {
      // Ignore malformed/unreadable universe configs and continue searching.
    }
  }

  return null;
}

function resolveUniversePath(projectRoot: string): string {
  const configDir = join(projectRoot, 'config');
  const envPath =
    process.env.UNIVERSE_CONFIG || process.env.UNIVERSE_FILE || process.env.UNIVERSE;

  if (envPath) {
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

    // Backward compatibility: some callers may pass universe display names (e.g. "Russell 2000 Full").
    const displayNamePath = resolveUniverseByDisplayName(projectRoot, envPath);
    if (displayNamePath) {
      return displayNamePath;
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

function normalizeUniverse(raw: unknown): UniverseConfig {
  const parsed =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};
  const symbols = Array.isArray(parsed.symbols) ? parsed.symbols : [];
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
    name: typeof parsed.name === 'string' ? parsed.name : 'Universe',
    provider:
      typeof parsed.provider === 'string'
        ? parsed.provider
        : typeof parsed.default_provider === 'string'
          ? parsed.default_provider
          : 'finnhub',
    benchmark:
      typeof parsed.benchmark === 'string'
        ? parsed.benchmark
        : typeof parsed.default_benchmark === 'string'
          ? parsed.default_benchmark
          : 'SPY',
    description: typeof parsed.description === 'string' ? parsed.description : '',
    version: typeof parsed.version === 'string' ? parsed.version : '1',
    selection_rule:
      typeof parsed.selection_rule === 'string'
        ? parsed.selection_rule
        : typeof parsed.rule === 'string'
          ? parsed.rule
          : '',
    survivorship_bias_note:
      typeof parsed.survivorship_bias_note === 'string'
        ? parsed.survivorship_bias_note
        : typeof parsed.note === 'string'
          ? parsed.note
          : '',
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
