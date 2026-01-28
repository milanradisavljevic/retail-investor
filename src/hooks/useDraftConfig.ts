import { useState, useEffect, useCallback } from "react";

export interface DraftConfig {
  universe: string;
  preset: string | null;
  weights: {
    valuation: number;
    quality: number;
    technical: number;
    risk: number;
  };
  filters: {
    excludeCrypto: boolean;
    marketCapMin: number;
    liquidityMin: number;
    excludeDefense: boolean;
    excludeFossil: boolean;
  };
  topK: number;
}

interface DraftState {
  draft: DraftConfig;
  setDraft: (config: DraftConfig) => void;
  updateDraft: (partial: Partial<DraftConfig>) => void;
  isDirty: boolean;
  diffSummary: string | null;
  reset: () => void;
  clearDraft: () => void;
}

/**
 * Custom hook for managing draft configuration with localStorage persistence.
 * Prevents accidental expensive runs by tracking unsaved changes.
 */
export function useDraftConfig(
  currentConfig: DraftConfig,
  storageKey: string = "strategy-lab-draft"
): DraftState {
  // Initialize with currentConfig to avoid hydration mismatch
  const [draft, setDraftState] = useState<DraftConfig>(currentConfig);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage after hydration
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as DraftConfig;
        // Merge with currentConfig to ensure all fields exist
        setDraftState({ ...currentConfig, ...parsed });
      } catch (err) {
        console.warn("[useDraftConfig] Failed to parse stored draft:", err);
      }
    }
    setIsHydrated(true);
  }, [storageKey, currentConfig]);

  // Sync to localStorage on change
  useEffect(() => {
    if (!isHydrated) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch (err) {
      console.warn("[useDraftConfig] Failed to save draft to localStorage:", err);
    }
  }, [draft, storageKey, isHydrated]);

  // Cross-tab sync: listen for storage events
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as DraftConfig;
          setDraftState(parsed);
        } catch (err) {
          console.warn("[useDraftConfig] Failed to parse storage event:", err);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [storageKey]);

  // Compute diff
  const isDirty = isHydrated && !isEqual(draft, currentConfig);
  const diffSummary = isDirty ? computeDiff(draft, currentConfig) : null;

  // Update draft (partial merge)
  const updateDraft = useCallback((partial: Partial<DraftConfig>) => {
    setDraftState((prev) => ({ ...prev, ...partial }));
  }, []);

  // Reset to currentConfig
  const reset = useCallback(() => {
    setDraftState(currentConfig);
  }, [currentConfig]);

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(storageKey);
    setDraftState(currentConfig);
  }, [storageKey, currentConfig]);

  return {
    draft,
    setDraft: setDraftState,
    updateDraft,
    isDirty,
    diffSummary,
    reset,
    clearDraft,
  };
}

/**
 * Deep equality check for two configs
 */
function isEqual(a: DraftConfig, b: DraftConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compute human-readable diff summary
 */
function computeDiff(draft: DraftConfig, current: DraftConfig): string {
  const changes: string[] = [];

  // Universe change
  if (draft.universe !== current.universe) {
    changes.push(`Universe: ${current.universe} → ${draft.universe}`);
  }

  // Preset change
  if (draft.preset !== current.preset) {
    const presetLabel = draft.preset ? draft.preset : "Custom";
    const currentLabel = current.preset ? current.preset : "Custom";
    changes.push(`Preset: ${currentLabel} → ${presetLabel}`);
  }

  // Weight changes
  const weightChanges = (Object.keys(draft.weights) as Array<keyof typeof draft.weights>)
    .filter((k) => draft.weights[k] !== current.weights[k])
    .map((k) => `${k.charAt(0).toUpperCase() + k.slice(1)} ${current.weights[k]}→${draft.weights[k]}%`);

  if (weightChanges.length > 0) {
    changes.push(`Weights: ${weightChanges.join(", ")}`);
  }

  // Filter changes
  const filterChanges: string[] = [];

  if (draft.filters.excludeCrypto !== current.filters.excludeCrypto) {
    filterChanges.push(`Crypto ${current.filters.excludeCrypto ? "included" : "excluded"} → ${draft.filters.excludeCrypto ? "excluded" : "included"}`);
  }

  if (draft.filters.excludeDefense !== current.filters.excludeDefense) {
    filterChanges.push(`Defense ${current.filters.excludeDefense ? "excluded" : "included"} → ${draft.filters.excludeDefense ? "excluded" : "included"}`);
  }

  if (draft.filters.excludeFossil !== current.filters.excludeFossil) {
    filterChanges.push(`Fossil ${current.filters.excludeFossil ? "excluded" : "included"} → ${draft.filters.excludeFossil ? "excluded" : "included"}`);
  }

  if (draft.filters.marketCapMin !== current.filters.marketCapMin) {
    filterChanges.push(`Min Cap ${current.filters.marketCapMin}M → ${draft.filters.marketCapMin}M`);
  }

  if (draft.filters.liquidityMin !== current.filters.liquidityMin) {
    filterChanges.push(`Min Liquidity ${current.filters.liquidityMin}M → ${draft.filters.liquidityMin}M`);
  }

  if (filterChanges.length > 0) {
    changes.push(`Filters: ${filterChanges.join(", ")}`);
  }

  // TopK change
  if (draft.topK !== current.topK) {
    changes.push(`Top Picks: ${current.topK} → ${draft.topK}`);
  }

  return changes.join(" • ");
}
