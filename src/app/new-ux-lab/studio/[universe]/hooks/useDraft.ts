"use client";

import { useState, useEffect, useCallback } from "react";
import type { DraftConfig } from "../components/ConfigInspector";

function isEqual(a: DraftConfig, b: DraftConfig): boolean {
  return (
    a.preset === b.preset &&
    a.weights.valuation === b.weights.valuation &&
    a.weights.quality === b.weights.quality &&
    a.weights.technical === b.weights.technical &&
    a.weights.risk === b.weights.risk &&
    a.diversification.enabled === b.diversification.enabled &&
    a.diversification.sectorCap === b.diversification.sectorCap &&
    a.diversification.industryCap === b.diversification.industryCap &&
    a.topK === b.topK
  );
}

export function useDraft(universe: string, currentConfig: DraftConfig) {
  const storageKey = `studio:draft:${universe}`;

  // Initialize with currentConfig to avoid hydration mismatch
  const [draft, setDraftState] = useState<DraftConfig>(currentConfig);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage after hydration
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setDraftState({ ...currentConfig, ...parsed });
      }
    } catch (err) {
      console.error("Failed to load draft from localStorage:", err);
    }
    setIsHydrated(true);
  }, [storageKey, currentConfig]);

  const dirty = isHydrated && !isEqual(draft, currentConfig);

  const setDraft = useCallback(
    (newDraft: DraftConfig) => {
      setDraftState(newDraft);
      try {
        localStorage.setItem(storageKey, JSON.stringify(newDraft));
      } catch (err) {
        console.error("Failed to save draft to localStorage:", err);
      }
    },
    [storageKey]
  );

  const reset = useCallback(() => {
    setDraftState(currentConfig);
    try {
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.error("Failed to remove draft from localStorage:", err);
    }
  }, [currentConfig, storageKey]);

  return { draft, setDraft, reset, dirty };
}
