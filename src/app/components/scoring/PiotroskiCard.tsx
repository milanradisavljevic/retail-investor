import type { PiotroskiResult, PiotroskiCheck } from '@/scoring/formulas/piotroski';

interface PiotroskiCardProps {
  piotroski: PiotroskiResult | null | undefined;
}

type CheckKey = keyof PiotroskiResult['checks'];

type CheckMeta = {
  key: CheckKey;
  code: string;
  shortLabel: string;
};

const PROFITABILITY: CheckMeta[] = [
  { key: 'f1_roa', code: 'F1', shortLabel: 'ROA > 0' },
  { key: 'f2_cfo', code: 'F2', shortLabel: 'Operating CF > 0' },
  { key: 'f3_delta_roa', code: 'F3', shortLabel: 'ROA improved YoY' },
  { key: 'f4_accrual', code: 'F4', shortLabel: 'CFO > Net Income' },
];

const LEVERAGE_LIQUIDITY: CheckMeta[] = [
  { key: 'f5_delta_lever', code: 'F5', shortLabel: 'Debt ratio decreased' },
  { key: 'f6_delta_liquid', code: 'F6', shortLabel: 'Current ratio improved' },
  { key: 'f7_eq_offer', code: 'F7', shortLabel: 'No dilution' },
];

const EFFICIENCY: CheckMeta[] = [
  { key: 'f8_delta_margin', code: 'F8', shortLabel: 'Gross margin improved' },
  { key: 'f9_delta_turn', code: 'F9', shortLabel: 'Asset turnover improved' },
];

const ALL_CHECKS = [...PROFITABILITY, ...LEVERAGE_LIQUIDITY, ...EFFICIENCY];

function statusColorClass(passed: boolean | null): string {
  if (passed === true) return 'text-emerald-400';
  if (passed === false) return 'text-red-400';
  return 'text-zinc-500';
}

function statusSymbol(passed: boolean | null): string {
  if (passed === true) return '✓';
  if (passed === false) return '✗';
  return '—';
}

function scoreBadge(score: number): { tone: string; label: string } {
  if (score >= 8) return { tone: 'bg-emerald-900/50 text-emerald-400', label: 'Excellent' };
  if (score >= 6) return { tone: 'bg-emerald-900/30 text-emerald-300', label: 'Strong' };
  if (score >= 4) return { tone: 'bg-yellow-900/30 text-yellow-300', label: 'Average' };
  if (score >= 2) return { tone: 'bg-orange-900/30 text-orange-300', label: 'Weak' };
  return { tone: 'bg-red-900/30 text-red-400', label: 'Poor' };
}

function renderCheckRow(meta: CheckMeta, check: PiotroskiCheck) {
  const tone = statusColorClass(check.passed);
  const tooltip =
    check.passed === null ? 'Insufficient data' : check.detail ? check.detail : check.label;

  return (
    <div key={meta.key} className="flex items-center justify-between gap-3 text-sm">
      <div className="flex min-w-0 items-center gap-2 text-text-secondary">
        <span className={`text-[11px] ${tone}`} aria-hidden="true">
          ●
        </span>
        <span className="font-mono text-xs text-text-muted">{meta.code}</span>
        <span className="truncate text-text-primary">{meta.shortLabel}</span>
      </div>
      <span className={`text-sm font-semibold ${tone}`} title={tooltip}>
        {statusSymbol(check.passed)}
      </span>
    </div>
  );
}

export function PiotroskiCard({ piotroski }: PiotroskiCardProps) {
  if (!piotroski) {
    return (
      <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
        <p className="text-sm text-text-muted">Piotroski F-Score — No SEC data available</p>
      </div>
    );
  }

  const badge = scoreBadge(piotroski.score);

  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-text-primary">Piotroski F-Score</h3>
        <div className="text-right">
          <div className="text-lg font-semibold text-text-primary">
            {piotroski.score} / {piotroski.maxScore}
          </div>
          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${badge.tone}`}>
            {badge.label}
          </span>
        </div>
      </div>

      <div className="mb-4 flex gap-1">
        {ALL_CHECKS.map((meta) => {
          const check = piotroski.checks[meta.key];
          const bg =
            check.passed === true
              ? 'bg-emerald-500/90'
              : check.passed === false
                ? 'bg-red-500/90'
                : 'bg-zinc-600/80';
          return <span key={meta.key} className={`h-2 flex-1 rounded ${bg}`} />;
        })}
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="mb-2 text-xs uppercase tracking-wider text-text-muted">Profitability</h4>
          <div className="space-y-1">
            {PROFITABILITY.map((meta) => renderCheckRow(meta, piotroski.checks[meta.key]))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs uppercase tracking-wider text-text-muted">Leverage &amp; Liquidity</h4>
          <div className="space-y-1">
            {LEVERAGE_LIQUIDITY.map((meta) => renderCheckRow(meta, piotroski.checks[meta.key]))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs uppercase tracking-wider text-text-muted">Operating Efficiency</h4>
          <div className="space-y-1">
            {EFFICIENCY.map((meta) => renderCheckRow(meta, piotroski.checks[meta.key]))}
          </div>
        </div>
      </div>

      {(piotroski.fiscalYearCurrent || piotroski.fiscalYearPrior) && (
        <p className="mt-3 text-xs text-zinc-400">
          FY {piotroski.fiscalYearCurrent ?? '—'} vs FY {piotroski.fiscalYearPrior ?? '—'}
        </p>
      )}

      <p className="mt-2 text-xs text-zinc-500">
        Based on {piotroski.maxScore}/9 calculable checks. Source: SEC EDGAR annual filings.
      </p>
    </div>
  );
}
