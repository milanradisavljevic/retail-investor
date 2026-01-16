import { Suspense } from "react";
import { getRecentRuns } from "@/lib/runLoader";
import { getCompanyName } from "@/core/company";
import { computeDeltas, type SymbolDelta } from "@/lib/runDelta";
import { buildScoreView, parseScoreQuery, type ScoreQuery } from "@/lib/scoreView";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import Link from "next/link";
import { PriceTargetCard } from "./components/PriceTargetCard";
import { BriefingToolbar } from "./components/BriefingToolbar";
import { DocumentsBanner } from "./components/DocumentsBanner";

// Type for price_target from schema
type PriceTargetData = NonNullable<RunV1SchemaJson["scores"][0]["price_target"]>;

interface ScoreCardProps {
  symbol: string;
  score: RunV1SchemaJson["scores"][0];
  isPickOfDay: boolean;
  rank: number;
  delta?: SymbolDelta;
}

function getScoreColor(value: number): string {
  if (value >= 70) return "text-accent-green";
  if (value >= 50) return "text-accent-gold";
  return "text-accent-red";
}

function getScoreBgColor(value: number): string {
  if (value >= 70) return "bg-accent-green/10 border-accent-green/30";
  if (value >= 50) return "bg-accent-gold/10 border-accent-gold/30";
  return "bg-accent-red/10 border-accent-red/30";
}

function DeltaLabel({
  value,
  isPercent = false,
}: {
  value: number | null | undefined;
  isPercent?: boolean;
}) {
  if (value === null || value === undefined) {
    return <span className="text-[10px] text-text-muted">—</span>;
  }

  const color =
    value > 0 ? "text-accent-green" : value < 0 ? "text-accent-red" : "text-text-secondary";
  const formatted = isPercent
    ? `${(value * 100).toFixed(1)}%`
    : value.toFixed(1);
  const prefix = value >= 0 ? "+" : "";

  return (
    <span className={`text-[11px] font-semibold ${color}`}>
      Δ {prefix}
      {formatted}
    </span>
  );
}

function DataQualityBadge({ score }: { score: number }) {
  const label = score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";
  const colors =
    label === "High"
      ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
      : label === "Medium"
        ? "border-accent-gold/30 bg-accent-gold/10 text-accent-gold"
        : "border-accent-red/30 bg-accent-red/10 text-accent-red";

  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded border ${colors}`}
      title={`Data Quality ${label} (${score.toFixed(1)})`}
    >
      DQ {score.toFixed(0)}
    </span>
  );
}

function ModeBadge({ mode }: { mode: RunV1SchemaJson["mode"] }) {
  const colors =
    mode.label === "RISK_ON"
      ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
      : mode.label === "RISK_OFF"
        ? "border-accent-red/30 bg-accent-red/10 text-accent-red"
        : "border-navy-500 bg-navy-700 text-text-secondary";

  return (
    <span
      className={`text-xs px-3 py-1 rounded-full border ${colors}`}
      title={`Mode ${mode.label} - Score ${mode.score.toFixed(0)}`}
    >
      {mode.label === "RISK_ON" && (
        <span className="mr-1">&#9650;</span>
      )}
      {mode.label === "RISK_OFF" && (
        <span className="mr-1">&#9660;</span>
      )}
      {mode.label} · {mode.score.toFixed(0)}
    </span>
  );
}

function ScoreCard({ symbol, score, isPickOfDay, rank, delta }: ScoreCardProps) {
  const { valuation, quality, technical, risk } = score.evidence;
  const companyName = getCompanyName(symbol);
  const dqScore = score.data_quality?.data_quality_score ?? 0;
  const priceTarget = score.price_target as PriceTargetData | null;
  const deltaTotal = delta?.deltaTotal ?? null;
  const deltaReturn = delta?.deltaReturn ?? null;
  const confidenceChange = delta?.changedConfidence ?? null;
  const deepAnalysisChange = delta?.changedDeepAnalysis ?? null;

  return (
    <Link
      href={`/stock/${symbol}`}
      className={`block bg-navy-800 rounded-xl border p-5 transition-all hover:border-navy-500 ${
        isPickOfDay ? "border-accent-blue ring-2 ring-accent-blue/20" : "border-navy-700"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-text-muted font-mono">#{rank}</span>
            <h3 className="text-lg font-semibold text-text-primary">
              {symbol}
            </h3>
            {isPickOfDay && (
              <span className="text-[10px] bg-accent-blue/20 text-accent-blue border border-accent-blue/30 px-2 py-0.5 rounded">
                PICK
              </span>
            )}
            <DataQualityBadge score={dqScore} />
          </div>
          <p className="text-sm text-text-secondary mt-0.5 truncate">
            {companyName}
          </p>
        </div>
        <div className="text-right ml-4">
          <div
            className={`text-2xl font-bold ${getScoreColor(score.total_score)}`}
          >
            {score.total_score.toFixed(1)}
          </div>
          <div className="flex items-center justify-end gap-2 text-[10px] text-text-muted uppercase tracking-wider">
            <span>Total</span>
            <DeltaLabel value={deltaTotal} />
          </div>
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-navy-700/50 rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Fundamental
          </div>
          <div
            className={`text-xl font-semibold ${getScoreColor(score.breakdown.fundamental)}`}
          >
            {score.breakdown.fundamental.toFixed(1)}
          </div>
        </div>
        <div className="bg-navy-700/50 rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Technical
          </div>
          <div
            className={`text-xl font-semibold ${getScoreColor(score.breakdown.technical)}`}
          >
            {score.breakdown.technical.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Evidence Pillars */}
      <div className="border-t border-navy-700 pt-4 mb-4">
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-3">
          Evidence Pillars
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Value", value: valuation },
            { label: "Quality", value: quality },
            { label: "Tech", value: technical },
            { label: "Risk", value: risk },
          ].map(({ label, value }) => (
            <div
              key={label}
              className={`text-center p-2 rounded-lg border ${getScoreBgColor(value)}`}
            >
              <div className={`text-lg font-semibold ${getScoreColor(value)}`}>
                {value.toFixed(0)}
              </div>
              <div className="text-[10px] text-text-muted">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Price Target */}
      {priceTarget && (
        <div className="border-t border-navy-700 pt-4">
          <PriceTargetCard
            {...priceTarget}
            returnDelta={deltaReturn}
            confidenceChange={confidenceChange}
            deepAnalysisChange={deepAnalysisChange}
          />
        </div>
      )}

      {/* Warning for missing data */}
      {score.data_quality?.missing_fields &&
        score.data_quality.missing_fields.length > 0 && (
          <p className="text-xs text-accent-gold mt-3 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
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
}

export default function Home({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const query: ScoreQuery = parseScoreQuery(searchParams);
  const [latest, previous] = getRecentRuns(2);
  const run = latest?.run ?? null;
  const deltaMap: Map<string, SymbolDelta> = run
    ? computeDeltas(run, previous?.run)
    : new Map<string, SymbolDelta>();

  if (!run) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-navy-800 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-text-primary mb-3">
          No Briefing Available
        </h2>
        <p className="text-text-secondary mb-6 max-w-md mx-auto">
          Run the daily analysis to generate your first stock briefing with
          scores and price targets.
        </p>
        <code className="inline-block bg-navy-800 border border-navy-700 px-4 py-2 rounded-lg text-sm font-mono text-accent-blue">
          npm run run:daily
        </code>
      </div>
    );
  }

  const sortedScores = buildScoreView(run, query);
  const totalCount = run.scores.length;
  const visibleCount = sortedScores.length;
  const top5Scores = sortedScores.slice(0, 5).map((score, index) => ({
    symbol: score.symbol,
    score,
    rank: index + 1,
    delta: deltaMap.get(score.symbol),
  }));

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h2 className="text-2xl font-semibold text-text-primary">
            Latest Briefing
          </h2>
          <span className="text-xs px-3 py-1 rounded-full bg-navy-800 text-text-secondary border border-navy-700">
            {run.universe.definition.name}
          </span>
          {run.mode && <ModeBadge mode={run.mode} />}
        </div>
        <p className="text-text-secondary text-sm">
          Analysis as of{" "}
          <span className="text-text-primary font-medium">
            {run.as_of_date}
          </span>{" "}
          <span className="text-text-muted">|</span>{" "}
          <span className="text-text-muted font-mono text-xs">{run.run_id}</span>
        </p>
        <div className="mt-3">
          <Suspense
            fallback={
              <div className="h-10 w-full bg-navy-800 border border-navy-700 rounded-lg animate-pulse" />
            }
          >
            <BriefingToolbar
              initialSort={query.sort}
              initialFilters={query.filters}
              basePath="/"
            />
          </Suspense>
        </div>
        <p className="text-xs text-text-muted mt-2">
          Showing {visibleCount} of {totalCount} symbols
        </p>
      </div>

      {/* Documents Warning */}
      <DocumentsBanner symbols={run.flags.user_documents_missing} />

      {/* Top 5 Cards */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 mb-10">
        {top5Scores.length === 0 && (
          <div className="col-span-full text-text-muted text-sm bg-navy-800 border border-navy-700 rounded-lg p-4">
            No symbols match the current filters.
          </div>
        )}
        {top5Scores.map(({ symbol, score, rank, delta }) => (
          <ScoreCard
            key={symbol}
            symbol={symbol}
            score={score}
            isPickOfDay={symbol === run.selections.pick_of_the_day}
            rank={rank}
            delta={delta}
          />
        ))}
      </div>

      {/* Run Details */}
      <div className="bg-navy-800 rounded-xl border border-navy-700 p-6 mb-8">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Run Summary
        </h3>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: "Universe", value: run.universe.definition.name },
            { label: "Symbols", value: run.scores.length.toString() },
            { label: "Provider", value: run.provider.name.toUpperCase() },
            {
              label: "Requests",
              value:
                run.provider.rate_limit_observed?.requests_made?.toString() ??
                "N/A",
            },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {label}
              </dt>
              <dd className="text-text-primary font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Top 10 Table */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Top 10 Ranking (after filters)
        </h3>
        <div className="bg-navy-800 rounded-xl border border-navy-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-navy-700/50">
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
                    Trade Target
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-medium text-text-muted uppercase tracking-wider">
                    Return
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-medium text-text-muted uppercase tracking-wider">
                    Horizon
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-700">
                {sortedScores.slice(0, 10).map((score, index) => {
                  const symbol = score.symbol;
                  const companyName = getCompanyName(symbol);
                  const priceTarget = score.price_target as PriceTargetData | null;
                  const delta = deltaMap.get(symbol);

                  const getReturnColor = (pct: number | undefined) => {
                    if (!pct) return "text-text-muted";
                    if (pct >= 0.15) return "text-accent-green";
                    if (pct >= 0.08) return "text-accent-gold";
                    return "text-text-secondary";
                  };

                  return (
                    <tr
                      key={symbol}
                      className="hover:bg-navy-700/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-text-muted font-mono">
                        {index + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="text-sm font-medium text-text-primary">
                              {symbol}
                            </div>
                            <div className="text-xs text-text-muted">
                              {companyName}
                            </div>
                          </div>
                          {symbol === run.selections.pick_of_the_day && (
                            <span className="text-[9px] bg-accent-blue/20 text-accent-blue border border-accent-blue/30 px-1.5 py-0.5 rounded">
                              PICK
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className={`px-4 py-3 text-sm text-right font-semibold ${getScoreColor(score.total_score)}`}
                      >
                        <div>{score.total_score.toFixed(1)}</div>
                        <div className="mt-0.5">
                          <DeltaLabel value={delta?.deltaTotal ?? null} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-text-secondary">
                        {score.breakdown.fundamental.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-text-secondary">
                        {score.breakdown.technical.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-text-primary font-medium">
                        {priceTarget
                          ? `$${priceTarget.target_sell_price.toFixed(2)}`
                          : "—"}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm text-right font-medium ${getReturnColor(priceTarget?.expected_return_pct)}`}
                      >
                        <div>
                          {priceTarget
                            ? `+${(priceTarget.expected_return_pct * 100).toFixed(1)}%`
                            : "—"}
                        </div>
                        <div className="mt-0.5">
                          <DeltaLabel
                            value={priceTarget ? delta?.deltaReturn ?? null : null}
                            isPercent
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-text-muted">
                        {priceTarget
                          ? `${priceTarget.holding_period_months}m`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Data Quality Summary */}
      {run.data_quality_summary && (
        <div className="mt-8 bg-navy-800 rounded-xl border border-navy-700 p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">
            Data Quality Overview
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                Avg Score
              </div>
              <div className="text-2xl font-semibold text-text-primary">
                {run.data_quality_summary.avg_data_quality_score.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                High Quality
              </div>
              <div className="text-2xl font-semibold text-accent-green">
                {(run.data_quality_summary.pct_high * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                Medium
              </div>
              <div className="text-2xl font-semibold text-accent-gold">
                {(run.data_quality_summary.pct_medium * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                Low Quality
              </div>
              <div className="text-2xl font-semibold text-accent-red">
                {(run.data_quality_summary.pct_low * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
