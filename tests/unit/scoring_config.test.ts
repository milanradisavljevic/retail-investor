import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getScoringConfig } from '@/scoring/scoring_config';
import { resetConfig } from '@/core/config';

let originalCwd: string;
let tempDir: string;

describe('scoring config loader', () => {
  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), 'scoring-config-'));
    process.chdir(tempDir);
    mkdirSync('config', { recursive: true });
    // minimal universe/config required for getConfig()
    writeFileSync(
      join('config', 'universe.json'),
      JSON.stringify({
        name: 'Default',
        description: 'test',
        version: '1',
        selection_rule: 'test',
        survivorship_bias_note: 'test',
        symbols: ['AAA'],
      })
    );
    writeFileSync(
      join('config', 'cache_ttl.json'),
      JSON.stringify({
        prices_ttl_hours: 1,
        fundamentals_ttl_days: 1,
        news_ttl_minutes: 1,
        profile_ttl_days: 1,
      })
    );
  });

  afterEach(() => {
    resetConfig();
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads defaults when no scoring.json exists', () => {
    const config = getScoringConfig();
    expect(config.pillarWeights.valuation).toBeCloseTo(0.25);
    expect(config.fundamentalThresholds.pe.low).toBe(15);
    expect(config.pipeline?.maxSymbolsPerRun).toBe(150);
  });

  it('applies override for current universe', () => {
    writeFileSync(
      join('config', 'scoring.json'),
      JSON.stringify({
        default: {
          fundamental_thresholds: {
            pe: { low: 10, high: 25 },
            pb: { low: 1, high: 4 },
            ps: { low: 0.5, high: 3 },
            roe: { low: 4, high: 18 },
            debtEquity: { low: 0.4, high: 1.8 }
          },
          pillar_weights: { valuation: 0.3, quality: 0.2, technical: 0.3, risk: 0.2 }
        },
        overrides: {
          Default: {
            pillar_weights: { valuation: 0.4, quality: 0.2, technical: 0.2, risk: 0.2 }
          }
        }
      })
    );

    const config = getScoringConfig();
    expect(config.pillarWeights.valuation).toBeCloseTo(0.4);
    expect(config.pillarWeights.risk).toBeCloseTo(0.2);
    expect(config.fundamentalThresholds.pe.low).toBe(10);
  });
});
