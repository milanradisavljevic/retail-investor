'use client';

import { useTranslation } from "@/lib/i18n/useTranslation";
import { BriefingToolbar } from "@/app/components/BriefingToolbar";
import { DocumentsBanner } from "@/app/components/DocumentsBanner";
import { RunTriggerButton } from "@/app/components/RunTriggerButton";
import { ScoreBoardClient } from "@/app/components/ScoreBoardClient";
import MarketContextBar from "@/app/components/MarketContextBar";
import EarningsWeekWidget from "@/app/components/EarningsWeekWidget";
import RegimeBadge from "@/app/components/RegimeBadge";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import type { ScoreQuery } from "@/lib/scoreView";
import type { SymbolDelta } from "@/lib/runDelta";
import { Suspense, useState } from "react";
import { useEtlStatus } from "@/hooks/useEtlStatus";

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

export function DashboardClient({
  run,
  topCardScores,
  topTableScores,
  query,
  visibleCount,
  totalCount,
}: DashboardClientProps) {
  const { t } = useTranslation();
  const { status: etlStatus, loading: etlLoading } = useEtlStatus();
  const [pdfLoading, setPdfLoading] = useState(false);

  const handlePdfDownload = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const response = await fetch('/api/export/pdf', { cache: 'no-store' });
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
        `INTRINSIC-Report-${new Date().toISOString().slice(0, 10)}.pdf`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF download failed', error);
      window.alert('PDF-Export fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setPdfLoading(false);
    }
  };

  const renderEtlBadge = () => {
    if (etlLoading) return null;
    const freshness = etlStatus?.freshness ?? 'unknown';
    const ageHours = etlStatus?.data_age_hours ?? null;
    const ageText = ageHours !== null ? `vor ${ageHours.toFixed(1)}h` : 'Zeit unbekannt';
    const badgeText =
      freshness === 'fresh'
        ? `Daten aktuell (${ageText})`
        : freshness === 'stale'
          ? `Daten leicht veraltet (${ageText})`
          : freshness === 'critical'
            ? `Daten veraltet (${ageText})`
            : 'ETL-Status unbekannt';
    const color =
      freshness === 'fresh'
        ? 'border-accent-green/40 bg-accent-green/10 text-accent-green'
        : freshness === 'stale'
          ? 'border-accent-gold/40 bg-accent-gold/10 text-accent-gold'
          : freshness === 'critical'
            ? 'border-accent-red/40 bg-accent-red/10 text-accent-red'
            : 'border-navy-700 bg-navy-800 text-text-muted';
    return (
      <span className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border ${color}`}>
        <span>●</span>
        <span>{badgeText}</span>
      </span>
    );
  };

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
            <button
              type="button"
              onClick={handlePdfDownload}
              disabled={pdfLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-sm text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
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
          {renderEtlBadge()}
          <span className="text-text-muted"> | </span>
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

      <div className="mb-8 space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <MarketContextBar />
          </div>
          <EarningsWeekWidget />
        </div>
        <RegimeBadge />
      </div>

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
                {t("briefing.highQuality") || "Hohe Qualitaet"}
              </div>
              <div className="text-2xl font-semibold text-accent-green">
                {(run.data_quality_summary.pct_high * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {t("briefing.mediumQuality") || "Mittel"}
              </div>
              <div className="text-2xl font-semibold text-accent-gold">
                {(run.data_quality_summary.pct_medium * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {t("briefing.lowQuality") || "Niedrige Qualitaet"}
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
