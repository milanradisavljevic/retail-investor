import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { getQualityObservatorySnapshot } from '@/lib/quality/observatory';

function gateBadgeClass(status: 'green' | 'yellow' | 'red' | 'unknown'): string {
  if (status === 'green') return 'border-accent-green/40 bg-accent-green/10 text-accent-green';
  if (status === 'yellow') return 'border-accent-gold/40 bg-accent-gold/10 text-accent-gold';
  if (status === 'red') return 'border-accent-red/40 bg-accent-red/10 text-accent-red';
  return 'border-navy-600 bg-navy-700/40 text-text-muted';
}

function gateIcon(status: 'green' | 'yellow' | 'red' | 'unknown') {
  if (status === 'green') return <CheckCircle2 className="h-4 w-4" />;
  if (status === 'yellow') return <AlertTriangle className="h-4 w-4" />;
  return <ShieldAlert className="h-4 w-4" />;
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return value.toFixed(digits);
}

export default async function QualityPage() {
  const snapshot = getQualityObservatorySnapshot();
  const worstByUniverse = snapshot.universes.map((universe) => {
    const worst = snapshot.stocks
      .filter((stock) => stock.universe_id === universe.universe_id)
      .sort((a, b) => {
        if (b.missing_quality_fields.length !== a.missing_quality_fields.length) {
          return b.missing_quality_fields.length - a.missing_quality_fields.length;
        }
        return (a.data_quality_score ?? -1) - (b.data_quality_score ?? -1);
      })
      .slice(0, 12);

    return { universe, worst };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Data Quality Observatory</h1>
            <p className="text-sm text-text-secondary">
              Generated: {snapshot.generated_at} · Universes: {snapshot.universe_ids.join(', ')}
            </p>
          </div>
          <div className="rounded-md border border-navy-600 bg-navy-700/40 px-3 py-1 text-xs text-text-secondary">
            Stocks tracked: {snapshot.stocks.length}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-navy-700 bg-navy-800 p-5">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Universe Scorecards</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {snapshot.universes.map((universe) => {
            const gateStatus = universe.quality_gate?.status ?? 'unknown';
            return (
              <div key={universe.universe_id} className="rounded-lg border border-navy-700 bg-navy-900/50 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-text-primary">{universe.universe_name}</h3>
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${gateBadgeClass(gateStatus)}`}
                  >
                    {gateIcon(gateStatus)}
                    {gateStatus.toUpperCase()}
                  </span>
                </div>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-text-muted">Snapshot</dt>
                    <dd className="text-text-primary">{formatNumber(universe.snapshot_coverage_pct)}%</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-text-muted">Quality4</dt>
                    <dd className="text-text-primary">{formatNumber(universe.quality4_coverage_pct)}%</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-text-muted">Valuation3</dt>
                    <dd className="text-text-primary">{formatNumber(universe.valuation3_coverage_pct)}%</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-text-muted">Avg DQ</dt>
                    <dd className="text-text-primary">{formatNumber(universe.data_quality.avg, 2)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-text-muted">% Low DQ</dt>
                    <dd className="text-text-primary">{formatNumber(universe.data_quality.pct_low)}%</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-navy-700 bg-navy-800 p-5">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Worst Stocks by Universe</h2>
        <div className="space-y-5">
          {worstByUniverse.map(({ universe, worst }) => (
            <div key={universe.universe_id} className="rounded-lg border border-navy-700 bg-navy-900/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">{universe.universe_name}</h3>
                <span className="text-xs text-text-muted">Top {worst.length} worst symbols</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-navy-700 text-left uppercase tracking-wider text-text-muted">
                      <th className="px-2 py-1.5">Symbol</th>
                      <th className="px-2 py-1.5">Source</th>
                      <th className="px-2 py-1.5 text-right">DQ</th>
                      <th className="px-2 py-1.5 text-right">Missing Q</th>
                      <th className="px-2 py-1.5 text-right">Missing V</th>
                      <th className="px-2 py-1.5 text-right">Age(d)</th>
                      <th className="px-2 py-1.5">Consistency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-700/60">
                    {worst.map((stock) => (
                      <tr key={`${universe.universe_id}-${stock.symbol}`} className="text-text-secondary">
                        <td className="px-2 py-1.5 font-medium text-text-primary">{stock.symbol}</td>
                        <td className="px-2 py-1.5">{stock.source}</td>
                        <td className="px-2 py-1.5 text-right">{formatNumber(stock.data_quality_score, 1)}</td>
                        <td className="px-2 py-1.5 text-right">
                          {stock.missing_quality_fields.length} ({stock.missing_quality_fields.join(', ') || 'none'})
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {stock.missing_valuation_fields.length} ({stock.missing_valuation_fields.join(', ') || 'none'})
                        </td>
                        <td className="px-2 py-1.5 text-right">{formatNumber(stock.age_days, 1)}</td>
                        <td className="px-2 py-1.5">
                          {stock.consistency_severity === 'none'
                            ? 'ok'
                            : `${stock.consistency_severity}: ${stock.consistency_metrics.join(', ')}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
