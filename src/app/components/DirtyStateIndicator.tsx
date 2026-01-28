"use client";

import { useState } from "react";

interface DirtyStateIndicatorProps {
  isDirty: boolean;
  diffSummary: string | null;
  onReset: () => void;
  onRunAnalysis: () => void;
  estimatedRuntime: string;
  symbolCount?: number;
}

/**
 * Floating indicator that shows unsaved configuration changes.
 * Prevents accidental expensive runs by making changes visible.
 */
export function DirtyStateIndicator({
  isDirty,
  diffSummary,
  onReset,
  onRunAnalysis,
  estimatedRuntime,
  symbolCount = 0,
}: DirtyStateIndicatorProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Don't show if no changes
  if (!isDirty) return null;

  // Determine if confirmation is needed (runtime > 5 min or > 500 symbols)
  const needsConfirmation = symbolCount > 500 || estimatedRuntime.includes("h") || parseInt(estimatedRuntime) > 5;

  const handleRunClick = () => {
    if (needsConfirmation && !showConfirmation) {
      setShowConfirmation(true);
    } else {
      onRunAnalysis();
      setShowConfirmation(false);
    }
  };

  const handleCancel = () => {
    setShowConfirmation(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md animate-slide-up">
      <div className="rounded-xl border border-accent-orange/50 bg-navy-800/95 backdrop-blur-sm shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <div className="w-2 h-2 bg-accent-orange rounded-full animate-pulse" />
          <span className="text-sm font-semibold text-accent-orange tracking-wide">
            Unsaved Changes
          </span>
        </div>

        {/* Diff Summary */}
        <div className="px-4 pb-3">
          <p className="text-xs text-text-secondary leading-relaxed">
            {diffSummary}
          </p>
        </div>

        {/* Confirmation Warning */}
        {showConfirmation && (
          <div className="mx-4 mb-3 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10">
            <div className="flex items-start gap-2">
              <span className="text-amber-400 text-sm">⚠️</span>
              <div>
                <p className="text-xs font-semibold text-amber-300">Large Universe Warning</p>
                <p className="text-xs text-amber-200/80 mt-1">
                  This run will process {symbolCount} symbols and take approximately {estimatedRuntime}.
                  Continue?
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Runtime Info */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Estimated runtime: {estimatedRuntime}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 pb-4">
          {showConfirmation ? (
            <>
              <button
                onClick={handleCancel}
                className="flex-1 px-3 py-2 text-sm border border-navy-600 rounded-lg hover:bg-navy-700 transition-colors text-text-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleRunClick}
                className="flex-1 px-3 py-2 text-sm bg-accent-orange text-white rounded-lg hover:bg-accent-orange/90 transition-colors font-semibold"
              >
                Confirm Run
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onReset}
                className="flex-1 px-3 py-2 text-sm border border-navy-600 rounded-lg hover:bg-navy-700 transition-colors text-text-secondary"
              >
                Reset to Current
              </button>
              <button
                onClick={handleRunClick}
                className="flex-1 px-3 py-2 text-sm bg-accent-blue text-white rounded-lg hover:bg-accent-blue/90 transition-colors font-semibold flex flex-col items-center"
              >
                <span>Run Analysis</span>
                <span className="text-[10px] opacity-75 font-normal">{estimatedRuntime}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
