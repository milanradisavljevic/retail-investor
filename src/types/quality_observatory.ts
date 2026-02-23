export type ObservatoryConsistencySeverity = 'none' | 'conflict' | 'critical';
export type ObservatorySource = 'sec_edgar_bulk' | 'sec_edgar' | 'fmp' | 'yfinance' | 'unknown' | 'gap';

export interface ObservatoryConsistencySummary {
  universe: string;
  generated_at: string | null;
  comparable_pairs: number;
  conflict_pairs: number;
  critical_pairs: number;
  conflict_rate_pct: number;
  critical_rate_pct: number;
}

export interface ObservatoryStockRecord {
  universe_id: string;
  universe_name: string;
  symbol: string;
  has_snapshot: boolean;
  source: ObservatorySource;
  fetched_at: string | null;
  age_days: number | null;
  stale_30d: boolean;
  quality4_complete: boolean;
  valuation3_complete: boolean;
  quality_fields_present: number;
  valuation_fields_present: number;
  missing_quality_fields: string[];
  missing_valuation_fields: string[];
  data_quality_score: number | null;
  total_score: number | null;
  total_score_delta: number | null;
  quality_pillar_score: number | null;
  quality_pillar_delta: number | null;
  consistency_severity: ObservatoryConsistencySeverity;
  consistency_metrics: string[];
}

export interface ObservatoryUniverseScorecard {
  universe_id: string;
  universe_name: string;
  generated_at: string;
  symbol_count: number;
  symbols_with_snapshot: number;
  snapshot_coverage_pct: number;
  quality4_coverage_pct: number;
  valuation3_coverage_pct: number;
  data_quality: {
    avg: number | null;
    p25: number | null;
    p50: number | null;
    p75: number | null;
    pct_low: number | null;
  };
  freshness: {
    median_age_days: number | null;
    oldest_age_days: number | null;
    pct_older_than_7d: number;
    pct_older_than_30d: number;
  };
  source_mix: Record<ObservatorySource, number>;
  consistency: ObservatoryConsistencySummary | null;
  quality_gate: {
    status: 'green' | 'yellow' | 'red';
    blocked: boolean;
    reasons: string[];
  } | null;
}

export interface ObservatoryUniverseDrift {
  universe_id: string;
  universe_name: string;
  current_run_id: string | null;
  previous_run_id: string | null;
  avg_data_quality_delta: number | null;
  pct_low_delta: number | null;
  changed_symbols: number;
  improved_symbols: number;
  declined_symbols: number;
}

export interface ObservatoryStockDeltaLeader {
  symbol: string;
  delta: number;
  current: number;
  previous: number;
}

export interface ObservatoryDriftReport {
  generated_at: string;
  universes: ObservatoryUniverseDrift[];
  top_dq_improvers: ObservatoryStockDeltaLeader[];
  top_dq_decliners: ObservatoryStockDeltaLeader[];
}

export interface QualityObservatorySnapshot {
  generated_at: string;
  universe_ids: string[];
  universes: ObservatoryUniverseScorecard[];
  stocks: ObservatoryStockRecord[];
  drift: ObservatoryDriftReport;
}
