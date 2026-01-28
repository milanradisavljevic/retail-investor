import { getLatestRun, getRecentRuns } from "@/lib/runLoader";
import { StudioLayout } from "./components/StudioLayout";
import { LeftRail } from "./components/LeftRail";
import { CentralCanvas } from "./components/CentralCanvas";
import { Inspector } from "./components/Inspector";
import { getAvailableUniverses } from "./lib/universes";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";

async function loadLatestRunForUniverse(universeName: string) {
  const runs = getRecentRuns(50);
  const decodedName = decodeURIComponent(universeName);
  return runs.find((r) => r.run.universe.definition.name === decodedName) || null;
}

async function loadRunHistory(universeName: string, limit: number = 10) {
  const allRuns = getRecentRuns(50);
  const decodedName = decodeURIComponent(universeName);
  return allRuns
    .filter((r) => r.run.universe.definition.name === decodedName)
    .slice(0, limit);
}

export default async function StudioWorkspacePage({
  params,
}: {
  params: Promise<{ universe: string }>;
}) {
  const { universe: encodedUniverseName } = await params;
  const currentRun = await loadLatestRunForUniverse(encodedUniverseName);
  const runHistory = await loadRunHistory(encodedUniverseName, 10);
  const availableUniverses = getAvailableUniverses();

  if (!currentRun) {
    const decodedName = decodeURIComponent(encodedUniverseName);
    return (
      <div className="min-h-screen bg-surface-0 text-text-primary flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-text-primary mb-3">
            No Runs for {decodedName}
          </h2>
          <p className="text-text-secondary mb-6">
            Run an analysis for this universe to see results.
          </p>
        </div>
      </div>
    );
  }

  return (
    <StudioLayout universe={encodedUniverseName}>
      <LeftRail
        runHistory={runHistory}
        currentRun={currentRun.run}
        currentUniverse={encodedUniverseName}
        availableUniverses={availableUniverses}
      />
      <CentralCanvas run={currentRun.run} />
      <Inspector run={currentRun.run} universe={encodedUniverseName} />
    </StudioLayout>
  );
}
