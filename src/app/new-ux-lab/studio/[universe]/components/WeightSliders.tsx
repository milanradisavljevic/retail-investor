"use client";

import { useMemo } from "react";
import type { DraftConfig } from "./ConfigInspector";

export function WeightSliders({
  weights,
  onChange,
}: {
  weights: DraftConfig["weights"];
  onChange: (pillar: keyof DraftConfig["weights"], value: number) => void;
}) {
  const total = useMemo(() => {
    return weights.valuation + weights.quality + weights.technical + weights.risk;
  }, [weights]);

  const isValid = total === 100;

  return (
    <div className="space-y-4">
      {(Object.keys(weights) as Array<keyof DraftConfig["weights"]>).map((pillar) => (
        <div key={pillar}>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-text-secondary capitalize">{pillar}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={weights[pillar]}
                onChange={(e) => onChange(pillar, parseInt(e.target.value) || 0)}
                className="w-16 px-2 py-1 bg-surface-2 border border-border-default rounded text-xs text-text-primary text-right font-mono focus:outline-none focus:border-accent-500"
              />
              <span className="text-xs text-text-tertiary">%</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={weights[pillar]}
            onChange={(e) => onChange(pillar, parseInt(e.target.value))}
            className="w-full h-2 bg-surface-2 rounded-lg appearance-none cursor-pointer slider"
          />
        </div>
      ))}

      {/* Total Indicator */}
      <div className={`px-3 py-2 rounded-md border ${
        isValid
          ? "bg-success/10 border-success/30 text-success"
          : "bg-warning/10 border-warning/30 text-warning"
      }`}>
        <div className="flex items-center justify-between text-xs">
          <span>Total</span>
          <span className="font-mono font-medium">{total}%</span>
        </div>
        {!isValid && (
          <p className="text-xs mt-1 opacity-80">
            Weights must sum to 100%
          </p>
        )}
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--accent-500);
          cursor: pointer;
        }

        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--accent-500);
          cursor: pointer;
          border: none;
        }

        .slider:focus::-webkit-slider-thumb {
          box-shadow: 0 0 0 3px var(--accent-500);
          opacity: 0.3;
        }

        .slider:focus::-moz-range-thumb {
          box-shadow: 0 0 0 3px var(--accent-500);
          opacity: 0.3;
        }
      `}</style>
    </div>
  );
}
