"use client";

import { useState, useMemo } from "react";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import { useDraft } from "../hooks/useDraft";
import { PresetSelector } from "./PresetSelector";
import { WeightSliders } from "./WeightSliders";
import { DiversificationControls } from "./DiversificationControls";
import { DirtyIndicator } from "./DirtyIndicator";
import { RunAnalysisButton } from "./RunAnalysisButton";

export interface DraftConfig {
  preset: string | null;
  weights: {
    valuation: number;
    quality: number;
    technical: number;
    risk: number;
  };
  diversification: {
    enabled: boolean;
    sectorCap: number;
    industryCap: number;
  };
  topK: number;
}

// Default presets
const PRESETS: Record<string, Omit<DraftConfig, "preset">> = {
  rocket: {
    weights: { valuation: 15, quality: 20, technical: 50, risk: 15 },
    diversification: { enabled: true, sectorCap: 30, industryCap: 20 },
    topK: 30,
  },
  "deep-value": {
    weights: { valuation: 50, quality: 30, technical: 10, risk: 10 },
    diversification: { enabled: true, sectorCap: 25, industryCap: 15 },
    topK: 30,
  },
  balanced: {
    weights: { valuation: 30, quality: 30, technical: 25, risk: 15 },
    diversification: { enabled: true, sectorCap: 30, industryCap: 20 },
    topK: 30,
  },
  quality: {
    weights: { valuation: 20, quality: 50, technical: 20, risk: 10 },
    diversification: { enabled: true, sectorCap: 30, industryCap: 20 },
    topK: 30,
  },
  "risk-aware": {
    weights: { valuation: 25, quality: 25, technical: 20, risk: 30 },
    diversification: { enabled: true, sectorCap: 25, industryCap: 15 },
    topK: 30,
  },
};

function getCurrentConfig(run: RunV1SchemaJson): DraftConfig {
  // Try to infer current config from run data
  // Since we don't have preset stored, we'll default to balanced
  return {
    preset: null,
    weights: { valuation: 30, quality: 30, technical: 25, risk: 15 },
    diversification: {
      enabled: run.selections?.diversification_applied || false,
      sectorCap: 30,
      industryCap: 20,
    },
    topK: run.selections?.top30?.length || 30,
  };
}

export function ConfigInspector({
  run,
  universe,
}: {
  run: RunV1SchemaJson;
  universe: string;
}) {
  const currentConfig = useMemo(() => getCurrentConfig(run), [run]);
  const { draft, setDraft, reset, dirty } = useDraft(universe, currentConfig);
  const [showCustomControls, setShowCustomControls] = useState(!draft.preset);

  const handlePresetSelect = (presetKey: string) => {
    const presetConfig = PRESETS[presetKey];
    if (presetConfig) {
      setDraft({
        preset: presetKey,
        ...presetConfig,
      });
      setShowCustomControls(false);
    }
  };

  const handleCustomize = () => {
    setDraft({ ...draft, preset: null });
    setShowCustomControls(true);
  };

  const handleWeightChange = (pillar: keyof DraftConfig["weights"], value: number) => {
    setDraft({
      ...draft,
      weights: { ...draft.weights, [pillar]: value },
    });
  };

  const handleDiversificationChange = (
    key: keyof DraftConfig["diversification"],
    value: number | boolean
  ) => {
    setDraft({
      ...draft,
      diversification: { ...draft.diversification, [key]: value },
    });
  };

  return (
    <div className="space-y-6">
      {/* Dirty Indicator */}
      {dirty && <DirtyIndicator onReset={reset} currentConfig={currentConfig} draftConfig={draft} />}

      {/* Preset Selector */}
      <div>
        <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3 block">
          Strategy Preset
        </label>
        <PresetSelector
          selectedPreset={draft.preset}
          onPresetSelect={handlePresetSelect}
          onCustomize={handleCustomize}
        />
      </div>

      {/* Custom Controls (expanded when no preset or customize clicked) */}
      {showCustomControls && (
        <div className="space-y-6 pt-4 border-t border-border-subtle">
          <div>
            <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3 block">
              Pillar Weights
            </label>
            <WeightSliders weights={draft.weights} onChange={handleWeightChange} />
          </div>

          <div>
            <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3 block">
              Diversification
            </label>
            <DiversificationControls
              diversification={draft.diversification}
              onChange={handleDiversificationChange}
            />
          </div>
        </div>
      )}

      {/* Preset Weights Display (when preset selected) */}
      {draft.preset && !showCustomControls && (
        <div className="pt-4 border-t border-border-subtle">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
              Preset Weights
            </label>
            <button
              onClick={handleCustomize}
              className="text-xs text-accent-500 hover:text-accent-600 transition"
            >
              Customize
            </button>
          </div>
          <div className="space-y-2">
            {Object.entries(draft.weights).map(([pillar, weight]) => (
              <div key={pillar} className="flex items-center justify-between">
                <span className="text-sm text-text-secondary capitalize">{pillar}</span>
                <span className="px-2 py-0.5 bg-surface-2 border border-border-default rounded text-xs font-medium text-text-primary">
                  {weight}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run Analysis Button */}
      <div className="pt-6 border-t border-border-subtle">
        <RunAnalysisButton
          disabled={!dirty}
          universe={universe}
          symbolCount={run.scores.length}
          provider={run.provider.name}
        />
      </div>
    </div>
  );
}
