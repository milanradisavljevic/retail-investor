'use client';

import Link from 'next/link';
import { PriceTargetCard } from './PriceTargetCard';
import { buildExplainSignals, type Signal } from '@/lib/explainSignals';
import { getCompanyName } from '@/core/company';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

function fmtNumber(value: number | null | undefined, opts: { prefix?: string; suffix?: string; decimals?: number } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const decimals = opts.decimals ?? 2;
  const formatted = value.toFixed(decimals);
  return `${opts.prefix ?? ''}${formatted}${opts.suffix ?? ''}`;
}

interface Props {
  run: RunV1SchemaJson;
  score: RunV1SchemaJson['scores'][number];
}

function ScorePill({ label, value }: { label: string; value: number }) {
  const getScoreColor = (v: number) => {
    if (v >= 70) return 'text-accent-green';
    if (v >= 50) return 'text-accent-gold';
    return 'text-accent-red';
  };
  return (
    <div className="text-center p-3 rounded-lg border border-navy-700 bg-navy-800">
      <div className={`text-xl font-semibold ${getScoreColor(value)}`}>{value.toFixed(1)}</div>
      <div className="text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
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
    warn: 'Warning',
    info: 'Info',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border ${styles[severity]}`}>
      {label[severity]}
    </span>
  );
}

function SignalList({ title, items, emptyLabel }: { title: string; items: Signal[]; emptyLabel: string }) {
  return (
    <div className="rounded-lg border border-navy-700 bg-navy-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
        <SignalBadge severity={title === 'Warnings' ? 'warn' : title === 'Negatives' ? 'bad' : 'good'} />
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((signal, idx) => (
            <li key={`${signal.label}-${idx}`} className="text-sm text-text-secondary flex items-center justify-between gap-3">
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

export function StockDetailView({ run, score }: Props) {
  const { t } = useTranslation();
  const companyName = getCompanyName(score.symbol);
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-text-muted uppercase tracking-wider">{t('stockDetail.latestBriefing')}</p>
          <h1 className="text-2xl font-semibold text-text-primary">
            {companyName} <span className="text-text-muted">({score.symbol})</span>
          </h1>
          <p className="text-sm text-text-secondary">
            Universe: <span className="text-text-primary">{run.universe.definition.name}</span> ·{' '}
            {run.as_of_date}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/"
            className="text-sm text-text-secondary hover:text-text-primary border border-navy-700 px-3 py-1 rounded-lg"
          >
            ← {t('stockDetail.back')}
          </Link>
          <Link
            href={`/history?symbol=${score.symbol}`}
            className="text-sm text-text-secondary hover:text-text-primary border border-navy-700 px-3 py-1 rounded-lg"
          >
            {t('stockDetail.openInHistory')}
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
        <h3 className="text-lg font-semibold text-text-primary mb-3">{t('stockDetail.whyThisScore')}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <SignalList title={t('stockDetail.positives')} items={explain.positives} emptyLabel={t('stockDetail.noPositives')} />
          <SignalList title={t('stockDetail.negatives')} items={explain.negatives} emptyLabel={t('stockDetail.noNegatives')} />
          <SignalList title={t('stockDetail.warnings')} items={explain.warnings} emptyLabel={t('stockDetail.noWarnings')} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="col-span-2 rounded-xl border border-navy-700 bg-navy-800 p-4">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('stockDetail.totalScore')}</div>
          <div className="text-3xl font-bold text-text-primary">{score.total_score.toFixed(1)}</div>
          <p className="text-sm text-text-secondary">
            {t('stockDetail.fundamental')} {score.breakdown.fundamental.toFixed(1)} · {t('stockDetail.technical')}{' '}
            {score.breakdown.technical.toFixed(1)}
          </p>
        </div>
        <ScorePill label={t('stockDetail.valuation')} value={score.evidence.valuation} />
        <ScorePill label={t('stockDetail.quality')} value={score.evidence.quality} />
        <ScorePill label={t('stockDetail.technical')} value={score.evidence.technical} />
        <ScorePill label={t('stockDetail.risk')} value={score.evidence.risk} />
      </div>

      {priceTarget ? (
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
          <h3 className="text-lg font-semibold text-text-primary mb-3">{t('stockDetail.priceTarget')}</h3>
          <PriceTargetCard {...priceTarget} showDeepAnalysisWarning={true} />
        </div>
      ) : (
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
          <h3 className="text-lg font-semibold text-text-primary mb-1">{t('stockDetail.priceTarget')}</h3>
          <p className="text-sm text-text-muted">
            {isScanOnly
              ? t('stockDetail.scanOnlyPhase')
              : t('stockDetail.priceTargetNotAvailable')}
          </p>
        </div>
      )}

      <div id="analysis" className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
          <h3 className="text-lg font-semibold text-text-primary mb-3">{t('stockDetail.valuationInputs')}</h3>
          {valueCoverage && (
            <p className="text-xs text-text-muted mb-2">
              {t('stockDetail.valueCoveragePresent').replace('{present}', valueCoverage.present?.map((p) => p.toUpperCase()).join(', ') || t('stockDetail.valueCoveragePresentEmpty'))}
              {valueCoverage.missing && valueCoverage.missing.length > 0
                ? t('stockDetail.valueCoverageMissing').replace('{missing}', valueCoverage.missing.map((m) => m.toUpperCase()).join(', '))
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
                  <dt className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">{label}</dt>
                  <dd className="text-text-primary">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-text-muted">{t('stockDetail.valuationInputsDescription')}</p>
          )}
        </div>

        <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
          <h3 className="text-lg font-semibold text-text-primary mb-3">{t('stockDetail.valueDrivers')}</h3>
          {diagnostics ? (
            <div className="space-y-3 text-sm text-text-secondary">
              <div className="flex items-center justify-between">
                <span>{t('stockDetail.medianSource')}</span>
                <span className="text-text-primary">
                  {medians?.source === 'global'
                    ? t('stockDetail.globalFallback')
                    : t('stockDetail.sector')}{" "}
                  {medians?.fallback_reason ? t('stockDetail.fallbackReason').replace('{reason}', medians.fallback_reason) : ''}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-navy-700/40 border border-navy-700">
                  <div className="text-[10px] text-text-muted uppercase">{t('stockDetail.sectorMedians')}</div>
                  <div className="text-text-primary">
                    {t('stockDetail.sectorMediansDetails')
                      .replace('{pe}', fmtNumber(medians?.sector?.median_pe))
                      .replace('{pb}', fmtNumber(medians?.sector?.median_pb))
                      .replace('{ps}', fmtNumber(medians?.sector?.median_ps))}
                  </div>
                  <div className="text-xs text-text-muted">{t('stockDetail.sampleSize').replace('{size}', String(medians?.sector?.sample_size ?? '—'))}</div>
                </div>
                <div className="p-2 rounded-lg bg-navy-700/40 border border-navy-700">
                  <div className="text-[10px] text-text-muted uppercase">{t('stockDetail.globalMedians')}</div>
                  <div className="text-text-primary">
                    {t('stockDetail.globalMediansDetails')
                      .replace('{pe}', fmtNumber(medians?.global?.median_pe))
                      .replace('{pb}', fmtNumber(medians?.global?.median_pb))
                      .replace('{ps}', fmtNumber(medians?.global?.median_ps))}
                  </div>
                  <div className="text-xs text-text-muted">{t('stockDetail.sampleSize').replace('{size}', String(medians?.global?.sample_size ?? '—'))}</div>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-text-muted uppercase mb-1">{t('stockDetail.componentContributions')}</div>
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
                               .replace('{reasonSuffix}', !comp.included && comp.reason ? t('stockDetail.componentReason').replace('{reason}', comp.reason ?? '') : '')
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

     <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
          <h3 className="text-lg font-semibold text-text-primary mb-3">{t('stockDetail.dataQuality')}</h3>
          <p className="text-sm text-text-secondary mb-2">
            {t('stockDetail.qualityScore').replace('{score}', dq.data_quality_score.toFixed(1))}
          </p>
          {dq.missing_fields && dq.missing_fields.length > 0 && (
            <p className="text-xs text-accent-gold mb-3">
              {t('stockDetail.missingFields').replace('{fields}', dq.missing_fields.join(', '))}
            </p>
          )}
          {dq.assumptions && dq.assumptions.length > 0 && (
            <div className="text-xs text-text-muted space-y-1">
              {dq.assumptions.map((a, idx) => (
                <div key={idx}>{t('stockDetail.assumptionItem').replace('{assumption}', a)}</div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
          <h3 className="text-lg font-semibold text-text-primary mb-3">{t('stockDetail.runContext')}</h3>
          <dl className="text-sm text-text-secondary space-y-1">
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
            <div className="flex justify-between">
              <dt>{t('stockDetail.runId')}</dt>
              <dd className="text-text-primary font-mono text-xs">{run.run_id}</dd>
            </div>
          </dl>
        </div>
      </div>

      {dq.metrics && Object.keys(dq.metrics).length > 0 && (
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
          <h3 className="text-lg font-semibold text-text-primary mb-3">{t('stockDetail.metricQuality')}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-text-muted uppercase text-[10px] tracking-wider">
                  <th className="text-left px-2 py-1">{t('stockDetail.metric')}</th>
                  <th className="text-right px-2 py-1">{t('stockDetail.value')}</th>
                  <th className="text-left px-2 py-1">{t('stockDetail.source')}</th>
                  <th className="text-left px-2 py-1">{t('stockDetail.notes')}</th>
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
  );
}
