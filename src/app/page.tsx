import { getRecentRuns } from "@/lib/runLoader";
import { computeDeltas } from "@/lib/runDelta";
import { buildScoreView, parseScoreQuery, type ScoreQuery, type ScoreSearchParams } from "@/lib/scoreView";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import type { SymbolDelta } from "@/lib/runDelta";
import { getCompanyName } from "@/core/company";
import { DashboardClient } from "./components/DashboardClient";

type AwaitableScoreSearchParams = Promise<ScoreSearchParams> | undefined;

export default async function Home({
  searchParams,
}: {
  searchParams?: AwaitableScoreSearchParams;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const query: ScoreQuery = parseScoreQuery(resolvedSearchParams);
  const [latest, previous] = getRecentRuns(2);
  const run = latest?.run ?? null;

  // Enrich company names from local map so dashboard shows full names even if run data is missing them
  const runWithNames: RunV1SchemaJson | null = run
    ? {
        ...run,
        scores: run.scores.map((s) => ({
          ...s,
          company_name: s.company_name ?? getCompanyName(s.symbol),
        })),
      }
    : null;

  const deltaMap: Map<string, SymbolDelta> = runWithNames
    ? computeDeltas(runWithNames, previous?.run)
    : new Map<string, SymbolDelta>();

  if (!runWithNames) {
    return (
        <DashboardClient 
            run={null} 
            topCardScores={[]} 
            topTableScores={[]} 
            query={query} 
            visibleCount={0} 
            totalCount={0} 
        />
    );
  }

  const sortedScores = buildScoreView(runWithNames, query);
  const totalCount = runWithNames.scores.length;
  const visibleCount = sortedScores.length;
  const deltaLookup = Object.fromEntries(deltaMap.entries());
  const topCardScores = sortedScores.slice(0, 20).map((score, index) => ({
    score,
    rank: index + 1,
    delta: deltaLookup[score.symbol],
    isPickOfDay: score.symbol === run.selections?.pick_of_the_day,
  }));
  const topTableScores = sortedScores.slice(0, 10).map((score, index) => ({
    score,
    rank: index + 1,
    delta: deltaLookup[score.symbol],
  }));

  return (
    <DashboardClient
      run={runWithNames}
      topCardScores={topCardScores}
      topTableScores={topTableScores}
      query={query}
      visibleCount={visibleCount}
      totalCount={totalCount}
    />
  );
}
