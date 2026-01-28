import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import { CanvasHeader } from "./CanvasHeader";
import { ResultsTable } from "./ResultsTable";
import type { SkippedSymbol } from "./GhostRow";

export function CentralCanvas({ run }: { run: RunV1SchemaJson }) {
  const selections = run.selections;
  const top30Symbols = selections?.top30 || [];

  // Map symbol strings to full score objects
  const top30Scores = top30Symbols
    .map((symbol) => run.scores.find((s) => s.symbol === symbol))
    .filter((score): score is NonNullable<typeof score> => score !== undefined);

  // Build skipped symbols data if diversification was applied
  const skippedSymbols: SkippedSymbol[] = [];
  if (selections?.diversification_applied && selections?.skipped_for_diversity) {
    selections.skipped_for_diversity.forEach((symbol, idx) => {
      const score = run.scores.find((s) => s.symbol === symbol);
      if (score) {
        // Estimate the would-be rank (this is approximate since we don't have the exact original ranking)
        // For now, we'll just use sequential ranks starting after top30
        const wouldBeRank = top30Symbols.length + idx + 1;

        // Try to infer reason from industry/sector
        const industry = score.industry || "Unknown";
        const reason = `${industry} cap reached`;

        skippedSymbols.push({
          symbol,
          wouldBeRank,
          score: score.total_score,
          reason,
        });
      }
    });
  }

  return (
    <main className="flex-1 bg-surface-0 h-[calc(100vh-3.5rem)] overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6">
        <CanvasHeader run={run} />

        <div className="mt-6">
          <ResultsTable
            selections={top30Scores}
            skippedSymbols={skippedSymbols.length > 0 ? skippedSymbols : undefined}
          />
        </div>

        {/* Status Bar */}
        <div className="mt-8 text-xs text-text-tertiary flex items-center gap-4">
          <span>{run.scores.length} symbols</span>
          <span>·</span>
          <span>{run.provider.name}</span>
          <span>·</span>
          <span>Updated {new Date(run.as_of_date).toLocaleDateString()}</span>
        </div>
      </div>
    </main>
  );
}
