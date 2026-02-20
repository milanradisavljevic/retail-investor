/**
 * Piotroski F-Score (separate signal, not a scoring pillar replacement).
 */

export interface PiotroskiCheck {
  passed: boolean | null;
  label: string;
  detail?: string;
}

export interface PiotroskiResult {
  score: number;
  maxScore: number;
  checks: {
    f1_roa: PiotroskiCheck;
    f2_cfo: PiotroskiCheck;
    f3_delta_roa: PiotroskiCheck;
    f4_accrual: PiotroskiCheck;
    f5_delta_lever: PiotroskiCheck;
    f6_delta_liquid: PiotroskiCheck;
    f7_eq_offer: PiotroskiCheck;
    f8_delta_margin: PiotroskiCheck;
    f9_delta_turn: PiotroskiCheck;
  };
  fiscalYearCurrent?: string;
  fiscalYearPrior?: string;
}

export interface SecEdgarData {
  netIncome?: number | null;
  totalAssets?: number | null;
  stockholdersEquity?: number | null;
  totalDebt?: number | null;
  revenue?: number | null;
  grossProfit?: number | null;
  operatingCashFlow?: number | null;
  capex?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  sharesOutstanding?: number | null;
  netIncome_py?: number | null;
  totalAssets_py?: number | null;
  stockholdersEquity_py?: number | null;
  totalDebt_py?: number | null;
  revenue_py?: number | null;
  grossProfit_py?: number | null;
  currentAssets_py?: number | null;
  currentLiabilities_py?: number | null;
  sharesOutstanding_py?: number | null;
  fiscalYearCurrent?: string;
  fiscalYearPrior?: string;
}

// Backward-compatible alias for existing call sites.
export type PiotroskiInputs = SecEdgarData;

function calcCheck(
  a: number | null | undefined,
  b: number | null | undefined,
  test: (a: number, b: number) => boolean | null,
  label: string,
  detailFn?: (a: number, b: number) => string
): PiotroskiCheck {
  if (a == null || b == null) return { passed: null, label };
  const result = test(a, b);
  return {
    passed: result,
    label,
    detail: result !== null && detailFn ? detailFn(a, b) : undefined,
  };
}

function calcCheckSingle(
  a: number | null | undefined,
  test: (a: number) => boolean,
  label: string,
  detailFn?: (a: number) => string
): PiotroskiCheck {
  if (a == null) return { passed: null, label };
  const result = test(a);
  return { passed: result, label, detail: detailFn ? detailFn(a) : undefined };
}

function calcCheckYoY(
  currA: number | null | undefined,
  currB: number | null | undefined,
  prevA: number | null | undefined,
  prevB: number | null | undefined,
  test: (a: number, b: number, pa: number, pb: number) => boolean | null,
  label: string
): PiotroskiCheck {
  if (currA == null || currB == null || prevA == null || prevB == null) {
    return { passed: null, label };
  }
  const result = test(currA, currB, prevA, prevB);
  return { passed: result, label };
}

function formatCurrency(v: number): string {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toLocaleString();
}

function formatNumber(v: number): string {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toLocaleString();
}

export function calculatePiotroski(data: SecEdgarData): PiotroskiResult {
  const checks: PiotroskiResult['checks'] = {
    f1_roa: calcCheck(
      data.netIncome,
      data.totalAssets,
      (ni, ta) => (ta !== 0 ? ni / ta > 0 : null),
      'Profitability: ROA > 0',
      (ni, ta) => `ROA: ${((ni / ta) * 100).toFixed(1)}%`
    ),
    f2_cfo: calcCheckSingle(
      data.operatingCashFlow,
      (cfo) => cfo > 0,
      'Profitability: Operating CF > 0',
      (cfo) => `OCF: ${formatCurrency(cfo)}`
    ),
    f3_delta_roa: calcCheckYoY(
      data.netIncome,
      data.totalAssets,
      data.netIncome_py,
      data.totalAssets_py,
      (ni, ta, niPy, taPy) => {
        if (ta === 0 || taPy === 0) return null;
        return ni / ta > niPy / taPy;
      },
      'Profitability: ROA improved YoY'
    ),
    f4_accrual: calcCheck(
      data.operatingCashFlow,
      data.netIncome,
      (cfo, ni) => cfo > ni,
      'Profitability: CFO > Net Income (accrual quality)',
      (cfo, ni) => `CFO ${formatCurrency(cfo)} vs NI ${formatCurrency(ni)}`
    ),
    f5_delta_lever: calcCheckYoY(
      data.totalDebt,
      data.totalAssets,
      data.totalDebt_py,
      data.totalAssets_py,
      (d, a, dPy, aPy) => {
        if (a === 0 || aPy === 0) return null;
        return d / a < dPy / aPy;
      },
      'Leverage: LT Debt/Assets decreased YoY'
    ),
    f6_delta_liquid: calcCheckYoY(
      data.currentAssets,
      data.currentLiabilities,
      data.currentAssets_py,
      data.currentLiabilities_py,
      (ca, cl, caPy, clPy) => {
        if (cl === 0 || clPy === 0) return null;
        return ca / cl > caPy / clPy;
      },
      'Liquidity: Current Ratio improved YoY'
    ),
    f7_eq_offer: calcCheck(
      data.sharesOutstanding,
      data.sharesOutstanding_py,
      (curr, prev) => curr <= prev,
      'Leverage: No new shares issued',
      (curr, prev) => `Shares: ${formatNumber(curr)} vs prior ${formatNumber(prev)}`
    ),
    f8_delta_margin: calcCheckYoY(
      data.grossProfit,
      data.revenue,
      data.grossProfit_py,
      data.revenue_py,
      (gp, rev, gpPy, revPy) => {
        if (rev === 0 || revPy === 0) return null;
        return gp / rev > gpPy / revPy;
      },
      'Efficiency: Gross Margin improved YoY'
    ),
    f9_delta_turn: calcCheckYoY(
      data.revenue,
      data.totalAssets,
      data.revenue_py,
      data.totalAssets_py,
      (rev, ta, revPy, taPy) => {
        if (ta === 0 || taPy === 0) return null;
        return rev / ta > revPy / taPy;
      },
      'Efficiency: Asset Turnover improved YoY'
    ),
  };

  const allChecks = Object.values(checks);
  const calculable = allChecks.filter((c) => c.passed !== null);
  const passed = calculable.filter((c) => c.passed === true);

  return {
    score: passed.length,
    maxScore: calculable.length,
    checks,
    fiscalYearCurrent: data.fiscalYearCurrent,
    fiscalYearPrior: data.fiscalYearPrior,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pickNumber(data: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const num = asNumber(data[key]);
    if (num !== null) return num;
  }
  return null;
}

function pickString(data: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = data[key];
    if (typeof raw === 'string' && raw.trim()) return raw;
  }
  return undefined;
}

/**
 * Maps raw fundamentals payloads (or their `secEdgar` block) to Piotroski input data.
 */
export function mapFundamentalsToPiotroski(data: Record<string, unknown>): SecEdgarData {
  const secEdgar = asRecord(data.secEdgar) ?? data;

  return {
    netIncome: pickNumber(secEdgar, ['netIncome', 'net_income']),
    totalAssets: pickNumber(secEdgar, ['totalAssets', 'total_assets', 'assets']),
    stockholdersEquity: pickNumber(secEdgar, [
      'stockholdersEquity',
      'stockholders_equity',
      'totalEquity',
      'equity',
    ]),
    totalDebt: pickNumber(secEdgar, ['totalDebt', 'total_debt', 'debt']),
    revenue: pickNumber(secEdgar, ['revenue', 'revenue_ttm']),
    grossProfit: pickNumber(secEdgar, ['grossProfit', 'gross_profit']),
    operatingCashFlow: pickNumber(secEdgar, ['operatingCashFlow', 'operating_cash_flow', 'ocf']),
    capex: pickNumber(secEdgar, ['capex']),
    currentAssets: pickNumber(secEdgar, ['currentAssets', 'current_assets']),
    currentLiabilities: pickNumber(secEdgar, ['currentLiabilities', 'current_liabilities']),
    sharesOutstanding: pickNumber(secEdgar, ['sharesOutstanding', 'shares_outstanding']),
    netIncome_py: pickNumber(secEdgar, ['netIncome_py', 'netIncomePy', 'net_income_py']),
    totalAssets_py: pickNumber(secEdgar, ['totalAssets_py', 'totalAssetsPy', 'total_assets_py']),
    stockholdersEquity_py: pickNumber(secEdgar, [
      'stockholdersEquity_py',
      'stockholdersEquityPy',
      'stockholders_equity_py',
      'totalEquity_py',
    ]),
    totalDebt_py: pickNumber(secEdgar, ['totalDebt_py', 'totalDebtPy', 'total_debt_py']),
    revenue_py: pickNumber(secEdgar, ['revenue_py', 'revenuePy']),
    grossProfit_py: pickNumber(secEdgar, ['grossProfit_py', 'grossProfitPy', 'gross_profit_py']),
    currentAssets_py: pickNumber(secEdgar, ['currentAssets_py', 'currentAssetsPy', 'current_assets_py']),
    currentLiabilities_py: pickNumber(secEdgar, [
      'currentLiabilities_py',
      'currentLiabilitiesPy',
      'current_liabilities_py',
    ]),
    sharesOutstanding_py: pickNumber(secEdgar, [
      'sharesOutstanding_py',
      'sharesOutstandingPy',
      'shares_outstanding_py',
    ]),
    fiscalYearCurrent: pickString(data, ['fiscalYearCurrent', '_fiscal_year_end']) ?? pickString(secEdgar, ['fiscalYearCurrent']),
    fiscalYearPrior: pickString(data, ['fiscalYearPrior']) ?? pickString(secEdgar, ['fiscalYearPrior']),
  };
}

/**
 * Backward-compatible alias.
 */
export function calculatePiotroskiFScore(inputs: PiotroskiInputs): PiotroskiResult {
  return calculatePiotroski(inputs);
}

export function getPiotroskiLabel(score: number): string {
  if (score >= 8) return 'Excellent';
  if (score >= 7) return 'Strong';
  if (score >= 5) return 'Average';
  if (score >= 3) return 'Weak';
  return 'Poor';
}
