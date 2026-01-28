"use client";

import type { RunV1SchemaJson } from "@/types/generated/run_v1";

type SymbolScore = RunV1SchemaJson["scores"][number];

export function StockInspector({
  symbol,
  score,
  onClose,
}: {
  symbol: string;
  score: SymbolScore;
  onClose: () => void;
}) {
  const evidence = score.evidence;
  const priceTarget = score.price_target;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-xl font-semibold text-text-primary mb-1">
          {symbol}
        </h3>
        <div className="flex items-center gap-3 text-sm text-text-secondary">
          <span>Total Score</span>
          <span className="text-2xl font-bold text-text-primary">
            {score.total_score.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Pillar Scores */}
      <div>
        <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3 block">
          Evidence Pillars
        </label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "valuation", label: "Valuation", score: evidence.valuation },
            { key: "quality", label: "Quality", score: evidence.quality },
            { key: "technical", label: "Technical", score: evidence.technical },
            { key: "risk", label: "Risk", score: evidence.risk },
          ].map((pillar) => {
            const colorClass =
              pillar.score >= 80
                ? "text-success bg-success/10 border-success/30"
                : pillar.score >= 60
                  ? "text-warning bg-warning/10 border-warning/30"
                  : "text-text-secondary bg-surface-2 border-border-default";

            return (
              <div
                key={pillar.key}
                className={`px-3 py-3 rounded-lg border ${colorClass}`}
              >
                <div className="text-xs text-current opacity-70 mb-1">
                  {pillar.label}
                </div>
                <div className="text-2xl font-bold">{pillar.score.toFixed(0)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Price Target */}
      {priceTarget && (
        <div>
          <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3 block">
            Price Target
          </label>
          <div className="bg-surface-2 border border-border-default rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-text-tertiary mb-1">Fair Value</div>
                <div className="text-xl font-bold text-text-primary font-mono">
                  ${priceTarget.fair_value?.toFixed(2) || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary mb-1">Upside</div>
                <div
                  className={`text-xl font-bold font-mono ${
                    (priceTarget.upside_pct || 0) > 0
                      ? "text-success"
                      : (priceTarget.upside_pct || 0) < 0
                        ? "text-error"
                        : "text-text-secondary"
                  }`}
                >
                  {priceTarget.upside_pct !== undefined && priceTarget.upside_pct !== null
                    ? `${priceTarget.upside_pct > 0 ? "+" : ""}${priceTarget.upside_pct.toFixed(1)}%`
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data Quality */}
      {score.data_quality && (
        <div>
          <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3 block">
            Data Quality
          </label>
          <div className="bg-surface-2 border border-border-default rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-secondary">Quality Score</span>
              <span className="text-sm font-semibold text-text-primary">
                {score.data_quality.data_quality_score.toFixed(0)}
              </span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-secondary">Completeness</span>
              <span className="text-sm font-semibold text-text-primary">
                {(score.data_quality.completeness_ratio * 100).toFixed(0)}%
              </span>
            </div>
            {score.data_quality.missing_critical.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border-subtle">
                <div className="text-xs text-warning mb-1">Missing Critical Data:</div>
                <div className="text-xs text-text-tertiary">
                  {score.data_quality.missing_critical.join(", ")}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-4 border-t border-border-subtle">
        <button
          onClick={onClose}
          className="text-xs text-accent-500 hover:text-accent-600 transition"
        >
          ← Back to Configuration
        </button>
      </div>
    </div>
  );
}
