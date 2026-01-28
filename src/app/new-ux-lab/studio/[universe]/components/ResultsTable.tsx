"use client";

import React from "react";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import { GhostRow, type SkippedSymbol } from "./GhostRow";
import { setInspectorMode } from "./Inspector";

type SymbolScore = RunV1SchemaJson["scores"][number];

export function ResultsTable({
  selections,
  skippedSymbols,
}: {
  selections: SymbolScore[];
  skippedSymbols?: SkippedSymbol[];
}) {
  if (selections.length === 0) {
    return (
      <div className="text-center py-12 text-text-secondary">
        No selections available
      </div>
    );
  }

  const handleRowClick = (pick: SymbolScore) => {
    setInspectorMode({
      mode: "stock",
      selectedSymbol: pick.symbol,
      selectedScore: pick,
    });
  };

  const handleGhostRowClick = () => {
    if (skippedSymbols && skippedSymbols.length > 0) {
      setInspectorMode({
        mode: "diversification",
        skippedSymbols,
      });
    }
  };

  // Find where to inject ghost row (after the first pick that would have been beaten by a skipped symbol)
  const ghostRowIndex = skippedSymbols && skippedSymbols.length > 0
    ? findGhostRowIndex(selections, skippedSymbols)
    : null;

  return (
    <div className="border border-border-subtle rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-surface-1 border-b border-border-subtle">
          <tr>
            <th className="text-left text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
              #
            </th>
            <th className="text-left text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
              Symbol
            </th>
            <th className="text-right text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
              Score
            </th>
            <th className="text-right text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
              Value
            </th>
            <th className="text-right text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
              Quality
            </th>
            <th className="text-right text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
              Tech
            </th>
            <th className="text-right text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
              Risk
            </th>
            <th className="text-right text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
              Target
            </th>
            <th className="text-right text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3">
              Δ
            </th>
          </tr>
        </thead>
        <tbody className="bg-surface-0 divide-y divide-border-subtle">
          {selections.map((pick, idx) => {
            const upside = pick.price_target?.upside_pct;
            const evidence = pick.evidence;
            const showGhostRowHere = ghostRowIndex === idx && skippedSymbols;

            return (
              <React.Fragment key={`row-${pick.symbol}`}>
                <tr
                  onClick={() => handleRowClick(pick)}
                  className="hover:bg-surface-1 transition cursor-pointer"
                >
                  <td className="px-4 py-3 text-sm text-text-tertiary">
                    {idx + 1}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-text-primary">
                      {pick.symbol}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-text-primary">
                      {pick.total_score.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScorePill score={evidence.valuation} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScorePill score={evidence.quality} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScorePill score={evidence.technical} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScorePill score={evidence.risk} />
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary font-mono">
                    {pick.price_target?.fair_value
                      ? `$${pick.price_target.fair_value.toFixed(0)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {upside !== undefined && upside !== null ? (
                      <span
                        className={`text-sm font-medium ${
                          upside > 0
                            ? "text-success"
                            : upside < 0
                              ? "text-error"
                              : "text-text-secondary"
                        }`}
                      >
                        {upside > 0 ? "+" : ""}
                        {upside.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-sm text-text-tertiary">—</span>
                    )}
                  </td>
                </tr>

                {/* Inject ghost row at the calculated position */}
                {showGhostRowHere && (
                  <GhostRow
                    skippedSymbols={skippedSymbols}
                    onClick={handleGhostRowClick}
                  />
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Find the index after which to insert the ghost row
function findGhostRowIndex(
  selections: SymbolScore[],
  skippedSymbols: SkippedSymbol[]
): number | null {
  if (skippedSymbols.length === 0) return null;

  // Find the highest-ranked skipped symbol
  const highestSkippedRank = Math.min(...skippedSymbols.map((s) => s.wouldBeRank));

  // Insert ghost row right after the pick that is just before where the first skip would have been
  // For example, if first skip would be rank 6, insert after rank 5 (index 4)
  return highestSkippedRank - 2; // -1 for 0-index, -1 to insert after the previous pick
}

function ScorePill({ score }: { score: number }) {
  const colorClass =
    score >= 80
      ? "text-success bg-success/10"
      : score >= 60
        ? "text-warning bg-warning/10"
        : "text-text-secondary bg-surface-2";

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}
    >
      {score.toFixed(0)}
    </span>
  );
}
