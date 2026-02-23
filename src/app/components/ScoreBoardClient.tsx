'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { PriceTargetCard } from './PriceTargetCard';
import { ScoreBreakdownModal } from './ScoreBreakdownModal';
import { InlineMiniPerfChart } from './InlineMiniPerfChart';
import { buildScoreBreakdown } from '@/lib/scoreBreakdown';
import { formatPercent } from '@/lib/percent';
import { convertFromUsd, formatMoney } from '@/lib/currency/client';
import { useDisplayCurrency } from '@/lib/currency/useDisplayCurrency';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';
import type { SymbolDelta } from '@/lib/runDelta';

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
  const label = score >= 90 ? 'high' : score >= 70 ? 'medium' : 'low';
  const interpretationColors = {
    high: 'border-accent-green/50 bg-accent-green/10 text-accent-green',
    medium: 'border-accent-gold/50 bg-accent-gold/10 text-accent-gold',
    low: 'border-accent-red/50 bg-accent-red/10 text-accent-red',
  };
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
  if (Math.abs(value) < 0.01) {
    return <span className="text-[10px] text-text-muted">—</span>;
  }
  const color = value > 0 ? 'text-accent-green' : 'text-accent-red';
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
  qualityBlocked?: boolean;
};

export function ScoreBoardClient({ topScores, tableScores, qualityBlocked = false }: Props) {
  const [selected, setSelected] = useState<ScoreEntry | null>(null);
  const breakdown = useMemo(() => (selected ? buildScoreBreakdown(selected) : null), [selected]);
  const { displayCurrency, usdToEurRate } = useDisplayCurrency();
  const etfModeActive = useMemo(() => {
    const all = [...topScores, ...tableScores].map((item) => item.score);
    if (all.length === 0) return false;
    return all.every((score) => score.evidence.valuation === 0 && score.evidence.quality === 0);
  }, [tableScores, topScores]);

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
      {qualityBlocked && (
        <div className="mb-4 rounded-xl border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">
          Investierbare Aktionen sind deaktiviert, bis die Datenqualitaet wieder im sicheren Bereich liegt.
        </div>
      )}
      {etfModeActive && (
        <div className="mb-4 rounded-xl border border-accent-blue/40 bg-accent-blue/10 p-3 text-sm text-accent-blue">
          ETF-Modus aktiv: Valuation/Quality sind deaktiviert. Total Score = Durchschnitt aus Technical und Risk.
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 mb-10">
        {topScores.length === 0 && (
          <div className="col-span-full rounded-lg border border-navy-700 bg-navy-800 p-4 text-sm text-text-muted">
            No symbols match the current filters.
          </div>
        )}
        {topScores.map(({ score, rank, delta, isPickOfDay }) => {
          const { valuation, quality, technical, risk } = score.evidence;
          const companyName = score.company_name || score.symbol;
          const dqScore = score.data_quality?.data_quality_score ?? null;
          const dqForBadge = dqScore ?? 0;
          const priceTarget = score.price_target ?? null;
          const deltaTotal = delta?.deltaTotal ?? null;
          const deltaReturn = delta?.deltaReturn ?? null;
          const confidenceChange = delta?.changedConfidence ?? null;
          const deepAnalysisChange = delta?.changedDeepAnalysis ?? null;
          const missingCritical = score.data_quality?.missing_critical?.length ?? 0;
          const dataWarning = (() => {
            if (missingCritical > 0) return '⚠ Missing fundamentals';
            if (dqScore !== null && dqScore < 40) return '⚠ Incomplete data';
            if (dqScore !== null && dqScore < 70) return '⚠ Limited data';
            return null;
          })();
          const cardClassName = `block rounded-xl border p-5 transition-all hover:border-navy-500 bg-navy-800 min-w-0 ${
            isPickOfDay ? 'border-accent-blue ring-2 ring-accent-blue/20' : 'border-navy-700'
          } ${qualityBlocked ? 'opacity-80 cursor-not-allowed' : ''}`;
          const cardContent = (
            <>
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
                    <DataQualityBadge score={dqForBadge} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-text-secondary">{companyName}</p>
                    </div>
                <div className="ml-4 text-right">
                  <button
                    type="button"
                    onClick={qualityBlocked ? undefined : (e) => onOpen(e, score)}
                    disabled={qualityBlocked}
                    className={`text-2xl font-bold ${getScoreColor(score.total_score)} hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60`}
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

              {priceTarget && !qualityBlocked && (
                <div className="mt-4 border-t border-dashed border-slate-600 pt-3">
                  <PriceTargetCard
                    {...priceTarget}
                    returnDelta={deltaReturn}
                    confidenceChange={confidenceChange}
                    deepAnalysisChange={deepAnalysisChange}
                    displayCurrency={displayCurrency}
                    usdToEurRate={usdToEurRate}
                  />
                </div>
              )}

              {dataWarning && (
                <p className="mt-3 flex items-center gap-1 text-xs text-accent-gold">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {dataWarning}
                </p>
              )}
              {qualityBlocked && (
                <p className="mt-3 text-xs text-accent-red">
                  Price target und Drilldown sind fuer diesen Run deaktiviert.
                </p>
              )}
            </>
          );

          if (qualityBlocked) {
            return (
              <div key={score.symbol} className={cardClassName}>
                {cardContent}
              </div>
            );
          }

          return (
            <Link href={`/briefing/${score.symbol}`} key={score.symbol} className={cardClassName}>
              {cardContent}
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
                          onClick={qualityBlocked ? undefined : (e) => onOpen(e, score)}
                          disabled={qualityBlocked}
                          className="hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
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
                        {priceTarget?.target_sell_price
                          ? formatMoney(
                              convertFromUsd(priceTarget.target_sell_price, displayCurrency, usdToEurRate),
                              displayCurrency
                            )
                          : '—'}
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
