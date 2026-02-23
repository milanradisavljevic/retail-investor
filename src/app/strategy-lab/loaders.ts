import fs from 'fs';
import path from 'path';
import { loadAllPresets } from '@/lib/presets/loader';
import type { PresetConfig } from '@/lib/presets/loader';

export type UniverseConfig = {
  id: string;
  name: string;
  description?: string;
  symbols: string[];
  benchmark: string;
  snapshot_file?: string;
  snapshot_date?: string;
  symbol_count?: number;
};

export type UniverseStatus = 'TEST' | 'SAMPLE' | 'FULL';

export type UniverseRegion = 'US' | 'Europe' | 'Asia' | 'LatAm';

export type UniverseWithMetadata = UniverseConfig & {
  status: UniverseStatus;
  region: UniverseRegion;
  flag: string;
  estimatedRuntimeMin: number;
};

export type { PresetConfig };

/**
 * Load all universe configs from config/universes/
 */
export async function loadUniverses(): Promise<UniverseConfig[]> {
  const dir = path.join(process.cwd(), 'config/universes');

  if (!fs.existsSync(dir)) {
    console.warn(`Universe directory not found: ${dir}`);
    return [];
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

  return files.map(f => {
    try {
      const filePath = path.join(dir, f);
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as Omit<UniverseConfig, 'id' | 'symbol_count'>;

      return {
        id: f.replace('.json', ''),
        ...parsed,
        symbol_count: parsed.symbols?.length || 0,
      };
    } catch (error) {
      console.error(`Failed to load universe ${f}:`, error);
      return null;
    }
  }).filter(Boolean) as UniverseConfig[];
}

/**
 * Load all preset configs from config/presets/
 */
export async function loadPresets(): Promise<PresetConfig[]> {
  return loadAllPresets();
}

/**
 * Determine universe status based on symbol count
 */
function getUniverseStatus(symbolCount: number): UniverseStatus {
  if (symbolCount <= 10) return 'TEST';
  if (symbolCount < 100) return 'SAMPLE';
  return 'FULL';
}

/**
 * Determine universe region based on ID and benchmark
 */
function getUniverseRegion(id: string, benchmark: string): UniverseRegion {
  // Guard against missing data in configs
  const normalizedId = id || '';
  const normalizedBenchmark = benchmark || '';

  // US markets
  if (
    normalizedId.includes('russell') ||
    normalizedId.includes('sp500') ||
    normalizedId.includes('nasdaq') ||
    normalizedId.includes('test') ||
    normalizedBenchmark === 'SPY' ||
    normalizedBenchmark === 'IWM' ||
    normalizedBenchmark === 'QQQ'
  ) {
    return 'US';
  }

  // European markets
  if (
    normalizedId.includes('cac40') ||
    normalizedId.includes('dax') ||
    normalizedId.includes('ftse') ||
    normalizedId.includes('eurostoxx') ||
    normalizedBenchmark.includes('FCHI') ||
    normalizedBenchmark.includes('GDAXI') ||
    normalizedBenchmark.includes('FTSE') ||
    normalizedBenchmark.includes('STOXX')
  ) {
    return 'Europe';
  }

  // Latin America
  if (
    normalizedId.includes('ibovespa') ||
    normalizedBenchmark.includes('BVSP')
  ) {
    return 'LatAm';
  }

  // Asia (default for remaining)
  return 'Asia';
}

/**
 * Get flag emoji for region
 */
function getRegionFlag(region: UniverseRegion, id: string): string {
  if (region === 'US') return '🇺🇸';
  if (region === 'LatAm') return '🇧🇷';

  // Europe - country-specific
  if (id.includes('cac40')) return '🇫🇷';
  if (id.includes('dax')) return '🇩🇪';
  if (id.includes('ftse')) return '🇬🇧';
  if (id.includes('eurostoxx')) return '🇪🇺';

  // Asia - country-specific
  if (id.includes('nikkei')) return '🇯🇵';
  if (id.includes('shanghai')) return '🇨🇳';
  if (id.includes('sensex')) return '🇮🇳';

  return '🌍';
}

/**
 * Calculate estimated runtime in minutes (formula: symbols × 0.05)
 */
function calculateRuntime(symbolCount: number): number {
  return Math.floor(symbolCount * 0.05);
}

/**
 * Load universes with metadata (status, region, flag, runtime)
 */
export async function loadUniversesWithMetadata(): Promise<UniverseWithMetadata[]> {
  const universes = await loadUniverses();

  // Only show production-ready universes (per 2026-01-26 cleanup plan in CHANGELOG)
  const PRODUCTION_WHITELIST = new Set([
    'sp500-full',
    'nasdaq100-full',
    'russell2000_full',
    'cac40-full',
    'dax40-full',
    'ftse100-full',
    'eurostoxx50-full',
    'nikkei225_full',
    'etf',
    'test',
  ]);

  const filtered = universes.filter(u => PRODUCTION_WHITELIST.has(u.id));

  return filtered.map(universe => {
    const symbolCount = universe.symbol_count || 0;
    const status = getUniverseStatus(symbolCount);
    const region = getUniverseRegion(universe.id, universe.benchmark);
    const flag = getRegionFlag(region, universe.id);
    const estimatedRuntimeMin = calculateRuntime(symbolCount);

    return {
      ...universe,
      status,
      region,
      flag,
      estimatedRuntimeMin,
    };
  });
}

/**
 * Group universes by region
 */
export function groupUniversesByRegion(universes: UniverseWithMetadata[]): Record<UniverseRegion, UniverseWithMetadata[]> {
  return universes.reduce((acc, universe) => {
    if (!acc[universe.region]) {
      acc[universe.region] = [];
    }
    acc[universe.region].push(universe);
    return acc;
  }, {} as Record<UniverseRegion, UniverseWithMetadata[]>);
}
