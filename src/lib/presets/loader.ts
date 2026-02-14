import fs from 'fs';
import path from 'path';

export type PresetConfig = {
  id: string;
  name: string;
  description: string;
  tier?: 'validated' | 'experimental';
  regime_overlay_recommended: boolean;
  pillar_weights: {
    valuation: number;
    quality: number;
    technical: number;
    risk: number;
  };
  fundamental_thresholds?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  diversification?: Record<string, unknown>;
};

const TIER_MAPPING: Record<string, 'validated' | 'experimental'> = {
  'momentum-hybrid': 'validated',
  'hybrid': 'validated',
  'deep_value': 'validated',
  'deep-value': 'validated',
  'compounder': 'validated',
  'shield': 'experimental',
  'garp': 'experimental',
  'dividend_quality': 'experimental',
};

/**
 * Load all preset configs from config/presets/
 */
export async function loadAllPresets(): Promise<PresetConfig[]> {
  const dir = path.join(process.cwd(), 'config/presets');

  if (!fs.existsSync(dir)) {
    console.warn(`Presets directory not found: ${dir}`);
    return [];
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

  return files.map(f => {
    try {
      const filePath = path.join(dir, f);
      const content = fs.readFileSync(filePath, 'utf-8');
      const id = f.replace('.json', '');
      const parsed = JSON.parse(content) as Omit<PresetConfig, 'id' | 'tier' | 'regime_overlay_recommended'> & {
        regime_overlay_recommended?: boolean;
      };

      return {
        id,
        ...parsed,
        tier: (parsed as any).tier || TIER_MAPPING[id] || 'experimental',
        regime_overlay_recommended: parsed.regime_overlay_recommended ?? false,
      };
    } catch (error) {
      console.error(`Failed to load preset ${f}:`, error);
      return null;
    }
  }).filter(Boolean) as PresetConfig[];
}
