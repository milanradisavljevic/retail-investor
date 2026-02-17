'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Mover, RunComparison, ScoreTrend } from '@/lib/runCompare';

interface RunMetaLite {
  runId: string;
  runDate: string;
  asOfDate: string;
  universe: string;
  preset: string;
}

interface PortfolioImpactRow {
  symbol: string;
  name: string;
  oldScore: number | null;
  newScore: number | null;
  delta: number | null;
  weightPct: number;
  impact: number | null;
}

interface PortfolioImpactData {
  rows: PortfolioImpactRow[];
  oldScore: number | null;
  newScore: number | null;
  delta: number | null;
}

interface Props {
  availableRuns: RunMetaLite[];
  currentRunMeta: RunMetaLite;
  previousRunMeta: RunMetaLite | null;
  selectedCompareTo: string | null;
  comparison: RunComparison | null;
  movers: { up: Mover[]; down: Mover[] };
  trends: ScoreTrend[];
  trendRunCount: number;
  portfolioImpact: PortfolioImpactData | null;
}

type SortKey =
  | 'symbol'
  | 'name'
  | 'status'
  | 'oldScore'
  | 'newScore'
  | 'deltaTotal'
  | 'deltaValuation'
  | 'deltaQuality'
  | 'deltaTechnical'
  | 'deltaRisk';

function formatScore(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toFixed(1);
}

function formatDelta(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}`;
}

function deltaToneClass(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'text-text-muted';
  if (value > 2) return 'text-accent-green';
  if (value < -2) return 'text-accent-red';
  return 'text-text-secondary';
}

function trendLabel(trend: ScoreTrend['trend']): { icon: string; cls: string } {
  if (trend === 'up') return { icon: '▲', cls: 'text-accent-green' };
  if (trend === 'down') return { icon: '▼', cls: 'text-accent-red' };
  return { icon: '→', cls: 'text-text-secondary' };
}

function stabilityLabel(
  stability: ScoreTrend['stability']
): { label: string; cls: string } {
  if (stability === 'high') return { label: 'Hoch', cls: 'text-accent-green' };
  if (stability === 'low') return { label: 'Niedrig', cls: 'text-accent-red' };
  return { label: 'Mittel', cls: 'text-accent-gold' };
}

function sparklinePoints(values: number[]): string {
  if (values.length < 2) return '';
  const width = 100;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');
}

function TrendSparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <span className="text-xs text-text-muted">—</span>;
  }
  const points = sparklinePoints(values);
  const delta = values[values.length - 1] - values[0];
  const stroke = delta >= 0 ? '#22c55e' : '#ef4444';

  return (
    <svg
      viewBox="0 0 100 28"
      className="h-7 w-28"
      preserveAspectRatio="none"
      role="img"
      aria-label="Score-Trend"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

function SortHeader({
  label,
  sortKey,
  currentKey,
  direction,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  direction: 'asc' | 'desc';
  onClick: (key: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  const arrow = active ? (direction === 'asc' ? '↑' : '↓') : '';

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 ${
        active ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
      }`}
      onClick={() => onClick(sortKey)}
    >
      <span>{label}</span>
      <span className="text-[10px]">{arrow}</span>
    </button>
  );
}

function MoverTable({ title, rows }: { title: string; rows: Mover[] }) {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800 overflow-hidden">
      <div className="border-b border-navy-700 px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-navy-700/40 text-[10px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-right">Alt</th>
              <th className="px-3 py-2 text-right">Neu</th>
              <th className="px-3 py-2 text-right">Delta</th>
              <th className="px-3 py-2 text-left">Grund</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-text-muted">
                  Keine Daten
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.symbol} className="hover:bg-navy-700/30">
                <td className="px-3 py-2 font-mono text-text-primary">{row.symbol}</td>
                <td className="px-3 py-2 text-text-secondary">{row.name}</td>
                <td className="px-3 py-2 text-right text-text-secondary">
                  {formatScore(row.oldScore)}
                </td>
                <td className="px-3 py-2 text-right text-text-secondary">
                  {formatScore(row.newScore)}
                </td>
                <td className={`px-3 py-2 text-right font-semibold ${deltaToneClass(row.deltaTotal)}`}>
                  {formatDelta(row.deltaTotal)}
                </td>
                <td className="px-3 py-2 text-text-secondary">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CompareRunsClient({
  availableRuns,
  currentRunMeta,
  previousRunMeta,
  selectedCompareTo,
  comparison,
  movers,
  trends,
  trendRunCount,
  portfolioImpact,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sortKey, setSortKey] = useState<SortKey>('deltaTotal');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [onlyLargeChanges, setOnlyLargeChanges] = useState(false);

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  };

  const handleCurrentRunChange = (runId: string) => {
    updateParams({ runId, compareTo: null });
  };

  const handleCompareRunChange = (value: string) => {
    if (value === '__auto__') {
      updateParams({ compareTo: null });
      return;
    }
    updateParams({ compareTo: value });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('desc');
  };

  const sortedRows = useMemo(() => {
    const rows = comparison?.rows ?? [];
    const filtered = onlyLargeChanges
      ? rows.filter(
          (row) => row.status !== 'both' || Math.abs(row.deltaTotal ?? 0) > 5
        )
      : rows;

    const numericValue = (value: number | null): number => {
      if (value === null || Number.isNaN(value)) {
        return sortDirection === 'asc'
          ? Number.POSITIVE_INFINITY
          : Number.NEGATIVE_INFINITY;
      }
      return value;
    };

    return [...filtered].sort((a, b) => {
      if (sortKey === 'symbol' || sortKey === 'name' || sortKey === 'status') {
        const av = String(a[sortKey]);
        const bv = String(b[sortKey]);
        return sortDirection === 'asc'
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      const av = numericValue(a[sortKey]);
      const bv = numericValue(b[sortKey]);
      return sortDirection === 'asc' ? av - bv : bv - av;
    });
  }, [comparison?.rows, onlyLargeChanges, sortDirection, sortKey]);

  const summary = comparison?.summary;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-navy-700 bg-navy-800 p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-text-muted">RUN-VERGLEICH</p>
        <h1 className="mt-1 text-2xl font-semibold text-text-primary">
          Score-Aenderungen & Trends
        </h1>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-wider text-text-muted">
              Aktueller Run
            </label>
            <select
              className="mt-1 w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-text-primary"
              value={currentRunMeta.runId}
              onChange={(event) => handleCurrentRunChange(event.target.value)}
            >
              {availableRuns.map((run) => (
                <option key={run.runId} value={run.runId}>
                  {run.runDate} · {run.universe} · {run.preset}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-muted">
              Stand {currentRunMeta.asOfDate} · {currentRunMeta.runId}
            </p>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-text-muted">
              Vergleichs-Run
            </label>
            <select
              className="mt-1 w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-text-primary"
              value={selectedCompareTo ?? '__auto__'}
              onChange={(event) => handleCompareRunChange(event.target.value)}
            >
              <option value="__auto__">Auto: Vorheriger Run (gleiche Konfiguration)</option>
              {availableRuns
                .filter((run) => run.runId !== currentRunMeta.runId)
                .map((run) => (
                  <option key={run.runId} value={run.runId}>
                    {run.runDate} · {run.universe} · {run.preset}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-text-muted">
              {previousRunMeta
                ? `Vergleich mit ${previousRunMeta.runDate} · ${previousRunMeta.universe}`
                : 'Kein vorheriger Run verfuegbar'}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Delta-Uebersicht</h2>
        {!summary ? (
          <div className="rounded-xl border border-navy-700 bg-navy-800 p-4 text-sm text-text-secondary">
            Kein vorheriger Run zum Vergleich verfuegbar.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Neue Top-10 Eintraege', value: summary.newTop10Entries, suffix: 'Aktien' },
              { label: 'Score-Verbesserungen (>5)', value: summary.improvementsOver5, suffix: 'Aktien' },
              { label: 'Score-Verschlechterungen (>5)', value: summary.deteriorationsOver5, suffix: 'Aktien' },
              { label: 'Unveraendert', value: summary.unchanged, suffix: 'Aktien' },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-navy-700 bg-navy-800 p-4"
              >
                <p className="text-xs uppercase tracking-wider text-text-muted">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold text-text-primary">{card.value}</p>
                <p className="text-xs text-text-secondary">{card.suffix}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Groesste Veraenderungen</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          <MoverTable title="Groesste Verbesserungen" rows={movers.up} />
          <MoverTable title="Groesste Verschlechterungen" rows={movers.down} />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-text-primary">30-Tage Score-Trends</h2>
          <p className="text-xs text-text-muted">{trendRunCount} Runs in den letzten 30 Tagen</p>
        </div>
        <div className="rounded-xl border border-navy-700 bg-navy-800 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-navy-700/40 text-[10px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-right">Aktuell</th>
                <th className="px-3 py-2 text-right">Vor 7T</th>
                <th className="px-3 py-2 text-right">Vor 14T</th>
                <th className="px-3 py-2 text-right">Vor 30T</th>
                <th className="px-3 py-2 text-center">Trend</th>
                <th className="px-3 py-2 text-center">Stabilitaet</th>
                <th className="px-3 py-2 text-center">Sparkline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {trends.map((trend) => {
                const trendMeta = trendLabel(trend.trend);
                const stabilityMeta = stabilityLabel(trend.stability);
                return (
                  <tr key={trend.symbol} className="hover:bg-navy-700/30">
                    <td className="px-3 py-2">
                      <div className="font-mono text-text-primary">{trend.symbol}</div>
                      <div className="text-xs text-text-muted">{trend.name}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-text-primary">
                      {formatScore(trend.current)}
                    </td>
                    <td className="px-3 py-2 text-right text-text-secondary">
                      {formatScore(trend.sevenDay)}
                    </td>
                    <td className="px-3 py-2 text-right text-text-secondary">
                      {formatScore(trend.fourteenDay)}
                    </td>
                    <td className="px-3 py-2 text-right text-text-secondary">
                      {formatScore(trend.thirtyDay)}
                    </td>
                    <td className={`px-3 py-2 text-center font-semibold ${trendMeta.cls}`}>
                      {trendMeta.icon}
                    </td>
                    <td className={`px-3 py-2 text-center font-medium ${stabilityMeta.cls}`}>
                      {stabilityMeta.label}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <TrendSparkline values={trend.sparkline} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text-primary">Vollstaendige Diff-Tabelle</h2>
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={onlyLargeChanges}
              onChange={(event) => setOnlyLargeChanges(event.target.checked)}
              className="h-4 w-4 rounded border-navy-600 bg-navy-900"
            />
            Nur Aenderungen {'>'} 5 Punkte
          </label>
        </div>
        <div className="rounded-xl border border-navy-700 bg-navy-800 overflow-x-auto">
          <table className="min-w-[1120px] text-sm">
            <thead className="bg-navy-700/40 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">
                  <SortHeader
                    label="Symbol"
                    sortKey="symbol"
                    currentKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th className="px-3 py-2 text-left">
                  <SortHeader
                    label="Name"
                    sortKey="name"
                    currentKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th className="px-3 py-2 text-right">
                  <SortHeader
                    label="Alt"
                    sortKey="oldScore"
                    currentKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th className="px-3 py-2 text-right">
                  <SortHeader
                    label="Neu"
                    sortKey="newScore"
                    currentKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th className="px-3 py-2 text-right">
                  <SortHeader
                    label="Delta Total"
                    sortKey="deltaTotal"
                    currentKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th className="px-3 py-2 text-right">
                  <SortHeader
                    label="Delta Val"
                    sortKey="deltaValuation"
                    currentKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th className="px-3 py-2 text-right">
                  <SortHeader
                    label="Delta Qual"
                    sortKey="deltaQuality"
                    currentKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th className="px-3 py-2 text-right">
                  <SortHeader
                    label="Delta Tech"
                    sortKey="deltaTechnical"
                    currentKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th className="px-3 py-2 text-right">
                  <SortHeader
                    label="Delta Risk"
                    sortKey="deltaRisk"
                    currentKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-text-muted">
                    Keine Eintraege fuer den aktuellen Filter.
                  </td>
                </tr>
              )}
              {sortedRows.map((row) => (
                <tr key={row.symbol} className="hover:bg-navy-700/30">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-text-primary">{row.symbol}</span>
                      {row.status === 'new' && (
                        <span className="rounded border border-accent-green/40 bg-accent-green/10 px-1.5 py-0.5 text-[10px] text-accent-green">
                          NEU
                        </span>
                      )}
                      {row.status === 'removed' && (
                        <span className="rounded border border-accent-red/40 bg-accent-red/10 px-1.5 py-0.5 text-[10px] text-accent-red">
                          ENTF
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{row.name}</td>
                  <td className="px-3 py-2 text-right text-text-secondary">
                    {formatScore(row.oldScore)}
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary">
                    {formatScore(row.newScore)}
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${deltaToneClass(row.deltaTotal)}`}>
                    {formatDelta(row.deltaTotal)}
                  </td>
                  <td className={`px-3 py-2 text-right ${deltaToneClass(row.deltaValuation)}`}>
                    {formatDelta(row.deltaValuation)}
                  </td>
                  <td className={`px-3 py-2 text-right ${deltaToneClass(row.deltaQuality)}`}>
                    {formatDelta(row.deltaQuality)}
                  </td>
                  <td className={`px-3 py-2 text-right ${deltaToneClass(row.deltaTechnical)}`}>
                    {formatDelta(row.deltaTechnical)}
                  </td>
                  <td className={`px-3 py-2 text-right ${deltaToneClass(row.deltaRisk)}`}>
                    {formatDelta(row.deltaRisk)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Portfolio-Impact</h2>
        {!portfolioImpact || portfolioImpact.rows.length === 0 ? (
          <div className="rounded-xl border border-navy-700 bg-navy-800 p-4 text-sm text-text-secondary">
            Kein Portfolio konfiguriert oder keine bewertbaren Holdings vorhanden.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-navy-700 bg-navy-800 p-4 text-sm">
              {portfolioImpact.oldScore !== null && portfolioImpact.newScore !== null ? (
                <p className="text-text-secondary">
                  Dein Portfolio-Score hat sich von{' '}
                  <span className="font-semibold text-text-primary">
                    {portfolioImpact.oldScore.toFixed(1)}
                  </span>{' '}
                  auf{' '}
                  <span className="font-semibold text-text-primary">
                    {portfolioImpact.newScore.toFixed(1)}
                  </span>{' '}
                  geaendert (
                  <span className={deltaToneClass(portfolioImpact.delta)}>
                    {formatDelta(portfolioImpact.delta)}
                  </span>
                  ).
                </p>
              ) : (
                <p className="text-text-secondary">
                  Portfolio-Delta konnte nicht vollstaendig berechnet werden.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-navy-700 bg-navy-800 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-navy-700/40 text-[10px] uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Symbol</th>
                    <th className="px-3 py-2 text-right">Alt</th>
                    <th className="px-3 py-2 text-right">Neu</th>
                    <th className="px-3 py-2 text-right">Delta</th>
                    <th className="px-3 py-2 text-right">Gewicht</th>
                    <th className="px-3 py-2 text-right">Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-700">
                  {portfolioImpact.rows.map((row) => (
                    <tr key={row.symbol} className="hover:bg-navy-700/30">
                      <td className="px-3 py-2">
                        <div className="font-mono text-text-primary">{row.symbol}</div>
                        <div className="text-xs text-text-muted">{row.name}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-text-secondary">
                        {formatScore(row.oldScore)}
                      </td>
                      <td className="px-3 py-2 text-right text-text-secondary">
                        {formatScore(row.newScore)}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${deltaToneClass(row.delta)}`}>
                        {formatDelta(row.delta)}
                      </td>
                      <td className="px-3 py-2 text-right text-text-secondary">
                        {row.weightPct.toFixed(2)}%
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${deltaToneClass(row.impact)}`}>
                        {formatDelta(row.impact)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
