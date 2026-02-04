'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import type { RunProgress, RunPhase } from '@/lib/progress/progressStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface Props {
  runId: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

const PHASE_LABELS: Record<RunPhase, { key: string; color: string; icon: string }> = {
  initializing: { key: 'progress.phases.initializing', color: 'bg-slate-500', icon: '⚙️' },
  data_fetch: { key: 'progress.phases.data_fetch', color: 'bg-blue-500', icon: '📡' },
  scoring: { key: 'progress.phases.scoring', color: 'bg-purple-500', icon: '🎯' },
  selection: { key: 'progress.phases.selection', color: 'bg-green-500', icon: '✨' },
  persistence: { key: 'progress.phases.persistence', color: 'bg-orange-500', icon: '💾' },
  complete: { key: 'progress.phases.complete', color: 'bg-emerald-600', icon: '✅' },
  error: { key: 'progress.phases.error', color: 'bg-red-600', icon: '❌' },
};

export function RunProgressIndicator({ runId, onComplete, onError }: Props) {
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const handleComplete = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  const handleError = useCallback(
    (err: string) => {
      setError(err);
      onError?.(err);
    },
    [onError]
  );

  useEffect(() => {
    // Connect to SSE endpoint
    const eventSource = new EventSource(`/api/run/progress/${runId}`);

    eventSource.addEventListener('open', () => {
      setIsConnected(true);
    });

    eventSource.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'connected':
            setIsConnected(true);
            break;

          case 'progress':
            setProgress(message.data);
            break;

          case 'complete':
            setProgress(message.data);
            setTimeout(handleComplete, 500); // Small delay for UI update
            eventSource.close();
            break;

          case 'error':
            handleError(message.data?.error || t('progress.error'));
            eventSource.close();
            break;

          case 'notfound':
            handleError(message.message || t('progress.runFailed'));
            eventSource.close();
            break;
        }
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    });

    eventSource.addEventListener('error', () => {
      setIsConnected(false);
      // Don't close on error - let it retry
    });

    return () => {
      eventSource.close();
    };
  }, [runId, handleComplete, handleError]);

  // Update elapsed time every second
  useEffect(() => {
    if (!progress?.startTime) return;

    const timer = setInterval(() => {
      setElapsed(Date.now() - progress.startTime);
    }, 1000);

    return () => clearInterval(timer);
  }, [progress?.startTime]);

  const phaseInfo = useMemo(() => {
    if (!progress) return null;
    const info = PHASE_LABELS[progress.currentPhase];
    return {
      ...info,
      label: t(info.key),
    };
  }, [progress?.currentPhase, t, progress]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-900/10 p-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">❌</span>
          <div>
            <p className="font-semibold text-red-400">{t('progress.runFailed')}</p>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="rounded-xl border border-[#1F2937] bg-[#111827] p-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className="text-sm text-[#94A3B8]">{t('progress.connecting')}</span>
          {!isConnected && (
            <span className="text-xs text-[#64748B]">({t('progress.waiting')})</span>
          )}
        </div>
      </div>
    );
  }

  const percentage =
    progress.totalSymbols > 0
      ? (progress.processedSymbols / (progress.totalSymbols * 2)) * 100 // *2 because we have two passes
      : 0;

  const totalCache = progress.cacheHits + progress.cacheMisses;
  const cacheHitRate = totalCache > 0 ? (progress.cacheHits / totalCache) * 100 : 0;

  const eta =
    progress.estimatedCompletion && progress.currentPhase !== 'complete'
      ? Math.max(0, progress.estimatedCompletion - Date.now())
      : 0;

  return (
    <div className="space-y-4 rounded-xl border border-[#1F2937] bg-[#111827] p-5 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#F1F5F9]">
            {t('progress.running')}: {progress.universe}
          </h3>
          <p className="text-xs text-[#64748B]">
            {t('progress.runId')}: {runId.slice(0, 16)}...
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 animate-pulse rounded-full ${phaseInfo?.color ?? 'bg-slate-500'}`} />
          <span className="text-sm text-[#94A3B8]">
            {phaseInfo?.icon ?? '⌛'} {phaseInfo?.label ?? t('progress.phases.initializing')}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div>
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-[#94A3B8]">
            {progress.processedSymbols} / {progress.totalSymbols * 2} {t('progress.operations')}
          </span>
          <span className="font-mono text-[#E2E8F0]">{percentage.toFixed(1)}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-[#0B1220]">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 transition-all duration-300 ease-out"
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon="⏱️"
          label={t('progress.elapsed')}
          value={formatDuration(elapsed)}
          valueColor="text-[#E2E8F0]"
        />
        <StatCard
          icon="🎯"
          label={t('progress.eta')}
          value={eta > 0 ? formatDuration(eta) : '—'}
          valueColor="text-[#E2E8F0]"
        />
        <StatCard
          icon="📊"
          label={t('progress.current')}
          value={progress.currentSymbol || '—'}
          valueColor="text-[#E2E8F0]"
          className="col-span-2 sm:col-span-1"
        />
        <StatCard
          icon="✅"
          label={t('progress.cacheHitRate')}
          value={`${cacheHitRate.toFixed(0)}%`}
          valueColor={
            cacheHitRate > 70
              ? 'text-emerald-400'
              : cacheHitRate > 40
                ? 'text-yellow-400'
                : 'text-red-400'
          }
        />
        <StatCard
          icon="⚠️"
          label={t('progress.failed')}
          value={`${progress.failedSymbols.length}`}
          valueColor={progress.failedSymbols.length > 0 ? 'text-red-400' : 'text-emerald-400'}
        />
        <StatCard
          icon="💾"
          label={t('progress.cacheHits')}
          value={`${progress.cacheHits}`}
          valueColor="text-blue-400"
        />
        <StatCard
          icon="🌐"
          label={t('progress.apiCalls')}
          value={`${progress.cacheMisses}`}
          valueColor="text-purple-400"
        />
      </div>

      {/* Connection Status */}
      <div className="flex items-center justify-between border-t border-[#1F2937] pt-3">
        <div className="flex items-center gap-2 text-xs text-[#64748B]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}
          />
          {isConnected ? t('progress.liveUpdates') : t('progress.reconnecting')}
        </div>
        {progress.failedSymbols.length > 0 && (
          <div className="text-xs text-yellow-400">
            {progress.failedSymbols.length} {t('progress.failedSymbols')}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  valueColor = 'text-[#E2E8F0]',
  className = '',
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-[#1F2937] bg-[#0B1220] p-3 ${className}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider text-[#64748B]">{label}</span>
      </div>
      <div className={`truncate text-sm font-semibold ${valueColor}`}>{value}</div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
