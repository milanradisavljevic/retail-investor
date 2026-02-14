import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PRESETS_DIR = join(process.cwd(), 'config', 'presets');

function loadAllPresetFiles(): { filename: string; content: unknown }[] {
  if (!existsSync(PRESETS_DIR)) {
    return [];
  }

  const files = readdirSync(PRESETS_DIR).filter(f => f.endsWith('.json'));

  return files.map(filename => {
    const filePath = join(PRESETS_DIR, filename);
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    return { filename, content };
  });
}

describe('Preset Configuration Validation', () => {
  const presets = loadAllPresetFiles();

  it('finds preset files in config/presets/', () => {
    expect(presets.length).toBeGreaterThan(0);
  });

  describe.each(presets)('Preset: $filename', ({ filename, content }) => {
    const preset = content as Record<string, unknown>;

    it('has required "name" field', () => {
      expect(preset).toHaveProperty('name');
      expect(typeof preset.name).toBe('string');
      expect(preset.name).not.toBe('');
    });

    it('has valid tier field if present', () => {
      if (preset.tier !== undefined) {
        expect(['validated', 'experimental']).toContain(preset.tier);
      }
    });

    it('has required "description" field', () => {
      expect(preset).toHaveProperty('description');
      expect(typeof preset.description).toBe('string');
    });

    it('has required "pillar_weights" object', () => {
      expect(preset).toHaveProperty('pillar_weights');
      expect(typeof preset.pillar_weights).toBe('object');
      expect(preset.pillar_weights).not.toBeNull();
    });

    it('pillar_weights contains all 4 pillars', () => {
      const weights = preset.pillar_weights as Record<string, unknown>;

      expect(weights).toHaveProperty('valuation');
      expect(weights).toHaveProperty('quality');
      expect(weights).toHaveProperty('technical');
      expect(weights).toHaveProperty('risk');
    });

    it('pillar_weights sum to approximately 1.0 (±0.02)', () => {
      const weights = preset.pillar_weights as Record<string, number>;

      const sum =
        (weights.valuation ?? 0) +
        (weights.quality ?? 0) +
        (weights.technical ?? 0) +
        (weights.risk ?? 0);

      expect(sum).toBeGreaterThanOrEqual(0.98);
      expect(sum).toBeLessThanOrEqual(1.02);
    });

    it('each pillar weight is between 0 and 1', () => {
      const weights = preset.pillar_weights as Record<string, number>;

      for (const pillar of ['valuation', 'quality', 'technical', 'risk']) {
        const weight = weights[pillar] ?? 0;
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      }
    });

    it('regime_overlay_recommended is boolean when present', () => {
      if (preset.regime_overlay_recommended !== undefined) {
        expect(typeof preset.regime_overlay_recommended).toBe('boolean');
      }
    });

    it('has valid JSON structure (no syntax errors)', () => {
      const filePath = join(PRESETS_DIR, filename);
      const rawContent = readFileSync(filePath, 'utf-8');

      expect(() => JSON.parse(rawContent)).not.toThrow();
    });
  });
});

describe('Preset Coverage', () => {
  const presets = loadAllPresetFiles();

  it('includes core validated presets', () => {
    const presetNames = presets.map(p => 
      ((p.content as Record<string, unknown>).name as string).toLowerCase()
    );

    expect(presetNames.some(n => n.includes('deep value'))).toBe(true);
    expect(presetNames.some(n => n.includes('compounder'))).toBe(true);
  });

  it('includes experimental presets', () => {
    const experimentalPresets = presets.filter(p => 
      (p.content as Record<string, unknown>).tier === 'experimental'
    );

    expect(experimentalPresets.length).toBeGreaterThan(0);
  });

  it('has consistent naming convention (kebab-case or snake_case filenames)', () => {
    const validPattern = /^[a-z0-9_-]+\.json$/;

    for (const { filename } of presets) {
      expect(filename).toMatch(validPattern);
    }
  });

  it('validated presets should have regime_overlay_recommended field', () => {
    const validatedPresets = presets.filter(p => 
      (p.content as Record<string, unknown>).tier === 'validated'
    );

    for (const { filename, content } of validatedPresets) {
      const preset = content as Record<string, unknown>;
      expect(
        preset.regime_overlay_recommended,
        `${filename} should have regime_overlay_recommended`
      ).toBeDefined();
    }
  });
});

describe('Preset Files Metadata', () => {
  const presets = loadAllPresetFiles();

  it('all presets have at least one filter or threshold defined', () => {
    for (const { filename, content } of presets) {
      const preset = content as Record<string, unknown>;
      const hasFilters = preset.filters && Object.keys(preset.filters as object).length > 0;
      const hasThresholds = preset.fundamental_thresholds && Object.keys(preset.fundamental_thresholds as object).length > 0;

      expect(
        hasFilters || hasThresholds,
        `${filename} should have filters or fundamental_thresholds`
      ).toBe(true);
    }
  });

  it('notes field is array of strings when present', () => {
    for (const { content } of presets) {
      const preset = content as Record<string, unknown>;
      if (preset.notes !== undefined) {
        expect(Array.isArray(preset.notes)).toBe(true);
        for (const note of preset.notes as unknown[]) {
          expect(typeof note).toBe('string');
        }
      }
    }
  });
});
