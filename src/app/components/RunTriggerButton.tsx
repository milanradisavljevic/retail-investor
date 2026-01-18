"use client";

import { useState } from "react";

interface RunTriggerButtonProps {
  universe?: string;
  label?: string;
}

export function RunTriggerButton({
  universe = "russell2000_full_yf",
  label = "Run Russell 2000"
}: RunTriggerButtonProps) {
  const [isTriggering, setIsTriggering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleTrigger = async () => {
    setIsTriggering(true);
    setMessage(null);

    try {
      const response = await fetch('/api/run/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ universe }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage(`✓ Run started! Estimated duration: ${data.estimatedDuration}. Refresh page in ~20 minutes.`);
        setShowConfirm(false);
        // Auto-hide message after 10 seconds
        setTimeout(() => setMessage(null), 10000);
      } else {
        setMessage(`✗ Error: ${data.error || 'Failed to start run'}`);
      }
    } catch (error) {
      setMessage(`✗ Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsTriggering(false);
    }
  };

  if (showConfirm) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-6 max-w-md mx-4">
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            Confirm Run
          </h3>
          <p className="text-sm text-text-secondary mb-4">
            This will start a Russell 2000 analysis run with 1,943 symbols.
            <br />
            <br />
            <span className="text-accent-gold">⏱️ Estimated duration: 15-25 minutes</span>
            <br />
            <br />
            The run will execute in the background. You can continue using the app
            and refresh the page after ~20 minutes to see the new results.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleTrigger}
              disabled={isTriggering}
              className="flex-1 bg-accent-blue hover:bg-accent-blue/80 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTriggering ? 'Starting...' : 'Start Run'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 bg-navy-700 hover:bg-navy-600 text-text-primary px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowConfirm(true)}
        className="flex items-center gap-2 bg-accent-blue hover:bg-accent-blue/80 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {label}
      </button>

      {message && (
        <div className={`absolute top-full mt-2 left-0 right-0 min-w-max px-4 py-2 rounded-lg text-sm font-medium ${
          message.startsWith('✓')
            ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
            : 'bg-accent-red/20 text-accent-red border border-accent-red/30'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
}
