"use client";

import { useState, useMemo } from "react";

interface SectorExposureProps {
  picks: Array<{ symbol: string; industry: string; sector?: string }>;
}

export function SectorExposure({ picks }: SectorExposureProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const stats = useMemo(() => {
    const total = picks.length;
    if (total === 0) return [];

    const counts: Record<string, number> = {};
    picks.forEach((pick) => {
      // Prefer sector if available, otherwise industry, fallback to "Other"
      const key = pick.sector || pick.industry || "Other";
      counts[key] = (counts[key] || 0) + 1;
    });

    const sorted = Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        percent: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count);

    return sorted.slice(0, 5); // Top 5
  }, [picks]);

  if (picks.length === 0) return null;

  return (
    <div className="border border-[#1F2937] bg-[#0F172A] rounded-xl overflow-hidden mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1E293B] transition-colors"
      >
        <span className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide">
          Sector Exposure
        </span>
        <div className="flex items-center gap-2">
           {/* Preview of top sector */}
          {!isExpanded && stats.length > 0 && (
            <span className="text-xs text-[#64748B]">
              Top: {stats[0].name} ({Math.round(stats[0].percent)}%)
            </span>
          )}
          <span className="text-[#94A3B8]">
            {isExpanded ? "−" : "+"}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-1 space-y-3">
          {stats.map((stat) => (
            <div key={stat.name} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium truncate pr-2">
                  {stat.name}
                </span>
                <span className="text-slate-400 whitespace-nowrap">
                  {Math.round(stat.percent)}% <span className="text-slate-600">({stat.count})</span>
                </span>
              </div>
              <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${stat.percent}%` }}
                />
              </div>
            </div>
          ))}
          {stats.length === 0 && (
            <p className="text-xs text-slate-500 italic">No sector data available</p>
          )}
        </div>
      )}
    </div>
  );
}
