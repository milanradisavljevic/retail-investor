"use client";

import { useMemo } from "react";
import type { DraftConfig } from "./ConfigInspector";

interface ConfigDiff {
  weightsChanged: boolean;
  weightsDelta: { pillar: string; from: number; to: number }[];
  diversificationChanged: boolean;
  diversificationDelta: { setting: string; from: string; to: string }[];
}

function compareConfig(current: DraftConfig, draft: DraftConfig): ConfigDiff {
  const weightsDelta: { pillar: string; from: number; to: number }[] = [];
  let weightsChanged = false;

  (Object.keys(current.weights) as Array<keyof DraftConfig["weights"]>).forEach((pillar) => {
    if (current.weights[pillar] !== draft.weights[pillar]) {
      weightsChanged = true;
      weightsDelta.push({
        pillar,
        from: current.weights[pillar],
        to: draft.weights[pillar],
      });
    }
  });

  const diversificationDelta: { setting: string; from: string; to: string }[] = [];
  let diversificationChanged = false;

  if (current.diversification.enabled !== draft.diversification.enabled) {
    diversificationChanged = true;
    diversificationDelta.push({
      setting: "Enabled",
      from: current.diversification.enabled ? "Yes" : "No",
      to: draft.diversification.enabled ? "Yes" : "No",
    });
  }

  if (current.diversification.sectorCap !== draft.diversification.sectorCap) {
    diversificationChanged = true;
    diversificationDelta.push({
      setting: "Sector cap",
      from: `${current.diversification.sectorCap}%`,
      to: `${draft.diversification.sectorCap}%`,
    });
  }

  if (current.diversification.industryCap !== draft.diversification.industryCap) {
    diversificationChanged = true;
    diversificationDelta.push({
      setting: "Industry cap",
      from: `${current.diversification.industryCap}%`,
      to: `${draft.diversification.industryCap}%`,
    });
  }

  return {
    weightsChanged,
    weightsDelta,
    diversificationChanged,
    diversificationDelta,
  };
}

export function DirtyIndicator({
  onReset,
  currentConfig,
  draftConfig,
}: {
  onReset: () => void;
  currentConfig: DraftConfig;
  draftConfig: DraftConfig;
}) {
  const diff = useMemo(() => compareConfig(currentConfig, draftConfig), [currentConfig, draftConfig]);

  return (
    <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-warning rounded-full" />
          <span className="text-xs font-medium text-warning">Unsaved changes</span>
        </div>
        <button
          onClick={onReset}
          className="text-xs text-text-secondary hover:text-text-primary underline underline-offset-2 transition"
        >
          Reset
        </button>
      </div>

      <div className="text-xs text-text-secondary space-y-1">
        {diff.weightsChanged && (
          <div>
            <span className="font-medium text-text-primary">Weights:</span>
            {diff.weightsDelta.map((delta) => (
              <div key={delta.pillar} className="ml-2">
                <span className="capitalize">{delta.pillar}</span>{" "}
                <span className="text-text-tertiary">{delta.from}% → {delta.to}%</span>
              </div>
            ))}
          </div>
        )}

        {diff.diversificationChanged && (
          <div>
            <span className="font-medium text-text-primary">Diversification:</span>
            {diff.diversificationDelta.map((delta) => (
              <div key={delta.setting} className="ml-2">
                {delta.setting}{" "}
                <span className="text-text-tertiary">{delta.from} → {delta.to}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
