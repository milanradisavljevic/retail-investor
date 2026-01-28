"use client";

export interface SkippedSymbol {
  symbol: string;
  wouldBeRank: number;
  score: number;
  reason: string;
}

export function GhostRow({
  skippedSymbols,
  onClick,
}: {
  skippedSymbols: SkippedSymbol[];
  onClick: () => void;
}) {
  if (skippedSymbols.length === 0) return null;

  // Group by reason
  const reasonGroups = skippedSymbols.reduce((acc, symbol) => {
    if (!acc[symbol.reason]) {
      acc[symbol.reason] = [];
    }
    acc[symbol.reason].push(symbol);
    return acc;
  }, {} as Record<string, SkippedSymbol[]>);

  const topReason = Object.keys(reasonGroups)[0];
  const totalCount = skippedSymbols.length;

  return (
    <tr
      onClick={onClick}
      className="ghost-row cursor-pointer transition-all duration-150"
    >
      <td colSpan={9} className="px-0 py-0">
        <div className="px-4 py-3 flex items-center gap-3 bg-ghost-bg border-y border-ghost-border hover:bg-ghost-bg/80">
          {/* Info Icon */}
          <svg
            className="w-4 h-4 text-ghost-text opacity-80 flex-shrink-0"
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

          {/* Text */}
          <span className="flex-1 text-sm text-ghost-text">
            {totalCount} {totalCount === 1 ? "pick" : "picks"} skipped due to diversification caps
            {topReason && (
              <span className="text-ghost-text/70"> ({topReason})</span>
            )}
          </span>

          {/* Chevron */}
          <svg
            className="w-4 h-4 text-ghost-text opacity-50 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </td>
    </tr>
  );
}
