import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import type { LoadedRun } from "@/lib/runLoader";
import type { UniverseInfo } from "../lib/universes";
import Link from "next/link";
import { UniverseSelector } from "./UniverseSelector";

export function LeftRail({
  runHistory,
  currentRun,
  currentUniverse,
  availableUniverses,
}: {
  runHistory: LoadedRun[];
  currentRun: RunV1SchemaJson;
  currentUniverse: string;
  availableUniverses: UniverseInfo[];
}) {
  const top30Count = currentRun.selections?.top30?.length || 0;

  return (
    <aside className="w-60 border-r border-border-subtle bg-surface-1 h-[calc(100vh-3.5rem)] overflow-y-auto">
      <div className="p-4 space-y-6">
        {/* Universe Selector */}
        <UniverseSelector
          currentUniverse={currentUniverse}
          availableUniverses={availableUniverses.map((u) => ({
            name: u.name,
            encodedName: u.encodedName,
          }))}
        />

        {/* Current Run Badge */}
        <div>
          <label className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2 block">
            Current Run
          </label>
          <div className="bg-surface-2 border border-border-default rounded-md p-3">
            <div className="text-xs text-text-secondary mb-1">
              {currentRun.as_of_date}
            </div>
            <div className="text-sm text-text-primary font-medium mb-1">
              {currentRun.mode?.label || 'Default'} Strategy
            </div>
            <div className="text-xs text-text-tertiary">
              {top30Count} picks
            </div>
          </div>
        </div>

        {/* Run History */}
        <div>
          <label className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2 block">
            Run History
          </label>
          <div className="space-y-1">
            {runHistory.slice(0, 10).map((item, idx) => {
              const isCurrent = item.run.run_id === currentRun.run_id;
              return (
                <div
                  key={item.run.run_id}
                  className={`px-3 py-2 rounded-md text-sm transition ${
                    isCurrent
                      ? "bg-surface-3 border border-border-emphasis text-text-primary"
                      : "hover:bg-surface-2 text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <div className="text-xs">{item.run.as_of_date}</div>
                  <div className="text-xs font-medium truncate">
                    {item.run.mode?.label || 'Default'}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {item.run.selections?.top30?.length || 0} picks
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="pt-4 border-t border-border-subtle space-y-2">
          <Link
            href="/new-ux-lab"
            className="block px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-2 rounded-md transition"
          >
            ← Back to Lab
          </Link>
          <Link
            href="/"
            className="block px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-2 rounded-md transition"
          >
            ← Classic View
          </Link>
        </div>
      </div>
    </aside>
  );
}
