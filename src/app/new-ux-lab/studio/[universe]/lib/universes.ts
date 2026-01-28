import { getRecentRuns } from "@/lib/runLoader";

export interface UniverseInfo {
  name: string;
  encodedName: string;
  lastRunDate: string;
  runCount: number;
}

export function getAvailableUniverses(): UniverseInfo[] {
  const allRuns = getRecentRuns(100);

  // Group runs by universe name
  const universeMap = new Map<string, { lastDate: string; count: number }>();

  allRuns.forEach((loadedRun) => {
    const universeName = loadedRun.run.universe.definition.name;
    const runDate = loadedRun.run.as_of_date;

    const existing = universeMap.get(universeName);
    if (!existing || runDate > existing.lastDate) {
      universeMap.set(universeName, {
        lastDate: runDate,
        count: (existing?.count || 0) + 1,
      });
    } else {
      universeMap.set(universeName, {
        lastDate: existing.lastDate,
        count: existing.count + 1,
      });
    }
  });

  // Convert to array and sort by last run date (most recent first)
  return Array.from(universeMap.entries())
    .map(([name, info]) => ({
      name,
      encodedName: encodeURIComponent(name),
      lastRunDate: info.lastDate,
      runCount: info.count,
    }))
    .sort((a, b) => b.lastRunDate.localeCompare(a.lastRunDate));
}
