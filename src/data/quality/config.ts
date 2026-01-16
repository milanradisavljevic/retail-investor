import { readFileSync } from 'fs';
import { join } from 'path';

export interface DataQualityConfig {
  required_metrics: string[];
  critical_metrics: string[];
  metric_defaults: Record<string, number>;
  min_samples: {
    industry: number;
    sector: number;
  };
}

let cachedConfig: DataQualityConfig | null = null;

export function getDataQualityConfig(): DataQualityConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = join(process.cwd(), 'config', 'data_quality.json');
  const raw = readFileSync(configPath, 'utf-8');
  cachedConfig = JSON.parse(raw) as DataQualityConfig;
  return cachedConfig;
}

export function resetDataQualityConfig(): void {
  cachedConfig = null;
}
