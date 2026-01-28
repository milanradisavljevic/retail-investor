import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRunById } from "@/lib/runLoader";
import { getCompanyName } from "@/core/company";
import { buildScoreView, parseScoreQuery, type ScoreSearchParams } from "@/lib/scoreView";
import { formatPercent } from "@/lib/percent";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import { BriefingToolbar } from "@/app/components/BriefingToolbar";
import { RunExportButtons, type CsvRow } from "@/app/components/RunExportButtons";

type AwaitableScoreSearchParams = ScoreSearchParams | Promise<ScoreSearchParams> | undefined;
type Params = { params: { runId: string }; searchParams?: AwaitableScoreSearchParams };

export default async function RunDetailPage({ params, searchParams }: Params) {
  const match = getRunById(params.runId);
  if (!match) {
    notFound();
  }

  const run = match.run as RunV1SchemaJson;
  const resolvedSearchParams = await searchParams;
  const query = parseScoreQuery(resolvedSearchParams);
  const scores = buildScoreView(run, query);
  const totalCount = run.scores.length;
  const visibleCount = scores.length;
  const pipeline = run.pipeline;
  const universeCount = run.universe.symbols.length;
  const originalCount = pipeline?.original_symbol_count ?? universeCount;
  const truncated = Boolean(pipeline?.truncated);

  const csvRows: CsvRow[] = scores.map((score) => {
    const pt = score.price_target;
    return {
      symbol: score.symbol,
      companyName: getCompanyName(score.symbol),
      total: score.total_score,
      fundamental: score.breakdown.fundamental,
      technical: score.breakdown.technical,
      pillar_valuation: score.evidence.valuation,
      pillar_quality: score.evidence.quality,
      pillar_technical: score.evidence.technical,
      pillar_risk: score.evidence.risk,
      current_price: pt?.current_price ?? null,
      fair_value: pt?.fair_value ?? null,
      target_sell_price: pt?.target_sell_price ?? null,
      expected_return_pct: pt?.expected_return_pct ?? null,
      holding_period_months: pt?.holding_period_months ?? null,
      confidence: pt?.confidence ?? null,
      requires_deep_analysis: pt?.requires_deep_analysis ?? null,
    };
  });

  const symbolFilter = query.filters.symbol ?? "";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-text-muted uppercase tracking-wider">Historical Run</p>
          <h1 className="text-2xl font-semibold text-text-primary mb-1">{run.universe.definition.name}</h1>
          <p className="text-text-secondary text-sm">
            As of <span className="text-text-primary font-medium">{run.as_of_date}</span>{" "}
            <span className="text-text-muted">|</span>{" "}
            <span className="text-text-muted font-mono text-xs">{run.run_id}</span>
          </p>
          <p className="text-xs text-text-muted mt-1">
            Provider {run.provider.name.toUpperCase()} · Requests{" "}
            {run.provider.rate_limit_observed?.requests_made ?? "N/A"}
          </p>
          <p className="text-xs text-text-muted mt-1">
            Showing {visibleCount} of {totalCount} symbols (universe {universeCount}/{originalCount})
            {truncated && <span className="ml-2 text-accent-gold">⚠ truncated to max_symbols_per_run</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/history"
            className="text-sm text-text-secondary hover:text-text-primary border border-navy-700 px-3 py-2 rounded-lg"
          >
            ← Back to History
          </Link>
          <RunExportButtons run={run} csvRows={csvRows} />
        </div>
      </div>

      <div className="space-y-3">
        <Suspense
          fallback={
            <div className="h-10 w-full bg-navy-800 border border-navy-700 rounded-lg animate-pulse" />
          }
        >
          <BriefingToolbar
            basePath={`/history/${run.run_id}`}
            initialSort={query.sort}
            initialFilters={query.filters}
          />
        </Suspense>
        <form className="flex items-center gap-2" method="get">
          <input type="hidden" name="sort" value={query.sort} />
          {query.filters.deepAnalysis && <input type="hidden" name="deep_analysis" value="1" />}
          {query.filters.confidenceLow && <input type="hidden" name="confidence_low" value="1" />}
          {query.filters.missingData && <input type="hidden" name="missing_data" value="1" />}
          {query.filters.upsideNegative && <input type="hidden" name="upside_negative" value="1" />}
          <input
            type="text"
            name="symbol"
            placeholder="Filter by symbol"
            defaultValue={symbolFilter}
            className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue"
          />
          <button
            type="submit"
            className="text-sm px-3 py-2 rounded-lg border border-navy-700 bg-navy-800 text-text-secondary hover:text-text-primary"
          >
            Apply
          </button>
          {symbolFilter && (
            <a
              href={`/history/${run.run_id}`}
              className="text-sm px-3 py-2 rounded-lg border border-navy-700 text-text-secondary hover:text-text-primary"
            >
              Clear
            </a>
          )}
        </form>
      </div>

      <div className="bg-navy-800 rounded-xl border border-navy-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-navy-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  #
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Symbol
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Total
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Fund.
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Tech.
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Return
                </th>
                <th className="px-4 py-3 text-center text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Horizon
                </th>
                <th className="px-4 py-3 text-center text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Confidence
                </th>
                <th className="px-4 py-3 text-center text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Deep Analysis
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {scores.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-4 text-sm text-text-muted text-center">
                    No symbols match the current filters.
                  </td>
                </tr>
              )}
              {scores.map((score, index) => {
                const symbol = score.symbol;
                const priceTarget = score.price_target;
                const returnLabel = priceTarget
                  ? formatPercent(priceTarget.expected_return_pct, { signed: true })
                  : "—";
                const returnColor =
                  priceTarget && priceTarget.expected_return_pct != null && priceTarget.expected_return_pct >= 0.15
                    ? "text-accent-green"
                    : priceTarget && priceTarget.expected_return_pct != null && priceTarget.expected_return_pct >= 0.08
                      ? "text-accent-gold"
                      : "text-text-secondary";
                return (
                  <tr key={symbol} className="hover:bg-navy-700/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-text-muted font-mono">{index + 1}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-text-primary">{symbol}</div>
                      <div className="text-xs text-text-muted">{getCompanyName(symbol)}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-text-primary">
                      {score.total_score.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-text-secondary">
                      {score.breakdown.fundamental.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-text-secondary">
                      {score.breakdown.technical.toFixed(1)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${returnColor}`}>
                      {priceTarget ? returnLabel : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-text-muted">
                      {priceTarget ? `${priceTarget.holding_period_months}m` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-text-secondary">
                      {priceTarget?.confidence ? priceTarget.confidence.toUpperCase() : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {priceTarget ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] border ${
                            priceTarget.requires_deep_analysis
                              ? "border-accent-gold text-accent-gold bg-accent-gold/10"
                              : "border-navy-600 text-text-secondary"
                          }`}
                        >
                          {priceTarget.requires_deep_analysis ? "Yes" : "No"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
