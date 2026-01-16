export type ModeLabel = 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';

export interface ModeResult {
  model_version: string;
  label: ModeLabel;
  score: number;
  confidence: number;
  benchmark: string;
  features: {
    ma50: number | null;
    ma200: number | null;
    vol20: number | null;
    vol60: number | null;
    breadth: number | null;
  };
}
