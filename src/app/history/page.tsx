import { basename } from "path";
import Link from "next/link";
import { loadRunFiles } from "@/run/files";

interface RunSummary {
  runId: string;
  runDate: string;
  asOfDate: string;
  universe: string;
  universeCount: number;
  provider: string;
  requests: number | null;
  fileName: string;
  symbolCount: number;
  includesSymbol: boolean;
  matchesUniverse: boolean;
  truncated: boolean;
  warning?: string;
}

function getRunHistory(symbolFilter?: string, universeFilter?: string): RunSummary[] {
  const needle = symbolFilter?.toUpperCase();
  const universeNeedle = universeFilter?.toLowerCase();

  return loadRunFiles(50).map(({ run, filePath }) => {
    const includesSymbol = needle
      ? run.scores.some((s) => s.symbol.toUpperCase().includes(needle))
      : false;
    const matchesUniverse = universeNeedle
      ? run.universe.definition.name.toLowerCase().includes(universeNeedle)
      : true;

    const pipeline = run.pipeline;
    return {
      runId: run.run_id,
      runDate: run.run_date,
      asOfDate: run.as_of_date,
      universe: run.universe.definition.name,
      universeCount: pipeline?.original_symbol_count ?? run.universe.symbols.length,
      provider: run.provider.name.toUpperCase(),
      requests: run.provider.rate_limit_observed?.requests_made ?? null,
      fileName: basename(filePath),
      symbolCount: pipeline?.scored_symbol_count ?? run.scores.length,
      includesSymbol,
      matchesUniverse,
      truncated: Boolean(pipeline?.truncated),
      warning: pipeline?.warnings?.[0],
    };
  });
}

export default function HistoryPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const symbolParam = Array.isArray(searchParams?.symbol)
    ? searchParams?.symbol[0]
    : searchParams?.symbol;
  const symbolFilter = symbolParam?.trim() || undefined;
  const universeParam = Array.isArray(searchParams?.universe)
    ? searchParams?.universe[0]
    : searchParams?.universe;
  const universeFilter = universeParam?.trim() || undefined;

  const runs = getRunHistory(symbolFilter, universeFilter);
  const filtered = runs.filter((r) => r.matchesUniverse && (!symbolFilter || r.includesSymbol));
  const displayRuns = filtered.slice(0, 20);

  if (runs.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-text-primary mb-4">No Run History</h2>
        <p className="text-text-secondary mb-6">
          Run the daily analysis to generate your first briefing.
        </p>
        <code className="bg-navy-800 border border-navy-700 px-4 py-2 rounded text-sm text-accent-blue">
          npm run run:daily
        </code>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Run History</h2>
          <p className="text-text-secondary text-sm">
            Showing {displayRuns.length} of {runs.length} runs
          </p>
        </div>
        <form className="flex items-center gap-2 flex-wrap" method="get">
          <input
            type="text"
            name="symbol"
            defaultValue={symbolFilter ?? ""}
            placeholder="Filter by symbol"
            className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue"
          />
          <input
            type="text"
            name="universe"
            defaultValue={universeFilter ?? ""}
            placeholder="Filter by universe"
            className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue"
          />
          <button
            type="submit"
            className="text-sm px-3 py-2 rounded-lg border border-navy-700 bg-navy-800 text-text-secondary hover:text-text-primary"
          >
            Apply
          </button>
          {(symbolFilter || universeFilter) && (
            <a
              href="/history"
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
                  Run Date
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  As Of
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Universe
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Symbols
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Provider
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Requests
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Run ID
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  File
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {displayRuns.map((run, index) => {
                const href =
                  `/history/${run.runId}` +
                  (symbolFilter ? `?symbol=${encodeURIComponent(symbolFilter)}` : "");
                return (
                <tr
                  key={run.runId}
                  className="hover:bg-navy-700/40 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-text-muted font-mono">{index + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    <Link href={href} className="hover:text-accent-blue">
                      {run.runDate}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{run.asOfDate}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{run.universe}</td>
                  <td className="px-4 py-3 text-sm text-right text-text-secondary">
                    {run.symbolCount}/{run.universeCount}
                    {run.truncated && (
                      <span className="ml-2 text-[11px] text-accent-gold">
                        ⚠ truncated
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{run.provider}</td>
                  <td className="px-4 py-3 text-sm text-right text-text-secondary">
                    {run.requests ?? "N/A"}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary font-mono">
                    <Link href={href} className="hover:text-accent-blue">
                      {run.runId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{run.fileName}</td>
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
