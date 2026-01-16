/* eslint-disable */
/**
 * AUTO-GENERATED from llm_output.v1.schema.json
 * DO NOT EDIT MANUALLY
 */

export interface LlmOutputV1SchemaJson {
  meta: {
    model: string;
    temperature: 0;
    prompt_version: string;
    input_hash: string;
  };
  market_summary: {
    /**
     * @maxItems 3
     */
    bullets: [] | [string] | [string, string] | [string, string, string];
  };
  /**
   * Exactly 5 entries aligned with run.selections.top5
   *
   * @minItems 5
   * @maxItems 5
   */
  top5_narrative: [
    {
      symbol: string;
      why_now: string;
      /**
       * @maxItems 4
       */
      thesis_bullets: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
      /**
       * @maxItems 3
       */
      risk_bullets: [] | [string] | [string, string] | [string, string, string];
    },
    {
      symbol: string;
      why_now: string;
      /**
       * @maxItems 4
       */
      thesis_bullets: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
      /**
       * @maxItems 3
       */
      risk_bullets: [] | [string] | [string, string] | [string, string, string];
    },
    {
      symbol: string;
      why_now: string;
      /**
       * @maxItems 4
       */
      thesis_bullets: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
      /**
       * @maxItems 3
       */
      risk_bullets: [] | [string] | [string, string] | [string, string, string];
    },
    {
      symbol: string;
      why_now: string;
      /**
       * @maxItems 4
       */
      thesis_bullets: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
      /**
       * @maxItems 3
       */
      risk_bullets: [] | [string] | [string, string] | [string, string, string];
    },
    {
      symbol: string;
      why_now: string;
      /**
       * @maxItems 4
       */
      thesis_bullets: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
      /**
       * @maxItems 3
       */
      risk_bullets: [] | [string] | [string, string] | [string, string, string];
    }
  ];
  /**
   * Recommendation wording only; must not claim certainty.
   */
  recommendations: {
    symbol: string;
    label:
      | 'strong_recommendation_to_buy'
      | 'medium_recommendation_to_buy'
      | 'weak_recommendation_to_buy'
      | 'clear_hold'
      | 'uncertain_hold'
      | 'weak_recommendation_to_sell'
      | 'medium_recommendation_to_sell'
      | 'strong_recommendation_to_sell';
    confidence: number;
  }[];
  /**
   * @maxItems 2
   */
  document_requests:
    | []
    | [
        {
          symbol: string;
          reason: string;
          /**
           * @minItems 1
           */
          requested_docs: [
            'balance_sheet' | 'income_statement' | 'cash_flow' | 'notes' | 'segment_reporting',
            ...('balance_sheet' | 'income_statement' | 'cash_flow' | 'notes' | 'segment_reporting')[]
          ];
          /**
           * @minItems 1
           * @maxItems 5
           */
          questions:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string];
          priority: 'high' | 'medium';
          expected_insight_score: number;
        }
      ]
    | [
        {
          symbol: string;
          reason: string;
          /**
           * @minItems 1
           */
          requested_docs: [
            'balance_sheet' | 'income_statement' | 'cash_flow' | 'notes' | 'segment_reporting',
            ...('balance_sheet' | 'income_statement' | 'cash_flow' | 'notes' | 'segment_reporting')[]
          ];
          /**
           * @minItems 1
           * @maxItems 5
           */
          questions:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string];
          priority: 'high' | 'medium';
          expected_insight_score: number;
        },
        {
          symbol: string;
          reason: string;
          /**
           * @minItems 1
           */
          requested_docs: [
            'balance_sheet' | 'income_statement' | 'cash_flow' | 'notes' | 'segment_reporting',
            ...('balance_sheet' | 'income_statement' | 'cash_flow' | 'notes' | 'segment_reporting')[]
          ];
          /**
           * @minItems 1
           * @maxItems 5
           */
          questions:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string];
          priority: 'high' | 'medium';
          expected_insight_score: number;
        }
      ];
  constraints: {
    no_web_scraping: true;
    no_new_symbols: true;
    no_new_numbers: true;
  };
}
