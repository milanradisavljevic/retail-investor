'use client';

import { useTranslation } from "@/lib/i18n/useTranslation";
import { BriefingToolbar } from "@/app/components/BriefingToolbar";
import { DocumentsBanner } from "@/app/components/DocumentsBanner";
import { RunTriggerButton } from "@/app/components/RunTriggerButton";
import { ScoreBoardClient } from "@/app/components/ScoreBoardClient";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import type { ScoreQuery } from "@/lib/scoreView";
import type { SymbolDelta } from "@/lib/runDelta";
import { Suspense } from "react";

interface ModeBadgeProps {
  mode: RunV1SchemaJson["mode"];
}

function ModeBadge({ mode }: ModeBadgeProps) {
  if (!mode) return null;
  
  const colors =
    mode.label === "RISK_ON"
      ? "border-accent-green/50 bg-accent-green/10 text-accent-green"
      : mode.label === "RISK_OFF"
        ? "border-accent-red/50 bg-accent-red/10 text-accent-red"
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

interface ScoreItem {
  score: RunV1SchemaJson['scores'][number];
  rank: number;
  delta: SymbolDelta | undefined;
  isPickOfDay?: boolean;
}

interface DashboardClientProps {
  run: RunV1SchemaJson | null;
  topCardScores: ScoreItem[];
  topTableScores: ScoreItem[];
  query: ScoreQuery;
  visibleCount: number;
  totalCount: number;
}

export function DashboardClient({
  run,
  topCardScores,
  topTableScores,
  query,
  visibleCount,
  totalCount,
}: DashboardClientProps) {
  const { t } = useTranslation();

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
          {t("briefing.noBriefingTitle")}
        </h2>
        <p className="text-text-secondary mb-6 max-w-md mx-auto">
          {t("briefing.noBriefingBody")}
        </p>
        <code className="inline-block bg-navy-800 border border-navy-700 px-4 py-2 rounded-lg text-sm font-mono text-accent-blue">
          npm run run:daily
        </code>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h2 className="text-2xl font-semibold text-text-primary">
            {t("run.latest")}
          </h2>
          <span className="text-xs px-3 py-1 rounded-full bg-navy-800 text-text-secondary border border-navy-700">
            {run.universe.definition.name}
          </span>
          {run.mode && <ModeBadge mode={run.mode} />}
          <div className="ml-auto flex items-center gap-2">
            <RunTriggerButton
              label={`${t("run.run")} ${run.universe.definition.name || 'Universe'}`}
              symbolCount={run.scores.length}
            />
          </div>
        </div>
        <p className="text-text-secondary text-sm">
          {t("run.analysisAsOf")}{" "}
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
          {t("briefing.showing")} {visibleCount} {t("briefing.of")} {totalCount} {t("briefing.symbols")}
        </p>
      </div>

      {/* Documents Warning */}
      <DocumentsBanner symbols={run.flags.user_documents_missing} />

      <ScoreBoardClient topScores={topCardScores} tableScores={topTableScores} />

      {/* Run Details */}
      <div className="bg-navy-800 rounded-xl border border-navy-700 p-6 mb-8">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          {t("briefing.runSummary")}
        </h3>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: t("briefing.universe"), value: run.universe.definition.name },
            { label: t("briefing.symbols"), value: run.scores.length.toString() },
            { label: t("briefing.provider"), value: run.provider.name.toUpperCase() },
            {
              label: t("briefing.requests"),
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

      {/* Data Quality Summary */}
      {run.data_quality_summary && (
        <div className="mt-8 bg-navy-800 rounded-xl border border-navy-700 p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">
            {t("briefing.dataQuality")}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {t("briefing.avgScore")}
              </div>
              <div className="text-2xl font-semibold text-text-primary">
                {run.data_quality_summary.avg_data_quality_score.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {t("briefing.highQuality") || "High Quality"}
              </div>
              <div className="text-2xl font-semibold text-accent-green">
                {(run.data_quality_summary.pct_high * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {t("briefing.mediumQuality") || "Medium"}
              </div>
              <div className="text-2xl font-semibold text-accent-gold">
                {(run.data_quality_summary.pct_medium * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {t("briefing.lowQuality") || "Low Quality"}
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
