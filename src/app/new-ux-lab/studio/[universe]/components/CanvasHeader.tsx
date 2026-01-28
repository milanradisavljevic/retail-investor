import type { RunV1SchemaJson } from "@/types/generated/run_v1";

export function CanvasHeader({ run }: { run: RunV1SchemaJson }) {
  const top30Count = run.selections?.top30?.length || 0;
  const scoringMode = run.mode?.label || "Default";

  return (
    <div className="border-b border-border-subtle pb-4">
      {/* Breadcrumb */}
      <div className="text-xs text-text-tertiary mb-2">
        <span className="hover:text-text-secondary cursor-pointer">Studio</span>
        <span className="mx-2">/</span>
        <span className="text-text-primary">{run.universe.definition.name}</span>
      </div>

      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-1">
            Top {top30Count} Picks
          </h1>
          <div className="flex items-center gap-3 text-sm text-text-secondary">
            <span>{run.as_of_date}</span>
            <span>·</span>
            <span className="font-medium">{scoringMode} strategy</span>
          </div>
        </div>

        {/* View Mode Toggle (Placeholder) */}
        <div className="flex gap-2">
          <button className="px-3 py-1.5 text-xs bg-surface-2 border border-border-emphasis rounded-md text-text-primary">
            Table
          </button>
          <button className="px-3 py-1.5 text-xs border border-border-subtle rounded-md text-text-secondary hover:text-text-primary hover:border-border-default transition">
            Cards
          </button>
        </div>
      </div>
    </div>
  );
}
