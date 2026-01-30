'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { PriceTargetCard } from './PriceTargetCard';
import { ScoreBreakdownModal } from './ScoreBreakdownModal';
import { MiniPerfChart } from './MiniPerfChart';
import { InlineMiniPerfChart } from './InlineMiniPerfChart';
import { buildScoreBreakdown } from '@/lib/scoreBreakdown';
import { formatPercent } from '@/lib/percent';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';
import type { SymbolDelta } from '@/lib/runDelta';

const interpretationColors = {
  high: 'border-accent-green/50 bg-accent-green/10 text-accent-green',
  medium: 'border-accent-gold/50 bg-accent-gold/10 text-accent-gold',
  low: 'border-accent-red/50 bg-accent-red/10 text-accent-red',
};

function getScoreColor(value: number): string {
  if (value >= 70) return 'text-accent-green';
  if (value >= 50) return 'text-accent-gold';
  return 'text-accent-red';
}

function getScoreBgColor(value: number): string {
  if (value >= 70) return 'bg-accent-green/10 border-accent-green/50';
  if (value >= 50) return 'bg-accent-gold/10 border-accent-gold/50';
  return 'bg-accent-red/10 border-accent-red/50';
}

function DataQualityBadge({ score }: { score: number }) {
  const label = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded border ${interpretationColors[label]}`}
      title={`Data Quality ${label} (${score.toFixed(1)})`}
    >
      DQ {score.toFixed(0)}
    </span>
  );
}

function DeltaLabel({ value, isPercent = false }: { value: number | null | undefined; isPercent?: boolean }) {
  if (value === null || value === undefined) {
    return <span className="text-[10px] text-text-muted">—</span>;
  }
  const color = value > 0 ? 'text-accent-green' : value < 0 ? 'text-accent-red' : 'text-text-secondary';
  const formatted = isPercent ? formatPercent(value, { signed: true }) : `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
  return <span className={`text-[11px] font-semibold ${color}`}>Δ {formatted}</span>;
}

type ScoreEntry = RunV1SchemaJson['scores'][number];

type CardItem = {
  score: ScoreEntry;
  rank: number;
  isPickOfDay?: boolean;
  delta?: SymbolDelta;
};

type Props = {
  topScores: CardItem[];
  tableScores: CardItem[];
};

export function ScoreBoardClient({ topScores, tableScores }: Props) {
  const [selected, setSelected] = useState<ScoreEntry | null>(null);
  const breakdown = useMemo(() => (selected ? buildScoreBreakdown(selected) : null), [selected]);

  const getReturnColor = (pct: number | undefined) => {
    if (pct === undefined || pct === null) return 'text-text-muted';
    if (pct >= 0.15) return 'text-accent-green';
    if (pct >= 0.08) return 'text-accent-gold';
    return 'text-text-secondary';
  };

  const onOpen = (event: MouseEvent, score: ScoreEntry) => {
    event.preventDefault();
    event.stopPropagation();
    setSelected(score);
  };

  const closeModal = () => setSelected(null);

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 mb-10">
        {topScores.length === 0 && (
          <div className="col-span-full rounded-lg border border-navy-700 bg-navy-800 p-4 text-sm text-text-muted">
            No symbols match the current filters.
          </div>
        )}
        {topScores.map(({ score, rank, delta, isPickOfDay }) => {
          const { valuation, quality, technical, risk } = score.evidence;
          const companyName = score.company_name || score.symbol;
          const dqScore = score.data_quality?.data_quality_score ?? 0;
          const priceTarget = score.price_target ?? null;
          const deltaTotal = delta?.deltaTotal ?? null;
          const deltaReturn = delta?.deltaReturn ?? null;
          const confidenceChange = delta?.changedConfidence ?? null;
          const deepAnalysisChange = delta?.changedDeepAnalysis ?? null;

          return (
            <Link
              href={`/briefing/${score.symbol}`}
              key={score.symbol}
              className={`block rounded-xl border p-5 transition-all hover:border-navy-500 bg-navy-800 min-w-0 ${
                isPickOfDay ? 'border-accent-blue ring-2 ring-accent-blue/20' : 'border-navy-700'
              }`}
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-text-muted">#{rank}</span>
                    <h3 className="text-lg font-semibold text-text-primary">{score.symbol}</h3>
                    {isPickOfDay && (
                      <span className="rounded px-2 py-0.5 text-[10px] border border-slate-500 bg-slate-600 text-white">
                        TOP CONVICTION
                      </span>
                    )}
                    <DataQualityBadge score={dqScore} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-text-secondary">{companyName}</p>
                    </div>
                <div className="ml-4 text-right">
                  <button
                    type="button"
                    onClick={(e) => onOpen(e, score)}
                    className={`text-2xl font-bold ${getScoreColor(score.total_score)} hover:underline`}
                  >
                    {score.total_score.toFixed(1)}
                  </button>
                  <div className="flex items-center justify-end gap-2 text-[10px] uppercase tracking-wider text-text-muted">
                    <span>Total</span>
                    <DeltaLabel value={deltaTotal} />
                  </div>
                </div>
              </div>

              {/* Mini Performance Chart */}
              <div className="my-3">
                <InlineMiniPerfChart 
                  symbol={score.symbol}
                  height={60}
                  showReturnBadge={true}
                  className="rounded-md border border-navy-700 bg-navy-900/50"
                />
              </div>

              <div className="mb-4 border-t border-navy-700 pt-4">
                <div className="mb-3 text-[10px] uppercase tracking-wider text-text-muted">Evidence Pillars</div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Value', value: valuation },
                    { label: 'Quality', value: quality },
                    { label: 'Tech', value: technical },
                    { label: 'Risk', value: risk },
                  ].map(({ label, value }) => (
                    <div key={label} className={`rounded-lg border p-2 text-center ${getScoreBgColor(value)}`}>
                      <div className={`text-lg font-semibold ${getScoreColor(value)}`}>{value.toFixed(0)}</div>
                      <div className="text-[10px] text-text-muted">{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {priceTarget && (
                <div className="mt-4 border-t border-dashed border-slate-600 pt-3">
                  <PriceTargetCard
                    {...priceTarget}
                    returnDelta={deltaReturn}
                    confidenceChange={confidenceChange}
                    deepAnalysisChange={deepAnalysisChange}
                  />
                </div>
              )}

              {score.data_quality?.missing_fields && score.data_quality.missing_fields.length > 0 && (
                <p className="mt-3 flex items-center gap-1 text-xs text-accent-gold">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Some data unavailable
                </p>
              )}
            </Link>
          );
        })}
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold text-text-primary">Top 10 Ranking (after filters)</h3>
        <div className="overflow-hidden rounded-xl border border-navy-700 bg-navy-800">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-navy-700/50">
                  {['#', 'Symbol', 'Total', 'Fund.', 'Tech.', 'Trade Target', 'Return', 'Horizon'].map((label) => (
                    <th
                      key={label}
                      className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-text-muted"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-700">
                {tableScores.map(({ score, rank, delta }) => {
                  const symbol = score.symbol;
                  const companyName = score.company_name || symbol;
                  const priceTarget = score.price_target ?? null;

                  return (
                    <tr key={symbol} className="transition-colors hover:bg-navy-700/30">
                      <td className="px-4 py-3 font-mono text-sm text-text-muted">{rank}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="text-sm font-medium text-text-primary">{symbol}</div>
                            <div className="text-xs text-text-muted">{companyName}</div>
                          </div>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right text-sm font-semibold ${getScoreColor(score.total_score)}`}>
                        <button
                          type="button"
                          onClick={(e) => onOpen(e, score)}
                          className="hover:underline"
                        >
                          {score.total_score.toFixed(1)}
                        </button>
                        <div className="mt-0.5">
                          <DeltaLabel value={delta?.deltaTotal ?? null} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-text-secondary">
                        {score.breakdown.fundamental.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-text-secondary">
                        {score.breakdown.technical.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">
                        {priceTarget?.target_sell_price ? `$${priceTarget.target_sell_price.toFixed(2)}` : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right text-sm font-medium ${getReturnColor(priceTarget?.expected_return_pct)}`}>
                        <div>
                          {priceTarget ? formatPercent(priceTarget.expected_return_pct, { signed: true }) : '—'}
                        </div>
                        <div className="mt-0.5">
                          <DeltaLabel value={priceTarget ? delta?.deltaReturn ?? null : null} isPercent />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-text-muted">
                        {priceTarget ? `${priceTarget.holding_period_months}m` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {breakdown && <ScoreBreakdownModal breakdown={breakdown} onClose={closeModal} />}
    </>
  );
}
