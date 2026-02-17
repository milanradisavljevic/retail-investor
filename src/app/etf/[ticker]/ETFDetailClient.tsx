'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import GlossaryTooltip from '@/app/components/GlossaryTooltip';
import type { ETFDetailResponse, ETFListResponse } from '@/types/etf';

interface ETFDetailClientProps {
  ticker: string;
  holdingScoreMap: Record<string, number>;
}

type SimilarETF = ETFListResponse['etfs'][number];

function getScoreColorClass(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return 'text-text-muted';
  if (score >= 70) return 'text-accent-green';
  if (score >= 50) return 'text-accent-gold';
  return 'text-accent-red';
}

function getScoreBadgeClass(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return 'bg-navy-700 text-text-muted border border-navy-600';
  }
  if (score >= 70) return 'bg-accent-green/15 text-accent-green border border-accent-green/30';
  if (score >= 50) return 'bg-accent-gold/15 text-accent-gold border border-accent-gold/30';
  return 'bg-accent-red/15 text-accent-red border border-accent-red/30';
}

function getChangeColorClass(change: number | null | undefined): string {
  if (change === null || change === undefined || Number.isNaN(change)) return 'text-text-muted';
  return change >= 0 ? 'text-accent-green' : 'text-accent-red';
}

function formatSignedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const pct = value * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function formatPrice(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function formatCompactCurrency(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    if (Math.abs(value) >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
    if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    return value.toFixed(0);
  }
}

function formatExpenseRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const pct = value * 100;
  return `${pct.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}%`;
}

function formatDateFromUnix(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(0, 10);
}

function normalizeWeightToPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? value : value * 100;
}

function buildSparklinePoints(values: number[]): string {
  if (!values.length) return '';
  const width = 100;
  const height = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width : (index / (values.length - 1)) * width;
      const y = span === 0 ? height / 2 : height - ((value - min) / span) * height;
      return `${x},${y}`;
    })
    .join(' ');
}

function getDistributionLabel(policy: 'accumulating' | 'distributing'): string {
  return policy === 'accumulating' ? 'Thesaurierend' : 'Ausschuettend';
}

function getManagementLabel(style: 'passive' | 'active'): string {
  return style === 'passive' ? 'Passiv' : 'Aktiv';
}

function getAssetClassLabel(assetClass: 'equity' | 'fixed_income' | 'commodity' | 'crypto' | 'multi_asset'): string {
  const map = {
    equity: 'Aktien',
    fixed_income: 'Anleihen',
    commodity: 'Rohstoffe',
    crypto: 'Crypto',
    multi_asset: 'Multi-Asset',
  } as const;
  return map[assetClass];
}

function ScoreBar({ label, value, description }: { label: string; value: number | null | undefined; description: string }) {
  const score = value ?? null;
  const width = score === null || Number.isNaN(score) ? 0 : Math.max(0, Math.min(100, score));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-primary font-medium">{label}</span>
        <span className={`font-semibold ${getScoreColorClass(score)}`}>{score === null ? '—' : score.toFixed(0)}</span>
      </div>
      <div className="h-2 rounded-full bg-navy-700 overflow-hidden">
        <div
          className={`h-full transition-all ${
            score === null
              ? 'bg-navy-600'
              : score >= 70
                ? 'bg-accent-green'
                : score >= 50
                  ? 'bg-accent-gold'
                  : 'bg-accent-red'
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="text-xs text-text-muted">{description}</p>
    </div>
  );
}

function MiniSparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) {
    return (
      <div className="h-32 rounded-lg border border-dashed border-navy-600 flex items-center justify-center text-sm text-text-muted">
        Kein Preisverlauf verfuegbar
      </div>
    );
  }

  const points = buildSparklinePoints(data);
  const isPositive = data[data.length - 1] >= data[0];
  const stroke = isPositive ? '#10B981' : '#EF4444';

  return (
    <div className="h-32 w-full rounded-lg border border-navy-700 bg-navy-900/30 p-3">
      <svg viewBox="0 0 100 36" className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="30-Tage ETF-Preis-Sparkline">
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
      </svg>
    </div>
  );
}

export function ETFDetailClient({ ticker, holdingScoreMap }: ETFDetailClientProps) {
  const [detail, setDetail] = useState<ETFDetailResponse | null>(null);
  const [similarEtfs, setSimilarEtfs] = useState<SimilarETF[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      setSimilarEtfs([]);

      try {
        const res = await fetch(`/api/etf/${encodeURIComponent(ticker)}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 404) {
            throw new Error(`${ticker} im ETF-Universum nicht gefunden.`);
          }
          throw new Error(`ETF konnte nicht geladen werden (${res.status}).`);
        }

        const payload = (await res.json()) as ETFDetailResponse;
        setDetail(payload);

        const category = payload.metadata.etf_category;
        if (category) {
          const similarRes = await fetch(`/api/etf?category=${encodeURIComponent(category)}`, {
            signal: controller.signal,
          });
          if (similarRes.ok) {
            const similarPayload = (await similarRes.json()) as ETFListResponse;
            const alternatives = (similarPayload.etfs ?? [])
              .filter((item) => item.metadata.ticker !== payload.metadata.ticker)
              .slice(0, 4);
            setSimilarEtfs(alternatives);
          }
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Unbekannter Fehler');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [ticker]);

  const holdingsRows = useMemo(() => {
    if (!detail) return [];
    const top10 = detail.metadata.top_holdings.slice(0, 10);
    return top10.map((holding, idx) => {
      const symbol = holding.symbol.toUpperCase();
      const score = holdingScoreMap[symbol];
      return {
        rank: idx + 1,
        symbol,
        name: holding.name || symbol,
        weightPct: normalizeWeightToPct(holding.weight),
        score: Number.isFinite(score) ? score : null,
      };
    });
  }, [detail, holdingScoreMap]);

  const holdingsWeightPct = holdingsRows.reduce((sum, item) => sum + item.weightPct, 0);
  const holdingsWithScore = holdingsRows.filter((item) => item.score !== null).length;

  const performanceRows = useMemo(() => {
    const price = detail?.price;
    const sparkline = price?.sparkline_30d ?? [];
    const base = sparkline[0];
    const oneYearFromSparkline =
      sparkline.length >= 2 && Number.isFinite(base) && base !== 0
        ? (sparkline[sparkline.length - 1] - base) / base
        : null;

    return [
      { label: '1D', value: price?.change_1d ?? null },
      { label: '1W', value: price?.change_1w ?? null },
      { label: '1M', value: price?.change_1m ?? null },
      { label: '3M', value: price?.change_3m ?? null },
      { label: 'YTD', value: price?.change_ytd ?? null },
      { label: '1Y', value: oneYearFromSparkline },
    ];
  }, [detail]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-5 w-52 rounded bg-navy-700" />
        <div className="h-32 rounded-xl bg-navy-800 border border-navy-700" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-60 rounded-xl bg-navy-800 border border-navy-700" />
          <div className="h-60 rounded-xl bg-navy-800 border border-navy-700" />
        </div>
        <div className="h-80 rounded-xl bg-navy-800 border border-navy-700" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <Link href="/" className="hover:text-text-primary">Dashboard</Link>
          <span>&gt;</span>
          <span>ETF</span>
          <span>&gt;</span>
          <span className="font-medium text-text-primary">{ticker}</span>
        </div>

        <div className="rounded-xl border border-navy-700 bg-navy-800 p-6 text-center">
          <h2 className="text-xl font-semibold text-text-primary mb-2">ETF konnte nicht geladen werden</h2>
          <p className="text-text-secondary">{error ?? 'Keine ETF-Daten verfuegbar.'}</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg border border-navy-600 px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
          >
            ← Zurueck zum Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { metadata, score, price } = detail;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <Link href="/" className="hover:text-text-primary">Dashboard</Link>
        <span>&gt;</span>
        <span>ETF</span>
        <span>&gt;</span>
        <span className="font-medium text-text-primary">{metadata.ticker}</span>
      </div>

      <section className="rounded-xl border border-navy-700 bg-navy-800 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-text-primary">
              {metadata.name} <span className="text-text-muted">({metadata.ticker})</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-navy-600 px-2 py-1 text-xs text-text-secondary">
                <GlossaryTooltip term="etf">ETF</GlossaryTooltip>
              </span>
              <span className="rounded-md border border-navy-600 px-2 py-1 text-xs text-text-secondary">
                {getManagementLabel(metadata.management_style)}
              </span>
              <span className="rounded-md border border-navy-600 px-2 py-1 text-xs text-text-secondary">
                {getDistributionLabel(metadata.distribution_policy)}
              </span>
              <span className="rounded-md border border-navy-600 px-2 py-1 text-xs text-text-secondary">
                {getAssetClassLabel(metadata.asset_class)}
              </span>
            </div>
            <div className="text-sm text-text-secondary">
              {formatPrice(price?.current ?? null, metadata.currency)}{' '}
              <span className={getChangeColorClass(price?.change_1d)}>
                ({formatSignedPercent(price?.change_1d)})
              </span>
            </div>
          </div>

          <div className={`rounded-xl px-4 py-3 text-center min-w-24 ${getScoreBadgeClass(score?.combined_score)}`}>
            <div className="text-2xl font-bold">
              {score?.combined_score === null || score?.combined_score === undefined
                ? '—'
                : score.combined_score.toFixed(0)}
            </div>
            <div className="text-[10px] uppercase tracking-wider">Gesamt-Score</div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-navy-700 bg-navy-800 p-4 md:p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Uebersicht</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-navy-700 bg-navy-900/30 p-3">
              <div className="text-xs text-text-muted mb-1">
                <GlossaryTooltip term="expense_ratio">Expense Ratio</GlossaryTooltip>
              </div>
              <div className="text-lg font-semibold text-text-primary">{formatExpenseRatio(metadata.expense_ratio)}</div>
              <div className="text-xs text-text-muted">
                Score: {score?.expense_ratio_score === null || score?.expense_ratio_score === undefined ? '—' : score.expense_ratio_score.toFixed(0)}
              </div>
            </div>
            <div className="rounded-lg border border-navy-700 bg-navy-900/30 p-3">
              <div className="text-xs text-text-muted mb-1">
                <GlossaryTooltip term="aum">AUM</GlossaryTooltip>
              </div>
              <div className="text-lg font-semibold text-text-primary">
                {formatCompactCurrency(metadata.aum, metadata.currency)}
              </div>
            </div>
            <div className="rounded-lg border border-navy-700 bg-navy-900/30 p-3">
              <div className="text-xs text-text-muted mb-1">Auflage</div>
              <div className="text-lg font-semibold text-text-primary">{formatDateFromUnix(metadata.inception_date)}</div>
            </div>
            <div className="rounded-lg border border-navy-700 bg-navy-900/30 p-3">
              <div className="text-xs text-text-muted mb-1">Benchmark</div>
              <div className="text-lg font-semibold text-text-primary">{metadata.benchmark_index ?? '—'}</div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-navy-700 bg-navy-800 p-4 md:p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Score-Breakdown</h2>
          <div className="space-y-3">
            <ScoreBar
              label="Technical"
              value={score?.technical_score ?? null}
              description="Momentum- und Trendprofil."
            />
            <ScoreBar
              label="Risk"
              value={score?.risk_score ?? null}
              description="Volatilitaet und Drawdown-Verhalten."
            />
            <ScoreBar
              label="Expense Ratio"
              value={score?.expense_ratio_score ?? null}
              description="Kosteneffizienz der ETF-Struktur."
            />
          </div>
          <p className="mt-3 text-xs text-text-muted leading-relaxed">
            ETFs werden nur auf Technical, Risk und Kosteneffizienz bewertet. Fundamental-Scores
            (Valuation, Quality) gelten nur für Einzelaktien.{' '}
            <GlossaryTooltip term="etf_scoring">ETF-Scoring</GlossaryTooltip>.
          </p>
        </section>
      </div>

      <section className="rounded-xl border border-navy-700 bg-navy-800 p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary">Preisverlauf</h2>
          <span className="text-xs text-text-muted">30 Tage</span>
        </div>
        <MiniSparkline data={price?.sparkline_30d ?? []} />

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[460px]">
            <thead>
              <tr className="border-b border-navy-700">
                {performanceRows.map((period) => (
                  <th
                    key={period.label}
                    className="px-3 py-2 text-left text-xs uppercase tracking-wider text-text-muted font-medium"
                  >
                    {period.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {performanceRows.map((period) => (
                  <td key={period.label} className={`px-3 py-2 text-sm font-semibold ${getChangeColorClass(period.value)}`}>
                    {formatSignedPercent(period.value)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-navy-700 bg-navy-800 p-4 md:p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Top 10 Holdings</h2>

        {holdingsRows.length === 0 ? (
          <p className="text-sm text-text-muted">Keine Holdings-Daten fuer diesen ETF verfuegbar.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-navy-700 text-left">
                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-text-muted font-medium">#</th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-text-muted font-medium">Symbol</th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-text-muted font-medium">Name</th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-text-muted font-medium">Gewicht</th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-text-muted font-medium">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-700">
                  {holdingsRows.map((row) => (
                    <tr key={`${row.rank}-${row.symbol}`} className="hover:bg-navy-700/30">
                      <td className="px-3 py-2 text-sm text-text-secondary">{row.rank}</td>
                      <td className="px-3 py-2 text-sm font-medium text-text-primary">{row.symbol}</td>
                      <td className="px-3 py-2 text-sm text-text-secondary">{row.name}</td>
                      <td className="px-3 py-2 text-sm text-text-primary">{row.weightPct.toFixed(2)}%</td>
                      <td className={`px-3 py-2 text-sm font-semibold ${getScoreColorClass(row.score)}`}>
                        {row.score === null ? '—' : row.score.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-navy-600 bg-navy-700/30">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-sm font-medium text-text-primary">
                      Top {holdingsRows.length} machen {holdingsWeightPct.toFixed(2)}% des ETFs aus
                    </td>
                    <td colSpan={2} className="px-3 py-2 text-sm text-text-secondary">
                      {holdingsWithScore} von {holdingsRows.length} Holdings haben einen INTRINSIC-Score
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-navy-700 bg-navy-800 p-4 md:p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-3">ETF-Steckbrief</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <tbody className="divide-y divide-navy-700">
              <tr>
                <td className="px-3 py-2 text-sm text-text-muted">Fondsgesellschaft</td>
                <td className="px-3 py-2 text-sm text-text-primary">{metadata.fund_family ?? '—'}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-sm text-text-muted">Verwaltungsart</td>
                <td className="px-3 py-2 text-sm text-text-primary">{getManagementLabel(metadata.management_style)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-sm text-text-muted">Ausschüttung</td>
                <td className="px-3 py-2 text-sm text-text-primary">{getDistributionLabel(metadata.distribution_policy)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-sm text-text-muted">Asset-Klasse</td>
                <td className="px-3 py-2 text-sm text-text-primary">{getAssetClassLabel(metadata.asset_class)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-sm text-text-muted">Kategorie</td>
                <td className="px-3 py-2 text-sm text-text-primary">{metadata.category ?? '—'}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-sm text-text-muted">Börse</td>
                <td className="px-3 py-2 text-sm text-text-primary">{metadata.exchange}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-sm text-text-muted">Währung</td>
                <td className="px-3 py-2 text-sm text-text-primary">{metadata.currency}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-sm text-text-muted">ISIN</td>
                <td className="px-3 py-2 text-sm text-text-primary">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {similarEtfs.length > 0 && (
        <section className="rounded-xl border border-navy-700 bg-navy-800 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-text-primary">Ähnliche ETFs</h2>
            <a
              href={`/api/etf?category=${encodeURIComponent(metadata.etf_category)}`}
              className="text-xs text-accent-blue hover:text-accent-blue/80"
            >
              Alle ETFs in dieser Kategorie →
            </a>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {similarEtfs.map((item) => (
              <Link
                key={item.metadata.ticker}
                href={`/etf/${item.metadata.ticker}`}
                className="rounded-lg border border-navy-700 bg-navy-900/30 p-3 hover:border-navy-500 transition-colors"
              >
                <div className="text-sm font-medium text-text-primary">{item.metadata.ticker}</div>
                <div className="text-xs text-text-secondary mt-0.5 truncate">{item.metadata.name}</div>
                <div className="mt-2 text-xs text-text-muted">
                  ER: {formatExpenseRatio(item.metadata.expense_ratio)}
                </div>
                <div className={`text-sm font-semibold mt-1 ${getScoreColorClass(item.score?.combined_score ?? null)}`}>
                  Score: {item.score?.combined_score === null || item.score?.combined_score === undefined ? '—' : item.score.combined_score.toFixed(0)}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
