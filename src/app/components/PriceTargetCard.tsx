"use client";

import { formatPercent } from "@/lib/percent";

type ConfidenceLevel = "high" | "medium" | "low";

interface PriceTargetProps {
  current_price?: number;
  fair_value?: number;
  upside_pct?: number;
  target_buy_price?: number;
  target_sell_price?: number;
  expected_return_pct?: number;
  holding_period_months?: number;
  target_date?: string;
  confidence?: ConfidenceLevel;
  requires_deep_analysis?: boolean;
  deep_analysis_reasons?: string[];
  returnDelta?: number | null;
  confidenceChange?: { from: "high" | "medium" | "low" | null | undefined; to: "high" | "medium" | "low" | null | undefined } | null;
  deepAnalysisChange?: { from: boolean | null | undefined; to: boolean | null | undefined } | null;
  /** Whether to show the deep analysis warning box. Defaults to false (for compact/dashboard views). */
  showDeepAnalysisWarning?: boolean;
}

function getDeltaColor(value: number): string {
  if (value > 0) return "text-accent-green";
  if (value < 0) return "text-accent-red";
  return "text-text-secondary";
}

function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-accent-green/20 text-accent-green border-accent-green/30",
    medium: "bg-accent-gold/20 text-accent-gold border-accent-gold/30",
    low: "bg-accent-red/20 text-accent-red border-accent-red/30",
  };

  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${styles[level]}`}
    >
      {level.toUpperCase()}
    </span>
  );
}

function PriceBox({
  label,
  value,
  delta,
  highlight,
  muted,
}: {
  label: string;
  value: number;
  delta?: number;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`text-center p-2 rounded ${
        highlight ? "bg-accent-blue/10 border border-accent-blue/30" : ""
      } ${muted ? "opacity-70" : ""}`}
    >
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
        {label}
      </div>
      <div
        className={`text-lg font-semibold ${
          highlight ? "text-accent-blue" : "text-text-primary"
        } ${muted ? "text-text-muted" : ""}`}
      >
        ${value.toFixed(2)}
      </div>
      {delta !== undefined && (
        <div className={`text-xs ${getDeltaColor(delta)}`}>
          {formatPercent(delta, { signed: true })}
        </div>
      )}
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PriceTargetCard(props: PriceTargetProps) {
  const {
    current_price = 0,
    fair_value = 0,
    upside_pct = 0,
    target_buy_price = 0,
    target_sell_price = 0,
    expected_return_pct = 0,
    holding_period_months = 0,
    target_date = "",
    confidence = "medium",
    requires_deep_analysis = false,
    deep_analysis_reasons = [],
    returnDelta,
    confidenceChange,
    deepAnalysisChange,
    showDeepAnalysisWarning = false,
  } = props;

  const isNegativeUpside = upside_pct < 0;

  const hasReturnDelta = returnDelta !== null && returnDelta !== undefined;
  const hasRunToRunChanges = hasReturnDelta || Boolean(confidenceChange) || Boolean(deepAnalysisChange);

  return (
    <div className="bg-navy-700 rounded-lg p-4 space-y-3 border border-navy-600">
      {/* Header */}
      <div className="flex justify-between items-center">
        <span className="text-text-secondary text-sm font-medium">
          Price Target
        </span>
        <ConfidenceBadge level={confidence} />
      </div>

      {/* Price Grid */}
      <div className="grid grid-cols-4 gap-2">
        <PriceBox label="Current" value={current_price} />
        <PriceBox label="Entry Target" value={target_buy_price} highlight />
        <PriceBox label="Exit Target" value={target_sell_price} delta={expected_return_pct} />
        <PriceBox label="Fair Value" value={fair_value} delta={upside_pct} muted />
      </div>

      {isNegativeUpside && (
        <div className="text-xs text-accent-gold bg-accent-gold/10 border border-accent-gold/30 rounded-lg px-3 py-2">
          Model shows negative upside — trade target is conservative and should be treated with caution.
        </div>
      )}

      {hasRunToRunChanges && (
        <div className="pt-2 border-t border-navy-600">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Run-to-run
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
            {hasReturnDelta && (
              <span className={`font-semibold ${getDeltaColor(returnDelta ?? 0)}`}>
                Δ Return {formatPercent(returnDelta, { signed: true })}
              </span>
            )}
            {confidenceChange && (
              <span>
                Confidence{" "}
                {(confidenceChange.from ?? "—").toString().toUpperCase()} →{" "}
                {(confidenceChange.to ?? "—").toString().toUpperCase()}
              </span>
            )}
            {deepAnalysisChange && (
              <span>
                Deep Analysis {deepAnalysisChange.from ? "On" : "Off"} →{" "}
                {deepAnalysisChange.to ? "On" : "Off"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Holding Period */}
      <div className="flex items-center gap-2 text-sm pt-2 border-t border-navy-600">
        <CalendarIcon className="w-4 h-4 text-text-muted" />
        <span className="text-text-secondary">
          Hold for{" "}
          <span className="text-text-primary font-medium">
            {holding_period_months} months
          </span>{" "}
          <span className="text-text-muted">({formatDate(target_date)})</span>
        </span>
      </div>

      {/* Deep Analysis Warning - only shown in detailed view */}
      {showDeepAnalysisWarning && requires_deep_analysis && deep_analysis_reasons.length > 0 && (
        <div className="bg-accent-gold/10 border border-accent-gold/30 rounded-lg p-3 mt-2">
          <div className="flex items-start gap-2">
            <AlertIcon className="w-4 h-4 text-accent-gold mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <span className="text-accent-gold font-medium">
                Deep Analysis Recommended
              </span>
              <ul className="text-text-secondary mt-1 space-y-0.5 text-xs">
                {deep_analysis_reasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="text-text-muted">•</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PriceTargetCompact({
  target_sell_price = 0,
  expected_return_pct = 0,
  holding_period_months = 0,
  confidence = "medium",
}: Pick<
  PriceTargetProps,
  | "target_sell_price"
  | "expected_return_pct"
  | "holding_period_months"
  | "confidence"
>) {
  const getReturnColor = (pct: number) => {
    if (pct >= 0.15) return "text-accent-green";
    if (pct >= 0.08) return "text-accent-gold";
    return "text-text-secondary";
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-text-primary font-medium">
        ${target_sell_price.toFixed(2)}
      </span>
      <span className={getReturnColor(expected_return_pct)}>
        {formatPercent(expected_return_pct, { signed: true })}
      </span>
      <span className="text-text-muted">{holding_period_months}m</span>
      <ConfidenceBadge level={confidence} />
    </div>
  );
}
