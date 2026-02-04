import { getLatestRun, getRunById, type LoadedRun } from "@/lib/runLoader";
import { getMarketContext } from "@/lib/marketContext";
import { loadRunHistory } from "@/lib/runHistory";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import StrategyLabClient from "./StrategyLabClient";
import { SidebarWrapper } from "./SidebarWrapper";
import { loadUniversesWithMetadata, loadPresets } from "./loaders";
import { loadRecentBacktests } from "./loadRecentBacktests";

export default async function StrategyLabPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>;
}) {
  const { runId } = await searchParams;

  let runData: LoadedRun | null = null;
  if (runId) {
    runData = getRunById(runId);
  }

  // Fallback to latest if no ID or ID not found
  if (!runData) {
    runData = getLatestRun();
  }

  const run: RunV1SchemaJson | null = runData?.run ?? null;

  // Load universes, presets, initial market context, history, and recent backtests server-side
  const [universes, presets, marketContext, history, recentBacktests] = await Promise.all([
    loadUniversesWithMetadata(),
    loadPresets(),
    getMarketContext().catch(() => null),
    loadRunHistory(10),
    Promise.resolve(loadRecentBacktests(5)),
  ]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <SidebarWrapper runs={history} activeRunId={run?.run_id} />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto scrollbar-thin scrollbar-thumb-navy-600 scrollbar-track-navy-900">
        <div className="p-4 md:p-6 lg:p-8 max-w-[1920px] mx-auto w-full">
          <StrategyLabClient
            latestRun={run}
            universes={universes}
            presets={presets}
            marketContext={marketContext}
            recentBacktests={recentBacktests}
          />
        </div>
      </main>
    </div>
  );
}