/* eslint-disable */
/**
 * AUTO-GENERATED from financial_packet.v1.schema.json
 * DO NOT EDIT MANUALLY
 */

export interface FinancialPacketV1SchemaJson {
  meta: {
    symbol: string;
    company_name?: string;
    period_end: string;
    period_type: 'annual' | 'quarterly' | 'ttm';
    fiscal_year?: number;
    fiscal_quarter?: number;
    /**
     * e.g. USD, EUR
     */
    currency: string;
    units: 'ones' | 'thousands' | 'millions' | 'billions';
    accounting_standard?: 'gaap' | 'ifrs' | 'unknown';
    source: {
      type: 'user_manual' | 'user_llm_extracted';
      original_files?: string[];
      notes?: string;
    };
  };
  balance_sheet: {
    total_assets: number;
    total_liabilities: number;
    total_equity: number;
    cash_and_equivalents: number;
    short_term_investments?: number;
    accounts_receivable?: number;
    inventory?: number;
    current_assets: number;
    current_liabilities: number;
    short_term_debt: number;
    long_term_debt: number;
    goodwill_and_intangibles?: number;
    shares_outstanding: number;
    line_items?: {
      [k: string]: number;
    };
  };
  income_statement: {
    revenue: number;
    gross_profit: number;
    operating_income: number;
    net_income: number;
    interest_expense?: number;
    income_tax_expense?: number;
    eps_basic?: number;
    eps_diluted?: number;
    line_items?: {
      [k: string]: number;
    };
  };
  cash_flow: {
    operating_cash_flow: number;
    capital_expenditures: number;
    investing_cash_flow: number;
    financing_cash_flow: number;
    dividends_paid?: number;
    share_repurchases?: number;
    line_items?: {
      [k: string]: number;
    };
  };
  /**
   * Optional. If present, must be reproducible from above.
   */
  derived_metrics?: {
    current_ratio?: number;
    debt_to_equity?: number;
    net_margin?: number;
    operating_margin?: number;
    free_cash_flow?: number;
  };
}
