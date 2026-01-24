import { getLatestRun } from "@/lib/runLoader";
import { getMarketContext } from "@/lib/marketContext";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import StrategyLabClient from "./StrategyLabClient";
import { loadUniversesWithMetadata, loadPresets } from "./loaders";

export default async function StrategyLabPage() {
  const latest = getLatestRun();
  const run: RunV1SchemaJson | null = latest?.run ?? null;

  // Load universes, presets, and initial market context server-side
  const [universes, presets, marketContext] = await Promise.all([
    loadUniversesWithMetadata(),
    loadPresets(),
    getMarketContext().catch(() => null),
  ]);

  return (
    <StrategyLabClient
      latestRun={run}
      universes={universes}
      presets={presets}
      marketContext={marketContext}
    />
  );
}
