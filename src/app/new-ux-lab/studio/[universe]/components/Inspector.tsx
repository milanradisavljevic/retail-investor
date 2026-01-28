"use client";

import { useState, useEffect } from "react";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import { ConfigInspector } from "./ConfigInspector";
import { StockInspector } from "./StockInspector";
import { DiversificationInspector } from "./DiversificationInspector";
import type { SkippedSymbol } from "./GhostRow";

type InspectorMode = "config" | "stock" | "diversification";
type SymbolScore = RunV1SchemaJson["scores"][number];

interface InspectorState {
  mode: InspectorMode;
  selectedSymbol?: string;
  selectedScore?: SymbolScore;
  skippedSymbols?: SkippedSymbol[];
}

// Global state for inspector (shared across components via custom events)
const inspectorEventTarget = typeof window !== "undefined" ? new EventTarget() : null;

export function setInspectorMode(state: InspectorState) {
  if (inspectorEventTarget) {
    inspectorEventTarget.dispatchEvent(new CustomEvent("inspector-mode-change", { detail: state }));
  }
}

export function Inspector({
  run,
  universe,
}: {
  run: RunV1SchemaJson;
  universe: string;
}) {
  const [state, setState] = useState<InspectorState>({ mode: "config" });
  const [isOpen, setIsOpen] = useState(true);

  // Listen for mode changes from other components
  useEffect(() => {
    if (!inspectorEventTarget) return;

    const handleModeChange = (e: Event) => {
      const customEvent = e as CustomEvent<InspectorState>;
      setState(customEvent.detail);
      setIsOpen(true); // Auto-open when mode changes
    };

    inspectorEventTarget.addEventListener("inspector-mode-change", handleModeChange);
    return () => {
      inspectorEventTarget.removeEventListener("inspector-mode-change", handleModeChange);
    };
  }, []);

  const handleBackToConfig = () => {
    setState({ mode: "config" });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-4 top-20 px-3 py-2 bg-surface-1 border border-border-default rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-border-emphasis transition"
        aria-label="Open inspector"
      >
        ← Inspector
      </button>
    );
  }

  return (
    <aside className="w-[360px] border-l border-border-subtle bg-surface-1 h-[calc(100vh-3.5rem)] overflow-y-auto transition-all duration-300 ease-in-out">
      <div className="p-6">
        {/* Header with Close Button */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">
            {state.mode === "config" && "Strategy Configuration"}
            {state.mode === "stock" && "Stock Details"}
            {state.mode === "diversification" && "Diversification"}
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-text-tertiary hover:text-text-primary transition"
            aria-label="Close inspector"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content based on mode */}
        {state.mode === "config" && <ConfigInspector run={run} universe={universe} />}

        {state.mode === "stock" && state.selectedScore && (
          <StockInspector
            symbol={state.selectedSymbol || ""}
            score={state.selectedScore}
            onClose={handleBackToConfig}
          />
        )}

        {state.mode === "diversification" && state.skippedSymbols && (
          <DiversificationInspector
            skippedSymbols={state.skippedSymbols}
            onClose={handleBackToConfig}
          />
        )}
      </div>
    </aside>
  );
}
