'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PriceTargetCard } from './PriceTargetCard';
import { PeerComparison } from './PeerComparison';
import { ScoreHistory } from './ScoreHistory';
import { buildExplainSignals, type Signal } from '@/lib/explainSignals';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

function fmtNumber(
  value: number | null | undefined,
  opts: { prefix?: string; suffix?: string; decimals?: number } = {}
) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const decimals = opts.decimals ?? 2;
  const formatted = value.toFixed(decimals);
  return `${opts.prefix ?? ''}${formatted}${opts.suffix ?? ''}`;
}

function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  return value.toFixed(0);
}

function metricValue(
  metrics: RunV1SchemaJson['scores'][number]['data_quality']['metrics'] | undefined,
  keys: string[]
): number | null {
  if (!metrics) return null;
  for (const key of keys) {
    const value = metrics[key]?.value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

type ScoreHistoryPoint = {
  date: string;
  score: number;
};

interface Props {
  run: RunV1SchemaJson;
  score: RunV1SchemaJson['scores'][number];
  companyName?: string;
  scoreHistory: ScoreHistoryPoint[];
  prevSymbol: string | null;
  nextSymbol: string | null;
}

function getFilenameFromDisposition(
  contentDisposition: string | null,
  fallback: string
): string {
  if (!contentDisposition) return fallback;
  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1].replace(/["']/g, '').trim());
    } catch {
      return utfMatch[1].replace(/["']/g, '').trim();
    }
  }
  const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1]?.trim() || fallback;
}

function ScorePill({ label, value }: { label: string; value: number }) {
  const getScoreColor = (v: number) => {
    if (v >= 70) return 'text-accent-green';
    if (v >= 50) return 'text-accent-gold';
    return 'text-accent-red';
  };
  return (
    <div className="rounded-lg border border-navy-700 bg-navy-800 p-3 text-center">
      <div className={`text-xl font-semibold ${getScoreColor(value)}`}>{value.toFixed(1)}</div>
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
    </div>
  );
}

function SignalBadge({ severity }: { severity: Signal['severity'] }) {
  const styles: Record<Signal['severity'], string> = {
    good: 'bg-accent-green/15 text-accent-green border-accent-green/30',
    bad: 'bg-accent-red/15 text-accent-red border-accent-red/30',
    warn: 'bg-accent-gold/15 text-accent-gold border-accent-gold/30',
    info: 'bg-navy-700 text-text-secondary border-navy-600',
  };
  const label: Record<Signal['severity'], string> = {
    good: 'Positive',
    bad: 'Negative',
    warn: 'Warnung',
    info: 'Info',
  };
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] ${styles[severity]}`}>
      {label[severity]}
    </span>
  );
}

function SignalList({
  title,
  items,
  emptyLabel,
  badgeSeverity,
}: {
  title: string;
  items: Signal[];
  emptyLabel: string;
  badgeSeverity: Signal['severity'];
}) {
  return (
    <div className="rounded-lg border border-navy-700 bg-navy-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
        <SignalBadge severity={badgeSeverity} />
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((signal, idx) => (
            <li
              key={`${signal.label}-${idx}`}
              className="flex items-center justify-between gap-3 text-sm text-text-secondary"
            >
              <div className="flex-1">
                <div className="text-text-primary">{signal.label}</div>
                {signal.metric && (
                  <div className="text-[11px] text-text-muted">
                    {signal.metric}
                    {signal.value !== undefined ? ` · ${signal.value}` : ''}
                  </div>
                )}
              </div>
              <SignalBadge severity={signal.severity} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KeyMetricBadge({ label, value }: { label: string; value: string }) {
  const isMissing = value === '—';
  return (
    <div
      className={`rounded-md border px-2.5 py-1 text-xs ${
        isMissing
          ? 'border-navy-700 text-text-muted'
          : 'border-navy-600 text-text-secondary'
      }`}
    >
      <span className="mr-1 text-text-muted">{label}:</span>
      <span className={isMissing ? 'text-text-muted' : 'text-text-primary'}>{value}</span>
    </div>
  );
}

export function StockDetailView({
  run,
  score,
  companyName,
  scoreHistory,
  prevSymbol,
  nextSymbol,
}: Props) {
  const { t } = useTranslation();
  const [pdfLoading, setPdfLoading] = useState(false);
  const displayName = companyName ?? score.company_name ?? score.symbol;
  const dq = score.data_quality;
  const priceTarget = score.price_target;
  const diagnostics = score.price_target_diagnostics;
  const explain = buildExplainSignals(score, run);
  const isScanOnly = score.is_scan_only;
  const valueCoverage = score.valuation_input_coverage ?? score.value_input_coverage;

  const inputs = diagnostics?.inputs;
  const components = diagnostics?.components;
  const medians = diagnostics?.medians;
  const fairValueDiag = diagnostics?.fair_value;
  const metrics = dq.metrics;

  const marketCap = metricValue(metrics, ['marketCap', 'market_cap']);
  const peRatio = metricValue(metrics, ['peRatio', 'pe_ratio']) ?? inputs?.pe_ratio ?? null;
  const rawDividendYield = metricValue(metrics, ['dividendYield', 'dividend_yield']);
  const dividendYieldPct =
    rawDividendYield === null
      ? null
      : Math.abs(rawDividendYield) <= 1
        ? rawDividendYield * 100
        : rawDividendYield;
  const beta = metricValue(metrics, ['beta']);
  const low52w = metricValue(metrics, ['low52Week', 'fiftyTwoWeekLow', 'week52Low']);
  const high52w = metricValue(metrics, ['high52Week', 'fiftyTwoWeekHigh', 'week52High']);

  const range52w =
    low52w !== null && high52w !== null
      ? `${fmtNumber(low52w, { prefix: '$' })} - ${fmtNumber(high52w, { prefix: '$' })}`
      : '—';

  const handlePdfDownload = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const response = await fetch(`/api/export/pdf?symbol=${encodeURIComponent(score.symbol)}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = getFilenameFromDisposition(
        response.headers.get('Content-Disposition'),
        `INTRINSIC-Stock-${score.symbol}-${new Date().toISOString().slice(0, 10)}.pdf`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Stock PDF download failed', error);
      window.alert('PDF-Export fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <Link href="/" className="hover:text-text-primary">Dashboard</Link>
        <span>&gt;</span>
        <span>Aktie</span>
        <span>&gt;</span>
        <span className="font-medium text-text-primary">{score.symbol}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wider text-text-muted">{t('stockDetail.latestBriefing')}</p>
          <h1 className="text-2xl font-semibold text-text-primary">
            {displayName} <span className="text-text-muted">({score.symbol})</span>
          </h1>
          <p className="text-sm text-text-secondary">
            Universum: <span className="text-text-primary">{run.universe.definition.name}</span> · {run.as_of_date}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <KeyMetricBadge label="Market Cap" value={marketCap === null ? '—' : `$${formatCompactNumber(marketCap)}`} />
            <KeyMetricBadge label="P/E" value={peRatio === null ? '—' : fmtNumber(peRatio)} />
            <KeyMetricBadge
              label="Dividend Yield"
              value={dividendYieldPct === null ? '—' : fmtNumber(dividendYieldPct, { suffix: '%' })}
            />
            <KeyMetricBadge label="Beta" value={beta === null ? '—' : fmtNumber(beta)} />
            <KeyMetricBadge label="52W Range" value={range52w} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePdfDownload}
            disabled={pdfLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-navy-700 px-3 py-1 text-sm text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M10 3v8" strokeLinecap="round" />
              <path d="m6.5 8.5 3.5 3.5 3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 14.5h12" strokeLinecap="round" />
            </svg>
            <span>{pdfLoading ? 'Report wird generiert...' : 'PDF-Report'}</span>
          </button>
          <Link
            href="/"
            className="rounded-lg border border-navy-700 px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
          >
            ← {t('stockDetail.back')}
          </Link>
          <Link
            href={`/history?symbol=${score.symbol}`}
            className="rounded-lg border border-navy-700 px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
          >
            {t('stockDetail.openInHistory')}
          </Link>
          {prevSymbol ? (
            <Link
              href={`/stock/${prevSymbol}`}
              className="rounded-lg border border-navy-700 px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
            >
              Vorher: {prevSymbol}
            </Link>
          ) : (
            <span className="rounded-lg border border-navy-800 px-3 py-1 text-sm text-text-muted">Vorher: —</span>
          )}
          {nextSymbol ? (
            <Link
              href={`/stock/${nextSymbol}`}
              className="rounded-lg border border-navy-700 px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
            >
              Naechster: {nextSymbol}
            </Link>
          ) : (
            <span className="rounded-lg border border-navy-800 px-3 py-1 text-sm text-text-muted">Naechster: —</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
            <div className="mb-3 text-xs uppercase tracking-wider text-text-muted">{t('stockDetail.totalScore')}</div>
            <div className="text-3xl font-bold text-text-primary">{score.total_score.toFixed(1)}</div>
            <p className="text-sm text-text-secondary">
              {t('stockDetail.fundamental')} {score.breakdown.fundamental.toFixed(1)} · {t('stockDetail.technical')}{' '}
              {score.breakdown.technical.toFixed(1)}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ScorePill label={t('stockDetail.valuation')} value={score.evidence.valuation} />
              <ScorePill label={t('stockDetail.quality')} value={score.evidence.quality} />
              <ScorePill label={t('stockDetail.technical')} value={score.evidence.technical} />
              <ScorePill label={t('stockDetail.risk')} value={score.evidence.risk} />
            </div>
          </div>

          <PeerComparison run={run} currentScore={score} />

          <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
            <h3 className="mb-3 text-lg font-semibold text-text-primary">{t('stockDetail.whyThisScore')}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <SignalList
                title={t('stockDetail.positives')}
                items={explain.positives}
                emptyLabel={t('stockDetail.noPositives')}
                badgeSeverity="good"
              />
              <SignalList
                title={t('stockDetail.negatives')}
                items={explain.negatives}
                emptyLabel={t('stockDetail.noNegatives')}
                badgeSeverity="bad"
              />
            </div>
            <div className="mt-3">
              <SignalList
                title={t('stockDetail.warnings')}
                items={explain.warnings}
                emptyLabel={t('stockDetail.noWarnings')}
                badgeSeverity="warn"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {priceTarget ? (
            <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
              <h3 className="mb-3 text-lg font-semibold text-text-primary">{t('stockDetail.priceTarget')}</h3>
              <PriceTargetCard {...priceTarget} showDeepAnalysisWarning={true} />
            </div>
          ) : (
            <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
              <h3 className="mb-1 text-lg font-semibold text-text-primary">{t('stockDetail.priceTarget')}</h3>
              <p className="text-sm text-text-muted">
                {isScanOnly ? t('stockDetail.scanOnlyPhase') : t('stockDetail.priceTargetNotAvailable')}
              </p>
            </div>
          )}

          <ScoreHistory symbol={score.symbol} history={scoreHistory} />

          <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
            <h3 className="mb-3 text-lg font-semibold text-text-primary">{t('stockDetail.runContext')}</h3>
            <dl className="space-y-1 text-sm text-text-secondary">
              <div className="flex justify-between">
                <dt>{t('stockDetail.provider')}</dt>
                <dd className="text-text-primary">{run.provider.name.toUpperCase()}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t('stockDetail.requests')}</dt>
                <dd className="text-text-primary">
                  {run.provider.rate_limit_observed?.requests_made ?? t('stockDetail.requestsNA')}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t('stockDetail.runId')}</dt>
                <dd className="font-mono text-xs text-text-primary">{run.run_id}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div id="analysis" className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
          <h3 className="mb-3 text-lg font-semibold text-text-primary">{t('stockDetail.valuationInputs')}</h3>
          {valueCoverage && (
            <p className="mb-2 text-xs text-text-muted">
              {t('stockDetail.valueCoveragePresent').replace(
                '{present}',
                valueCoverage.present?.map((p) => p.toUpperCase()).join(', ') ||
                  t('stockDetail.valueCoveragePresentEmpty')
              )}
              {valueCoverage.missing && valueCoverage.missing.length > 0
                ? t('stockDetail.valueCoverageMissing').replace(
                    '{missing}',
                    valueCoverage.missing.map((m) => m.toUpperCase()).join(', ')
                  )
                : ''}
            </p>
          )}
          {diagnostics ? (
            <dl className="grid grid-cols-2 gap-3 text-sm text-text-secondary">
              {[
                [t('stockDetail.pe') + ' ' + t('stockDetail.ratio'), fmtNumber(inputs?.pe_ratio)],
                [t('stockDetail.pb') + ' ' + t('stockDetail.ratio'), fmtNumber(inputs?.pb_ratio)],
                [t('stockDetail.ps') + ' ' + t('stockDetail.ratio'), fmtNumber(inputs?.ps_ratio)],
                [t('stockDetail.eps'), fmtNumber(inputs?.eps)],
                [t('stockDetail.bookValue'), fmtNumber(inputs?.book_value_per_share)],
                [t('stockDetail.revenue'), fmtNumber(inputs?.revenue_per_share)],
                [t('stockDetail.sector'), inputs?.sector ?? '—'],
                [t('stockDetail.industry'), inputs?.industry ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="mb-0.5 text-[10px] uppercase tracking-wider text-text-muted">{label}</dt>
                  <dd className="text-text-primary">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-text-muted">{t('stockDetail.valuationInputsDescription')}</p>
          )}
        </div>

        <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
          <h3 className="mb-3 text-lg font-semibold text-text-primary">{t('stockDetail.valueDrivers')}</h3>
          {diagnostics ? (
            <div className="space-y-3 text-sm text-text-secondary">
              <div className="flex items-center justify-between">
                <span>{t('stockDetail.medianSource')}</span>
                <span className="text-text-primary">
                  {medians?.source === 'global' ? t('stockDetail.globalFallback') : t('stockDetail.sector')}{' '}
                  {medians?.fallback_reason
                    ? t('stockDetail.fallbackReason').replace('{reason}', medians.fallback_reason)
                    : ''}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-navy-700 bg-navy-700/40 p-2">
                  <div className="text-[10px] uppercase text-text-muted">{t('stockDetail.sectorMedians')}</div>
                  <div className="text-text-primary">
                    {t('stockDetail.sectorMediansDetails')
                      .replace('{pe}', fmtNumber(medians?.sector?.median_pe))
                      .replace('{pb}', fmtNumber(medians?.sector?.median_pb))
                      .replace('{ps}', fmtNumber(medians?.sector?.median_ps))}
                  </div>
                  <div className="text-xs text-text-muted">
                    {t('stockDetail.sampleSize').replace('{size}', String(medians?.sector?.sample_size ?? '—'))}
                  </div>
                </div>
                <div className="rounded-lg border border-navy-700 bg-navy-700/40 p-2">
                  <div className="text-[10px] uppercase text-text-muted">{t('stockDetail.globalMedians')}</div>
                  <div className="text-text-primary">
                    {t('stockDetail.globalMediansDetails')
                      .replace('{pe}', fmtNumber(medians?.global?.median_pe))
                      .replace('{pb}', fmtNumber(medians?.global?.median_pb))
                      .replace('{ps}', fmtNumber(medians?.global?.median_ps))}
                  </div>
                  <div className="text-xs text-text-muted">
                    {t('stockDetail.sampleSize').replace('{size}', String(medians?.global?.sample_size ?? '—'))}
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase text-text-muted">{t('stockDetail.componentContributions')}</div>
                <div className="space-y-1">
                  {(['pe', 'pb', 'ps'] as const).map((key) => {
                    const comp = components?.[key];
                    if (!comp) return null;
                    const label = key.toUpperCase();
                    return (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className={comp.included ? 'text-text-primary' : 'text-text-muted'}>
                          {comp.included
                            ? t('stockDetail.componentIncluded')
                                .replace('{label}', label)
                                .replace('{weight}', fmtNumber(comp.weight, { decimals: 2 }))
                                .replace(
                                  '{reasonSuffix}',
                                  !comp.included && comp.reason
                                    ? t('stockDetail.componentReason').replace('{reason}', comp.reason ?? '')
                                    : ''
                                )
                            : t('stockDetail.componentNotIncludedWithReason')
                                .replace('{label}', label)
                                .replace('{weight}', fmtNumber(comp.weight, { decimals: 2 }))
                                .replace('{reason}', comp.reason ?? '')}
                        </span>
                        <span className={comp.clamped ? 'text-accent-gold' : 'text-text-secondary'}>
                          {comp.included ? `$${fmtNumber(comp.value)}` : '—'}
                          {comp.clamped ? t('stockDetail.componentClamped') : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="border-t border-navy-700 pt-2 text-xs text-text-muted">
                {t('stockDetail.fairValueDetails')
                  .replace('{raw}', fmtNumber(fairValueDiag?.raw))
                  .replace('{bounded}', fmtNumber(fairValueDiag?.bounded))
                  .replace('{min}', fmtNumber(fairValueDiag?.min))
                  .replace('{max}', fmtNumber(fairValueDiag?.max))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">{t('stockDetail.valueDriversDescription')}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
          <h3 className="mb-3 text-lg font-semibold text-text-primary">{t('stockDetail.dataQuality')}</h3>
          <p className="mb-2 text-sm text-text-secondary">
            {t('stockDetail.qualityScore').replace('{score}', dq.data_quality_score.toFixed(1))}
          </p>
          {dq.missing_fields && dq.missing_fields.length > 0 && (
            <p className="mb-3 text-xs text-accent-gold">
              {t('stockDetail.missingFields').replace('{fields}', dq.missing_fields.join(', '))}
            </p>
          )}
          {dq.assumptions && dq.assumptions.length > 0 && (
            <div className="space-y-1 text-xs text-text-muted">
              {dq.assumptions.map((assumption, idx) => (
                <div key={idx}>{t('stockDetail.assumptionItem').replace('{assumption}', assumption)}</div>
              ))}
            </div>
          )}
        </div>

        {dq.metrics && Object.keys(dq.metrics).length > 0 && (
          <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
            <h3 className="mb-3 text-lg font-semibold text-text-primary">{t('stockDetail.metricQuality')}</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-text-muted">
                    <th className="px-2 py-1 text-left">{t('stockDetail.metric')}</th>
                    <th className="px-2 py-1 text-right">{t('stockDetail.value')}</th>
                    <th className="px-2 py-1 text-left">{t('stockDetail.source')}</th>
                    <th className="px-2 py-1 text-left">{t('stockDetail.notes')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-700">
                  {Object.entries(dq.metrics).map(([metric, info]) => (
                    <tr key={metric} className="text-text-secondary">
                      <td className="px-2 py-1 text-text-primary">{metric}</td>
                      <td className="px-2 py-1 text-right">
                        {info.value === null || info.value === undefined
                          ? t('stockDetail.metricValueNA')
                          : typeof info.value === 'number'
                            ? info.value.toFixed(2)
                            : String(info.value)}
                      </td>
                      <td className="px-2 py-1">{info.source ?? t('stockDetail.na')}</td>
                      <td className="px-2 py-1 text-xs text-text-muted">
                        {info.notes ?? (info.isImputed ? t('stockDetail.imputed') : '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
