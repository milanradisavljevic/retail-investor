import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database as DatabaseIcon,
} from 'lucide-react';
import { getHealthSnapshot } from '@/lib/health';

const FMP_COLOR = '#4F7942';
const YFINANCE_COLOR = '#5B8DEF';
const GAP_COLOR = '#3A3A3A';

type FreshnessLevel = 'fresh' | 'stale' | 'critical' | 'unknown';

function parseDateLike(value: string | null): Date | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toAgeHours(value: string | null): number | null {
  const parsed = parseDateLike(value);
  if (!parsed) return null;
  return (Date.now() - parsed.getTime()) / (1000 * 60 * 60);
}

function freshnessFor(value: string | null): FreshnessLevel {
  const ageHours = toAgeHours(value);
  if (ageHours === null) return 'unknown';
  if (ageHours < 24) return 'fresh';
  if (ageHours <= 72) return 'stale';
  return 'critical';
}

function freshnessStyle(level: FreshnessLevel): string {
  if (level === 'fresh') return 'border-accent-green/40 bg-accent-green/10 text-accent-green';
  if (level === 'stale') return 'border-accent-gold/40 bg-accent-gold/10 text-accent-gold';
  if (level === 'critical') return 'border-accent-red/40 bg-accent-red/10 text-accent-red';
  return 'border-navy-600 bg-navy-700/40 text-text-muted';
}

function freshnessLabel(level: FreshnessLevel): string {
  if (level === 'fresh') return 'Fresh';
  if (level === 'stale') return 'Aging';
  if (level === 'critical') return 'Stale';
  return 'Unknown';
}

function formatAge(value: string | null): string {
  const ageHours = toAgeHours(value);
  if (ageHours === null) return 'n/a';
  if (ageHours < 24) return `${ageHours.toFixed(1)}h`;
  return `${(ageHours / 24).toFixed(1)}d`;
}

function FreshnessRow({ label, value }: { label: string; value: string | null }) {
  const level = freshnessFor(value);
  return (
    <div className="rounded-lg border border-navy-700 bg-navy-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-text-secondary">{label}</span>
        <span className={`rounded border px-2 py-0.5 text-xs ${freshnessStyle(level)}`}>
          {freshnessLabel(level)}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-primary">{value ?? 'n/a'}</span>
        <span className="text-text-muted">{formatAge(value)} old</span>
      </div>
    </div>
  );
}

function ProgressBar({ label, pct }: { label: string; pct: number }) {
  const safePct = Math.max(0, Math.min(100, pct));
  const color =
    safePct >= 70 ? 'bg-accent-green' : safePct >= 30 ? 'bg-accent-gold' : 'bg-accent-red';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-primary">{safePct.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-navy-700">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${safePct}%` }} />
      </div>
    </div>
  );
}

function toPct(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

function formatFieldName(field: string): string {
  return field
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase());
}

function ProviderCoverageCard({
  item,
}: {
  item: {
    universe: string;
    total_symbols: number;
    fmp_coverage: number;
    yfinance_coverage: number;
    merged_coverage: number;
    gap: number;
    key_fields: Array<{
      field: string;
      fmp_pct: number;
      yfinance_pct: number;
      merged_pct: number;
    }>;
  };
}) {
  const total = item.total_symbols || 0;
  const mergedCoverage = item.merged_coverage;
  const overlap = Math.max(0, item.fmp_coverage + item.yfinance_coverage - mergedCoverage);
  const fmpOnly = Math.max(0, item.fmp_coverage - overlap);
  const yfinanceOnly = Math.max(0, item.yfinance_coverage - overlap);
  const fmpSegment = fmpOnly + overlap; // FMP-prioritized merge ownership
  const gap = Math.max(0, item.gap);

  const fmpPct = toPct(fmpSegment, total);
  const yfinancePct = toPct(yfinanceOnly, total);
  const gapPct = toPct(gap, total);

  return (
    <div className="rounded-lg border border-navy-700 bg-navy-900/60 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{item.universe}</h3>
        {item.fmp_coverage > 0 ? (
          <span className="rounded border border-accent-green/40 bg-accent-green/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent-green">
            FMP Active
          </span>
        ) : (
          <span className="rounded border border-navy-600 bg-navy-700/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
            FMP Inactive
          </span>
        )}
        <span className="ml-auto text-xs text-text-muted">Symbols: {item.total_symbols}</span>
      </div>

      <div className="space-y-2">
        <div className="h-3 w-full overflow-hidden rounded-full bg-navy-700">
          <div className="flex h-full w-full">
            <div style={{ width: `${fmpPct}%`, backgroundColor: FMP_COLOR }} />
            <div style={{ width: `${yfinancePct}%`, backgroundColor: YFINANCE_COLOR }} />
            <div style={{ width: `${gapPct}%`, backgroundColor: GAP_COLOR }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-secondary">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: FMP_COLOR }} />
            FMP {fmpPct.toFixed(1)}%
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: YFINANCE_COLOR }} />
            yfinance {yfinancePct.toFixed(1)}%
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GAP_COLOR }} />
            Gap {gapPct.toFixed(1)}%
          </span>
          <span className="ml-auto text-text-muted">
            Merged {toPct(item.merged_coverage, total).toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-navy-700 text-left uppercase tracking-wider text-text-muted">
              <th className="px-2 py-1.5">Field</th>
              <th className="px-2 py-1.5 text-right">FMP</th>
              <th className="px-2 py-1.5 text-right">yfinance</th>
              <th className="px-2 py-1.5 text-right">Merged</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700/70">
            {item.key_fields.map((field) => (
              <tr key={`${item.universe}-${field.field}`} className="text-text-secondary">
                <td className="px-2 py-1.5 text-text-primary">{formatFieldName(field.field)}</td>
                <td className="px-2 py-1.5 text-right">{field.fmp_pct.toFixed(1)}%</td>
                <td className="px-2 py-1.5 text-right">{field.yfinance_pct.toFixed(1)}%</td>
                <td className="px-2 py-1.5 text-right text-text-primary">
                  {field.merged_pct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function HealthPage() {
  const health = getHealthSnapshot();

  const fundamentalsCoverage = health.database.market_data_db.tables.fundamentals.coverage_numeric;
  const priv = health.database.privatinvestor_db;
  const market = health.database.market_data_db;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-xl border border-navy-700 bg-navy-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">System Health</h1>
            <p className="text-sm text-text-secondary">
              Generated: {health.generated_at} · Version: {health.system.version}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-navy-600 px-3 py-1.5 text-sm text-text-secondary">
            <Activity className="h-4 w-4 text-accent-blue" />
            <span>Health Monitor</span>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-navy-700 bg-navy-800 p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Clock className="h-4 w-4 text-accent-blue" />
          <h2 className="text-lg font-semibold text-text-primary">Data Freshness</h2>
          <div className="ml-auto inline-flex items-center gap-1 rounded-md border border-accent-red/30 bg-accent-red/10 px-2 py-0.5 text-xs text-accent-red">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>&gt;3 days = stale</span>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <FreshnessRow label="Prices" value={health.etl.last_price_update} />
          <FreshnessRow label="Fundamentals" value={health.etl.last_fundamental_update} />
          <FreshnessRow label="FRED Macro" value={health.etl.last_fred_update} />
          <FreshnessRow label="Runs" value={health.etl.last_run_update} />
        </div>
      </section>

      <section className="rounded-xl border border-navy-700 bg-navy-800 p-5">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-accent-blue" />
          <h2 className="text-lg font-semibold text-text-primary">Coverage</h2>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="rounded-lg border border-navy-700 bg-navy-900/60 p-4">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">Fundamentals Snapshot</h3>
            <div className="space-y-3">
              <ProgressBar label="Trailing P/E" pct={fundamentalsCoverage.trailing_pe} />
              <ProgressBar label="Earnings Growth" pct={fundamentalsCoverage.earnings_growth} />
              <ProgressBar label="Dividend Yield" pct={fundamentalsCoverage.dividend_yield} />
              <ProgressBar label="Payout Ratio" pct={fundamentalsCoverage.payout_ratio} />
            </div>
          </div>

          <div className="rounded-lg border border-navy-700 bg-navy-900/60 p-4">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">Universe ETL Coverage</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-700 text-left text-[10px] uppercase tracking-wider text-text-muted">
                    <th className="px-2 py-2">Universe</th>
                    <th className="px-2 py-2 text-right">Symbols</th>
                    <th className="px-2 py-2 text-right">Loaded</th>
                    <th className="px-2 py-2 text-right">Coverage</th>
                    <th className="px-2 py-2 text-right">Last Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-700/70">
                  {health.etl.universes.slice(0, 12).map((universe) => (
                    <tr key={universe.id} className="text-text-secondary">
                      <td className="px-2 py-2 text-text-primary">{universe.name}</td>
                      <td className="px-2 py-2 text-right">{universe.symbol_count}</td>
                      <td className="px-2 py-2 text-right">{universe.symbols_with_price}</td>
                      <td className="px-2 py-2 text-right">{universe.coverage_pct.toFixed(1)}%</td>
                      <td className="px-2 py-2 text-right">{universe.last_price_date ?? 'n/a'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-navy-700 bg-navy-800 p-5">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-accent-blue" />
          <h2 className="text-lg font-semibold text-text-primary">Provider Coverage</h2>
        </div>

        {health.provider_coverage.length === 0 ? (
          <div className="rounded-lg border border-navy-700 bg-navy-900/60 p-4 text-sm text-text-muted">
            No provider coverage data available.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {health.provider_coverage.map((item) => (
              <ProviderCoverageCard key={item.universe} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-navy-700 bg-navy-800 p-5">
        <div className="mb-4 flex items-center gap-2">
          <DatabaseIcon className="h-4 w-4 text-accent-blue" />
          <h2 className="text-lg font-semibold text-text-primary">System</h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-navy-700 bg-navy-900/60 p-4">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">Databases</h3>
            <dl className="space-y-2 text-sm text-text-secondary">
              <div className="flex justify-between">
                <dt>privatinvestor.db size</dt>
                <dd className="text-text-primary">{priv.size_mb.toFixed(1)} MB</dd>
              </div>
              <div className="flex justify-between">
                <dt>market-data.db size</dt>
                <dd className="text-text-primary">{market.size_mb.toFixed(1)} MB</dd>
              </div>
              <div className="flex justify-between">
                <dt>prices_eod rows</dt>
                <dd className="text-text-primary">{priv.tables.prices_eod.row_count.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt>fundamentals_snapshot rows</dt>
                <dd className="text-text-primary">
                  {priv.tables.fundamentals_snapshot.row_count.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>macro_indicators rows</dt>
                <dd className="text-text-primary">{priv.tables.macro_indicators.row_count.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt>market fundamentals rows</dt>
                <dd className="text-text-primary">{market.tables.fundamentals.row_count.toLocaleString()}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-navy-700 bg-navy-900/60 p-4">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">Runtime Context</h3>
            <dl className="space-y-2 text-sm text-text-secondary">
              <div className="flex justify-between">
                <dt>Current Regime</dt>
                <dd className="text-text-primary">{health.regime.current}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Composite Score</dt>
                <dd className="text-text-primary">
                  {health.regime.composite_score === null ? 'n/a' : health.regime.composite_score.toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Regime as of</dt>
                <dd className="text-text-primary">{health.regime.as_of ?? 'n/a'}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Run Index Rows</dt>
                <dd className="text-text-primary">{priv.tables.run_index.row_count.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Macro Series</dt>
                <dd className="text-text-primary">{priv.tables.macro_indicators.series.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Loaded Universes</dt>
                <dd className="text-text-primary">{health.etl.universes_loaded.length}</dd>
              </div>
            </dl>

            {health.etl.universes_loaded.length === 0 && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-accent-red/40 bg-accent-red/10 px-2.5 py-1.5 text-xs text-accent-red">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>No universe coverage detected in market-data prices table.</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
