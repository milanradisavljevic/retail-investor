/**
 * Scoring configuration loader with per-universe overrides.
 */

import { existsSync, readFileSync } from 'fs';
import crypto from 'crypto';
import { join } from 'path';
import { getConfig } from '@/core/config';

export interface Threshold {
  low: number;
  high: number;
}

export interface FundamentalThresholds {
  pe: Threshold;
  pb: Threshold;
  ps: Threshold;
  roe: Threshold;
  debtEquity: Threshold;
}

export interface PillarWeights {
  valuation: number;
  quality: number;
  technical: number;
  risk: number;
}

export interface ScoringConfig {
  fundamentalThresholds: FundamentalThresholds;
  pillarWeights: PillarWeights;
  priceTarget: {
    minSectorSampleSize: number;
    defaultMedians: {
      pe: number;
      pb: number;
      ps: number;
      sampleSize: number;
    };
  };
  pipeline?: {
    topK?: number;
    maxSymbolsPerRun?: number;
    maxConcurrency?: number;
    throttleMs?: number;
    scanOnlyPriceTarget?: boolean;
  };
  diversification?: {
    enabled?: boolean;
    maxPerSector?: number;
    maxPerIndustry?: number;
  };
}

const DEFAULT_PRICE_TARGET = {
  minSectorSampleSize: 5, // Reduced from 12 to improve sector median usage
  defaultMedians: {
    pe: 20,
    pb: 3,
    ps: 2.5,
    sampleSize: 100,
  },
};

interface RawScoringConfig {
  default: {
    fundamental_thresholds: FundamentalThresholds;
    pillar_weights: PillarWeights;
    price_target?: {
      min_sector_sample_size?: number;
      default_medians?: {
        pe?: number;
        pb?: number;
        ps?: number;
        sample_size?: number;
      };
    };
    pipeline?: {
      top_k?: number;
      max_symbols_per_run?: number;
      max_concurrency?: number;
      throttle_ms?: number;
      scan_only_price_target?: boolean;
    };
    diversification?: {
      enabled?: boolean;
      max_per_sector?: number;
      max_per_industry?: number;
    };
  };
  overrides?: Record<
    string,
    Partial<{
      fundamental_thresholds: Partial<FundamentalThresholds>;
      pillar_weights: Partial<PillarWeights>;
      price_target?: {
        min_sector_sample_size?: number;
        default_medians?: {
          pe?: number;
          pb?: number;
          ps?: number;
          sample_size?: number;
        };
      };
      pipeline?: {
        top_k?: number;
        max_symbols_per_run?: number;
        max_concurrency?: number;
        throttle_ms?: number;
        scan_only_price_target?: boolean;
      };
      diversification?: {
        enabled?: boolean;
        max_per_sector?: number;
        max_per_industry?: number;
      };
    }>
  >;
}

export interface RawPresetConfig {
  name?: string;
  description?: string;
  pillar_weights?: Partial<PillarWeights>;
  fundamental_thresholds?: Partial<FundamentalThresholds>;
  filters?: Record<string, unknown>;
  diversification?: {
    enabled?: boolean;
    max_per_sector?: number;
    max_per_industry?: number;
  };
}

const DEFAULT_CONFIG: ScoringConfig = {
  fundamentalThresholds: {
    pe: { low: 15, high: 30 },
    pb: { low: 1.5, high: 5 },
    ps: { low: 1, high: 5 },
    roe: { low: 5, high: 20 },
    debtEquity: { low: 0.5, high: 2 },
  },
  pillarWeights: {
    valuation: 0.25,
    quality: 0.25,
    technical: 0.25,
    risk: 0.25,
  },
  priceTarget: DEFAULT_PRICE_TARGET,
  pipeline: {
    topK: 50,
    maxSymbolsPerRun: 150,
    maxConcurrency: 4,
    throttleMs: 150,
    scanOnlyPriceTarget: false,
  },
  diversification: {
    enabled: true,
    maxPerSector: 2,
    maxPerIndustry: 3,
  },
};

function loadRawConfig(): RawScoringConfig | null {
  const projectRoot = process.cwd();
  const path = join(projectRoot, 'config', 'scoring.json');
  if (!existsSync(path)) {
    return null;
  }

  try {
    const json = readFileSync(path, 'utf-8');
    return JSON.parse(json) as RawScoringConfig;
  } catch {
    return null;
  }
}

export interface LoadedPreset {
  name: string;
  path: string;
  hash: string;
  config: RawPresetConfig;
}

function validatePreset(preset: RawPresetConfig, presetPath: string): void {
  if (!preset.pillar_weights) {
    const msg = `preset_invalid_schema: missing pillar_weights in ${presetPath}`;
    throw new Error(msg);
  }
  const keys: Array<keyof PillarWeights> = ['valuation', 'quality', 'technical', 'risk'];
  for (const key of keys) {
    const val = preset.pillar_weights[key];
    if (val === undefined || val === null || Number.isNaN(Number(val))) {
      const msg = `preset_invalid_schema: pillar_weights.${key} missing or not numeric in ${presetPath}`;
      throw new Error(msg);
    }
  }
}

export function loadPresetConfig(
  projectRoot: string,
  { failFast = false, presetName }: { failFast?: boolean; presetName?: string } = {}
): RawPresetConfig | null {
  const name = (presetName || process.env.SCORING_PRESET || process.env.PRESET || '').trim();
  if (!name) return null;

  const presetPath = join(projectRoot, 'config', 'presets', `${name}.json`);
  if (!existsSync(presetPath)) {
    const message = `preset_not_found: ${presetPath}`;
    if (failFast) throw new Error(message);
    // eslint-disable-next-line no-console
    console.warn(message);
    return null;
  }

  try {
    const json = readFileSync(presetPath, 'utf-8');
    const parsed = JSON.parse(json) as RawPresetConfig;
    validatePreset(parsed, presetPath);
    return parsed;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `preset_invalid_json: ${presetPath}`;
    if (failFast) throw new Error(message);
    // eslint-disable-next-line no-console
    console.warn(message);
    return null;
  }
}

export function loadPresetStrict(
  projectRoot: string,
  presetName?: string
): LoadedPreset {
  const name = (presetName || process.env.SCORING_PRESET || process.env.PRESET || '').trim();
  if (!name) {
    throw new Error('preset_missing: PRESET/SCORING_PRESET not set');
  }
  const presetPath = join(projectRoot, 'config', 'presets', `${name}.json`);
  if (!existsSync(presetPath)) {
    throw new Error(`preset_not_found: ${presetPath}`);
  }
  const json = readFileSync(presetPath, 'utf-8');
  let parsed: RawPresetConfig;
  try {
    parsed = JSON.parse(json) as RawPresetConfig;
  } catch {
    throw new Error(`preset_invalid_json: ${presetPath}`);
  }
  validatePreset(parsed, presetPath);
  const hash = crypto.createHash('sha1').update(json).digest('hex');
  return { name, path: presetPath, hash, config: parsed };
}

function mergeThresholds(
  base: FundamentalThresholds,
  override?: Partial<FundamentalThresholds>
): FundamentalThresholds {
  if (!override) return base;
  return {
    pe: { ...base.pe, ...override.pe },
    pb: { ...base.pb, ...override.pb },
    ps: { ...base.ps, ...override.ps },
    roe: { ...base.roe, ...override.roe },
    debtEquity: { ...base.debtEquity, ...override.debtEquity },
  };
}

function mergeWeights(base: PillarWeights, override?: Partial<PillarWeights>): PillarWeights {
  if (!override) return base;
  return {
    valuation: override.valuation ?? base.valuation,
    quality: override.quality ?? base.quality,
    technical: override.technical ?? base.technical,
    risk: override.risk ?? base.risk,
  };
}

function mergePriceTarget(
  base: typeof DEFAULT_PRICE_TARGET,
  override?: RawScoringConfig['default']['price_target']
) {
  if (!override) return base;
  return {
    minSectorSampleSize: override.min_sector_sample_size ?? base.minSectorSampleSize,
    defaultMedians: {
      pe: override.default_medians?.pe ?? base.defaultMedians.pe,
      pb: override.default_medians?.pb ?? base.defaultMedians.pb,
      ps: override.default_medians?.ps ?? base.defaultMedians.ps,
      sampleSize: override.default_medians?.sample_size ?? base.defaultMedians.sampleSize,
    },
  };
}

function mergePipeline(
  base: NonNullable<ScoringConfig['pipeline']>,
  override?: { top_k?: number; max_symbols_per_run?: number; max_concurrency?: number; throttle_ms?: number; scan_only_price_target?: boolean }
) {
  if (!override) return base;
  return {
    topK: override.top_k ?? base.topK,
    maxSymbolsPerRun: override.max_symbols_per_run ?? base.maxSymbolsPerRun,
    maxConcurrency: override.max_concurrency ?? base.maxConcurrency,
    throttleMs: override.throttle_ms ?? base.throttleMs,
    scanOnlyPriceTarget: override.scan_only_price_target ?? base.scanOnlyPriceTarget,
  };
}

function mergeDiversification(
  base: NonNullable<ScoringConfig['diversification']>,
  override?: RawScoringConfig['default']['diversification']
) {
  if (!override) return base;
  return {
    enabled: override.enabled ?? base.enabled,
    maxPerSector: override.max_per_sector ?? base.maxPerSector,
    maxPerIndustry: override.max_per_industry ?? base.maxPerIndustry,
  };
}

function mergeDiversificationFromPreset(
  base: NonNullable<ScoringConfig['diversification']>,
  preset?: RawPresetConfig['diversification']
) {
  if (!preset) return base;
  return {
    enabled: preset.enabled ?? base.enabled,
    maxPerSector: preset.max_per_sector ?? base.maxPerSector,
    maxPerIndustry: preset.max_per_industry ?? base.maxPerIndustry,
  };
}

function normalizeWeights(weights: PillarWeights): PillarWeights {
  const total = weights.valuation + weights.quality + weights.technical + weights.risk;
  if (total <= 0) {
    return DEFAULT_CONFIG.pillarWeights;
  }
  return {
    valuation: weights.valuation / total,
    quality: weights.quality / total,
    technical: weights.technical / total,
    risk: weights.risk / total,
  };
}

export function getScoringConfig(): ScoringConfig {
  const projectRoot = process.cwd();
  const raw = loadRawConfig();
  const preset = loadPresetConfig(projectRoot);
  if (!raw) {
    const withPreset: ScoringConfig = { ...DEFAULT_CONFIG };
    if (preset) {
      withPreset.fundamentalThresholds = mergeThresholds(
        withPreset.fundamentalThresholds,
        preset.fundamental_thresholds
      );
      withPreset.pillarWeights = normalizeWeights(
        mergeWeights(withPreset.pillarWeights, preset.pillar_weights)
      );
      withPreset.diversification = mergeDiversificationFromPreset(
        withPreset.diversification!,
        preset.diversification
      );
    }
    return withPreset;
  }

  const universeName = getConfig().universe.name;
  const baseThresholds = raw.default.fundamental_thresholds ?? DEFAULT_CONFIG.fundamentalThresholds;
  const baseWeights = raw.default.pillar_weights ?? DEFAULT_CONFIG.pillarWeights;
  const basePriceTarget = mergePriceTarget(DEFAULT_PRICE_TARGET, raw.default.price_target);
  const basePipeline = mergePipeline(DEFAULT_CONFIG.pipeline!, (raw.default as any).pipeline);
  const baseDiversification = mergeDiversification(DEFAULT_CONFIG.diversification!, raw.default.diversification);

  const override = raw.overrides?.[universeName];

  const mergedThresholds = mergeThresholds(
    baseThresholds,
    override?.fundamental_thresholds as Partial<FundamentalThresholds> | undefined
  );

  const mergedWeights = mergeWeights(
    baseWeights,
    override?.pillar_weights as Partial<PillarWeights> | undefined
  );

  const mergedPriceTarget = mergePriceTarget(basePriceTarget, override?.price_target);
  const mergedPipeline = mergePipeline(basePipeline, (override as any)?.pipeline);
  const mergedDiversification = mergeDiversification(baseDiversification, override?.diversification);

  const config: ScoringConfig = {
    fundamentalThresholds: mergedThresholds,
    pillarWeights: normalizeWeights(mergedWeights),
    priceTarget: mergedPriceTarget,
    pipeline: mergedPipeline,
    diversification: mergedDiversification,
  };

  if (preset) {
    config.fundamentalThresholds = mergeThresholds(config.fundamentalThresholds, preset.fundamental_thresholds);
    config.pillarWeights = normalizeWeights(mergeWeights(config.pillarWeights, preset.pillar_weights));
    if (config.diversification) {
      config.diversification = mergeDiversificationFromPreset(config.diversification, preset.diversification);
    }
  }

  return config;
}
