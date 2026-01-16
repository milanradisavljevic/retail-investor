"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import type { ScoreFilters, SortOption } from "@/lib/scoreView";

interface BriefingToolbarProps {
  basePath?: string;
  initialSort: SortOption;
  initialFilters: ScoreFilters;
}

const sortOptions: Array<{ value: SortOption; label: string }> = [
  { value: "total", label: "Total" },
  { value: "expected_return", label: "Expected Return" },
  { value: "fundamental", label: "Fundamental" },
  { value: "technical", label: "Technical" },
  { value: "confidence", label: "Confidence" },
];

type FlagKey = keyof Pick<
  ScoreFilters,
  "deepAnalysis" | "confidenceLow" | "missingData" | "upsideNegative"
>;

const flagParamMap: Record<FlagKey, string> = {
  deepAnalysis: "deep_analysis",
  confidenceLow: "confidence_low",
  missingData: "missing_data",
  upsideNegative: "upside_negative",
};

export function BriefingToolbar({
  basePath = "/",
  initialSort,
  initialFilters,
}: BriefingToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const params = useMemo(() => new URLSearchParams(searchParams?.toString() ?? ""), [searchParams]);

  const sortParam = params.get("sort");
  const currentSort: SortOption =
    (sortParam as SortOption | null) ??
    sortOptions.find((o) => o.value === initialSort)?.value ??
    "total";

  const currentFlags: Record<FlagKey, boolean> = {
    deepAnalysis: params.has(flagParamMap.deepAnalysis)
      ? params.get(flagParamMap.deepAnalysis) === "1"
      : initialFilters.deepAnalysis,
    confidenceLow: params.has(flagParamMap.confidenceLow)
      ? params.get(flagParamMap.confidenceLow) === "1"
      : initialFilters.confidenceLow,
    missingData: params.has(flagParamMap.missingData)
      ? params.get(flagParamMap.missingData) === "1"
      : initialFilters.missingData,
    upsideNegative: params.has(flagParamMap.upsideNegative)
      ? params.get(flagParamMap.upsideNegative) === "1"
      : initialFilters.upsideNegative,
  };

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });

    const query = next.toString();
    router.replace(query ? `${basePath}?${query}` : basePath, { scroll: false });
  };

  const toggleFlag = (key: FlagKey) => {
    const param = flagParamMap[key];
    const active = currentFlags[key];
    updateParams({ [param]: active ? null : "1" });
  };

  const resetFilters = () => {
    const next = new URLSearchParams(params.toString());
    ["sort", ...Object.values(flagParamMap)].forEach((key) => next.delete(key));
    const query = next.toString();
    router.replace(query ? `${basePath}?${query}` : basePath, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 bg-navy-800 border border-navy-700 rounded-xl px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted uppercase tracking-wider">Sort</span>
        <select
          value={currentSort}
          onChange={(e) => updateParams({ sort: e.target.value })}
          className="bg-navy-700 text-text-primary text-sm border border-navy-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-blue"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-text-muted uppercase tracking-wider">Filters</span>
        <button
          type="button"
          onClick={() => toggleFlag("deepAnalysis")}
          className={`text-sm px-3 py-1 rounded-full border transition-colors ${
            currentFlags.deepAnalysis
              ? "border-accent-blue text-accent-blue bg-accent-blue/10"
              : "border-navy-600 text-text-secondary hover:border-navy-500"
          }`}
        >
          Deep Analysis
        </button>
        <button
          type="button"
          onClick={() => toggleFlag("confidenceLow")}
          className={`text-sm px-3 py-1 rounded-full border transition-colors ${
            currentFlags.confidenceLow
              ? "border-accent-gold text-accent-gold bg-accent-gold/10"
              : "border-navy-600 text-text-secondary hover:border-navy-500"
          }`}
        >
          Confidence: Low
        </button>
        <button
          type="button"
          onClick={() => toggleFlag("missingData")}
          className={`text-sm px-3 py-1 rounded-full border transition-colors ${
            currentFlags.missingData
              ? "border-accent-red text-accent-red bg-accent-red/10"
              : "border-navy-600 text-text-secondary hover:border-navy-500"
          }`}
        >
          Missing Data
        </button>
        <button
          type="button"
          onClick={() => toggleFlag("upsideNegative")}
          className={`text-sm px-3 py-1 rounded-full border transition-colors ${
            currentFlags.upsideNegative
              ? "border-accent-red text-accent-red bg-accent-red/10"
              : "border-navy-600 text-text-secondary hover:border-navy-500"
          }`}
        >
          Upside Negative
        </button>
        <button
          type="button"
          onClick={resetFilters}
          className="ml-auto text-xs text-text-muted hover:text-text-primary underline"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
