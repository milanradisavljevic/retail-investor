"use client";

import { useState } from "react";

function estimateRunTime(symbolCount: number): string {
  if (symbolCount < 100) return "~1-2 min";
  if (symbolCount < 500) return "~3-5 min";
  if (symbolCount < 1000) return "~5-8 min";
  if (symbolCount < 2000) return "~8-12 min";
  return "~12-15 min";
}

export function RunAnalysisButton({
  disabled,
  universe,
  symbolCount,
  provider,
}: {
  disabled: boolean;
  universe: string;
  symbolCount: number;
  provider: string;
}) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const estimatedTime = estimateRunTime(symbolCount);
  const showConfirmationModal = symbolCount > 500;

  const handleClick = () => {
    if (disabled) return;

    if (showConfirmationModal) {
      setShowConfirmation(true);
    } else {
      handleRunAnalysis();
    }
  };

  const handleRunAnalysis = async () => {
    setShowConfirmation(false);
    setIsRunning(true);

    // TODO: Implement actual API call to trigger run
    // For now, just simulate a delay
    setTimeout(() => {
      setIsRunning(false);
      alert("Run Analysis not yet implemented. This will trigger a scoring run with your custom configuration.");
    }, 2000);
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled || isRunning}
        className={`w-full flex flex-col items-center gap-1 px-4 py-3 rounded-lg font-medium transition ${
          disabled || isRunning
            ? "bg-surface-2 border border-border-default text-text-tertiary cursor-not-allowed"
            : "bg-accent-500 hover:bg-accent-600 text-white"
        }`}
      >
        <div className="flex items-center gap-2">
          {isRunning ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Running...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Run Analysis</span>
            </>
          )}
        </div>
        {!disabled && !isRunning && (
          <span className="text-xs font-normal opacity-90">
            ~{symbolCount.toLocaleString()} symbols · {provider} · {estimatedTime}
          </span>
        )}
      </button>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-1 border border-border-default rounded-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-text-primary mb-3">
              Confirm Analysis Run
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              This will score {symbolCount.toLocaleString()} symbols using the {provider} provider.
            </p>
            <div className="bg-surface-2 border border-border-subtle rounded-lg p-3 mb-6">
              <div className="text-xs text-text-tertiary mb-1">Estimated time</div>
              <div className="text-xl font-semibold text-text-primary font-mono">{estimatedTime}</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmation(false)}
                className="flex-1 px-4 py-2 bg-surface-2 border border-border-default rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-border-emphasis transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRunAnalysis}
                className="flex-1 px-4 py-2 bg-accent-500 hover:bg-accent-600 rounded-lg text-sm text-white font-medium transition"
              >
                Start Run
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
