"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface RunTriggerButtonProps {
  universe?: string;
  label?: string;
  symbolCount?: number;
}

export function RunTriggerButton({
  universe = process.env.NEXT_PUBLIC_UNIVERSE ?? process.env.UNIVERSE ?? "russell2000_full_yf",
  label,
  symbolCount
}: RunTriggerButtonProps) {
  const [isTriggering, setIsTriggering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const { t } = useTranslation();

  const formattedUniverse = universe.replace(/[_-]+/g, " ").toUpperCase();
  const resolvedLabel = label ?? `${t('run.run')} ${formattedUniverse}`;
  const resolvedSymbolCount = symbolCount ?? 1943;

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
        const msg = t('run.success')
          .replace('{duration}', data.estimatedDuration);
        setMessage(msg);
        setShowConfirm(false);
        // Auto-hide message after 10 seconds
        setTimeout(() => setMessage(null), 10000);
      } else {
        const msg = t('run.error').replace('{error}', data.error || 'Failed to start run');
        setMessage(msg);
      }
    } catch (error) {
      const msg = t('run.networkError').replace('{error}', error instanceof Error ? error.message : 'Unknown error');
      setMessage(msg);
    } finally {
      setIsTriggering(false);
    }
  };

  if (showConfirm) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-6 max-w-md mx-4">
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            {t('run.confirmTitle')}
          </h3>
          <p className="text-sm text-text-secondary mb-4">
            {t('run.confirmBody')
              .replace('{universe}', formattedUniverse)
              .replace('{count}', resolvedSymbolCount.toLocaleString())}
            <br />
            <br />
            <span className="text-accent-gold">⏱️ {t('run.estimatedDuration')}</span>
            <br />
            <br />
            {t('run.backgroundInfo')}
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleTrigger}
              disabled={isTriggering}
              className="flex-1 bg-accent-blue hover:bg-accent-blue/80 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTriggering ? t('run.starting') : t('run.start')}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 bg-navy-700 hover:bg-navy-600 text-text-primary px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {t('run.cancel')}
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
        {resolvedLabel}
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