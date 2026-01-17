/* eslint-disable */
/**
 * AUTO-GENERATED from run.v1.schema.json
 * DO NOT EDIT MANUALLY
 */

export interface RunV1SchemaJson {
  /**
   * Stable ID, e.g. YYYY-MM-DD__hash
   */
  run_id: string;
  run_date: string;
  /**
   * Last trading day used for prices/scores
   */
  as_of_date: string;
  provider: {
    name: 'finnhub' | 'yfinance' | 'hybrid';
    cache_policy: {
      prices_ttl_hours: number;
      fundamentals_ttl_days: number;
      news_ttl_minutes: number;
    };
    rate_limit_observed?: {
      max_concurrency?: number;
      requests_made?: number;
    };
  };
  mode: {
    model_version: string;
    label: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF';
    score: number;
    confidence: number;
    benchmark: string;
    features: {
      ma50?: number;
      ma200?: number | null;
      vol20?: number | null;
      vol60?: number | null;
      breadth?: number | null;
    };
  };
  data_quality_summary: {
    avg_data_quality_score: number;
    pct_high: number;
    pct_medium: number;
    pct_low: number;
    tickers_with_critical_fallback: string[];
    most_missing_metrics: string[];
    generated_at: string;
    universe_name: string;
  };
  universe: {
    definition: {
      /**
       * e.g. S&P500 rank 50-150
       */
      name: string;
      selection_rule: string;
      version?: string;
    };
    /**
     * @minItems 1
     */
    symbols: [string, ...string[]];
  };
  benchmark: {
    type: 'index' | 'proxy_instrument';
    name: string;
    /**
     * Finnhub symbol mapping stored in config
     */
    provider_symbol: string;
    notes?: string;
  };
  /**
   * Execution metadata for the scoring pipeline
   */
  pipeline?: {
    top_k?: number | null;
    max_symbols_per_run?: number | null;
    truncated?: boolean;
    original_symbol_count?: number;
    scored_symbol_count?: number;
    warnings?: string[];
    request_budget?: {
      estimated_requests?: number;
      actual_requests?: number;
      fundamentals_cache_hit_rate?: number;
      technical_cache_hit_rate?: number;
      fundamentals_cache_hits?: number;
      technical_cache_hits?: number;
    };
  };
  /**
   * One entry per symbol
   */
  scores: {
    symbol: string;
    total_score: number;
    is_scan_only?: boolean;
    breakdown: {
      fundamental: number;
      technical: number;
    };
    evidence: {
      valuation: number;
      quality: number;
      technical: number;
      risk: number;
    };
    /**
     * Preferred: coverage of valuation inputs (PE/PB/PS) used to compute Value pillar
     */
    valuation_input_coverage?: {
      present?: string[];
      missing?: string[];
      strategy_used?: 'full' | 'partial' | 'fallback_neutral';
    } | null;
    /**
     * Deprecated alias for valuation_input_coverage
     */
    value_input_coverage?: {
      present?: string[];
      missing?: string[];
      strategy_used?: 'full' | 'partial' | 'fallback_neutral';
    } | null;
    data_quality: {
      data_quality_score: number;
      data_quality_confidence: number;
      completeness_ratio: number;
      imputed_ratio: number;
      missing_critical: string[];
      metrics: {
        [k: string]: {
          value?: number | null;
          source?: string;
          confidence?: number;
          isImputed?: boolean;
          isMissing?: boolean;
          notes?: string;
        };
      };
      missing_fields?: string[];
      /**
       * @maxItems 10
       */
      assumptions?:
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string];
      /**
       * Must be 'adjusted' for return/indicator consistency
       */
      adjusted_price_mode?: 'adjusted' | 'raw' | 'mixed';
    };
    /**
     * Price target calculated from sector-relative multiples
     */
    price_target?: {
      current_price?: number;
      fair_value?: number;
      /**
       * Decimal, e.g. 0.15 for 15%
       */
      upside_pct?: number;
      target_buy_price?: number;
      target_sell_price?: number;
      expected_return_pct?: number;
      holding_period_months?: number;
      target_date?: string;
      confidence?: 'high' | 'medium' | 'low';
      requires_deep_analysis?: boolean;
      deep_analysis_reasons?: string[];
    } | null;
    /**
     * Debuggable inputs and component-level details for price targets
     */
    price_target_diagnostics?: {
      inputs?: {
        pe_ratio?: number | null;
        pb_ratio?: number | null;
        ps_ratio?: number | null;
        eps?: number | null;
        book_value_per_share?: number | null;
        revenue_per_share?: number | null;
        sector?: string | null;
        industry?: string | null;
      };
      medians?: {
        source?: 'sector' | 'global';
        fallback_reason?: 'sector_sample_too_small' | 'missing_sector' | null;
        sector?: {
          median_pe?: number | null;
          median_pb?: number | null;
          median_ps?: number | null;
          sample_size?: number | null;
        };
        global?: {
          median_pe?: number | null;
          median_pb?: number | null;
          median_ps?: number | null;
          sample_size?: number | null;
        };
      };
      components?: {
        pe?: {
          included?: boolean;
          weight?: number;
          value?: number | null;
          clamped?: boolean | null;
          reason?: string | null;
        };
        pb?: {
          included?: boolean;
          weight?: number;
          value?: number | null;
          clamped?: boolean | null;
          reason?: string | null;
        };
        ps?: {
          included?: boolean;
          weight?: number;
          value?: number | null;
          clamped?: boolean | null;
          reason?: string | null;
        };
      };
      fair_value?: {
        raw?: number | null;
        bounded?: number | null;
        min?: number;
        max?: number;
        was_clamped?: boolean;
      };
    } | null;
    /**
     * Optional company name from provider or mapping
     */
    company_name?: string;
    /**
     * Optional industry/sector name
     */
    industry?: string;
  }[];
  selections: {
    /**
     * @minItems 5
     * @maxItems 5
     */
    top5: [string, string, string, string, string];
    /**
     * @minItems 10
     * @maxItems 10
     */
    top10: [string, string, string, string, string, string, string, string, string, string];
    /**
     * @minItems 15
     * @maxItems 15
     */
    top15: [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string
    ];
    /**
     * Deterministic seeded selection
     */
    pick_of_the_day: string;
  };
  flags: {
    user_documents_missing: string[];
    prompt_injection_suspected: {
      symbol: string;
      source: 'news';
      pattern_hit: string;
    }[];
  };
  integrity?: {
    score_version: string;
    config_hash: string;
    /**
     * Hash of normalized provider inputs used for this run
     */
    inputs_hash: string;
  };
}
