"use client";

import type { SkippedSymbol } from "./GhostRow";

export function DiversificationInspector({
  skippedSymbols,
  onClose,
}: {
  skippedSymbols: SkippedSymbol[];
  onClose: () => void;
}) {
  // Group by reason
  const reasonGroups = skippedSymbols.reduce((acc, symbol) => {
    if (!acc[symbol.reason]) {
      acc[symbol.reason] = [];
    }
    acc[symbol.reason].push(symbol);
    return acc;
  }, {} as Record<string, SkippedSymbol[]>);

  // Sort symbols within each group by rank
  Object.values(reasonGroups).forEach((group) => {
    group.sort((a, b) => a.wouldBeRank - b.wouldBeRank);
  });

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-info/10 border border-info/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-info flex-shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <div className="text-sm font-medium text-text-primary mb-1">
              Why some picks were skipped
            </div>
            <div className="text-xs text-text-secondary">
              {skippedSymbols.length} {skippedSymbols.length === 1 ? "symbol" : "symbols"} skipped
              due to sector/industry diversification caps
            </div>
          </div>
        </div>
      </div>

      {/* Grouped List */}
      <div className="space-y-4">
        {Object.entries(reasonGroups).map(([reason, symbols]) => (
          <div key={reason}>
            <h4 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
              {reason}
            </h4>
            <div className="space-y-2">
              {symbols.map((symbol) => (
                <div
                  key={symbol.symbol}
                  className="flex items-center justify-between px-3 py-2 bg-surface-2 border border-border-subtle rounded-md"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-tertiary font-mono">
                      #{symbol.wouldBeRank}
                    </span>
                    <span className="text-sm font-medium text-text-primary">
                      {symbol.symbol}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary">
                      Score
                    </span>
                    <span className="text-sm font-semibold text-text-primary font-mono">
                      {symbol.score.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-border-subtle">
        <p className="text-xs text-text-tertiary mb-3">
          These symbols would have ranked in the top picks but were excluded to maintain portfolio diversification.
        </p>
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
