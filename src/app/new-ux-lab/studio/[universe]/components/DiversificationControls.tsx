"use client";

import type { DraftConfig } from "./ConfigInspector";

export function DiversificationControls({
  diversification,
  onChange,
}: {
  diversification: DraftConfig["diversification"];
  onChange: (key: keyof DraftConfig["diversification"], value: number | boolean) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Enable Toggle */}
      <div className="flex items-center justify-between">
        <label className="text-sm text-text-secondary">Enable diversification caps</label>
        <button
          onClick={() => onChange("enabled", !diversification.enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
            diversification.enabled ? "bg-accent-500" : "bg-surface-3"
          }`}
          role="switch"
          aria-checked={diversification.enabled}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
              diversification.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {diversification.enabled && (
        <>
          {/* Sector Cap */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-text-secondary">Sector cap</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={diversification.sectorCap}
                  onChange={(e) => onChange("sectorCap", parseInt(e.target.value) || 0)}
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
              value={diversification.sectorCap}
              onChange={(e) => onChange("sectorCap", parseInt(e.target.value))}
              className="w-full h-2 bg-surface-2 rounded-lg appearance-none cursor-pointer slider"
            />
            <p className="text-xs text-text-tertiary mt-1">
              Max % of portfolio from single sector
            </p>
          </div>

          {/* Industry Cap */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-text-secondary">Industry cap</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={diversification.industryCap}
                  onChange={(e) => onChange("industryCap", parseInt(e.target.value) || 0)}
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
              value={diversification.industryCap}
              onChange={(e) => onChange("industryCap", parseInt(e.target.value))}
              className="w-full h-2 bg-surface-2 rounded-lg appearance-none cursor-pointer slider"
            />
            <p className="text-xs text-text-tertiary mt-1">
              Max % of portfolio from single industry
            </p>
          </div>
        </>
      )}

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
      `}</style>
    </div>
  );
}
