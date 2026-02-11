'use client';

import { useEffect, useState } from 'react';
import type { RegimeLabel, RegimeResult } from '@/regime/engine';

interface RegimeApiResponse {
  regime: RegimeResult;
  macro: {
    vix: number | null;
    yield_curve: number | null;
    fed_rate: number | null;
    cpi: number | null;
  };
}

const REGIME_CONFIG: Record<
  RegimeLabel,
  { label: string; color: string; bg: string; border: string; hint: string }
> = {
  RISK_ON: {
    label: 'Expansion',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/40',
    hint: 'Current regime favors growth-oriented strategies',
  },
  NEUTRAL: {
    label: 'Neutral',
    color: 'text-slate-400',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/40',
    hint: 'Mixed signals \u2014 balanced allocation recommended',
  },
  RISK_OFF: {
    label: 'Contraction',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/40',
    hint: 'Current regime suggests defensive positioning',
  },
  CRISIS: {
    label: 'Crisis',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/40',
    hint: 'Elevated risk \u2014 capital preservation strategies advised',
  },
};

function ScoreBar({ score }: { score: number }) {
  // score ranges from -1.0 to +1.0, map to 0-100%
  const pct = ((score + 1) / 2) * 100;
  const barColor =
    score > 0.4
      ? 'bg-emerald-500'
      : score > -0.2
        ? 'bg-slate-400'
        : score > -0.6
          ? 'bg-amber-500'
          : 'bg-red-500';

  return (
    <div className="relative h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
      <div
        className="absolute left-1/2 top-0 h-full w-px bg-slate-600"
        aria-hidden
      />
      <div
        className={`absolute top-0 left-0 h-full rounded-full transition-all ${barColor}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function fmt(val: number | null, suffix: string, decimals = 2): string {
  if (val === null) return '--';
  return `${val.toFixed(decimals)}${suffix}`;
}

export default function RegimeBadge() {
  const [data, setData] = useState<RegimeApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/regime')
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: RegimeApiResponse | null) => {
        if (payload) setData(payload);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 animate-pulse">
        <div className="h-4 w-32 rounded bg-slate-800 mb-3" />
        <div className="h-3 w-48 rounded bg-slate-800" />
      </div>
    );
  }

  if (!data) return null;

  const { regime } = data;
  const cfg = REGIME_CONFIG[regime.label];

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${cfg.color} ${cfg.bg} border ${cfg.border}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${cfg.color.replace('text-', 'bg-')}`}
            />
            {cfg.label}
          </span>
          <span className="text-xs text-slate-500">
            Composite: {regime.composite_score.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {regime.confidence < 1 && (
            <span className="text-[10px] text-amber-400/80 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/5">
              Partial data ({Math.round(regime.confidence * 100)}%)
            </span>
          )}
          <span className="text-[10px] text-slate-500">
            as of {regime.as_of_date}
          </span>
        </div>
      </div>

      <div className="mb-3">
        <ScoreBar score={regime.composite_score} />
        <div className="flex justify-between text-[9px] text-slate-600 mt-1">
          <span>-1.0 Crisis</span>
          <span>0 Neutral</span>
          <span>+1.0 Expansion</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>
          <span className="text-slate-500">VIX:</span>{' '}
          {fmt(regime.signals.vix.value, '')}
        </span>
        <span className="text-slate-700">|</span>
        <span>
          <span className="text-slate-500">Yield Curve:</span>{' '}
          {regime.signals.yield_curve.value !== null
            ? `${regime.signals.yield_curve.value >= 0 ? '+' : ''}${regime.signals.yield_curve.value.toFixed(2)}%`
            : '--'}
        </span>
        <span className="text-slate-700">|</span>
        <span>
          <span className="text-slate-500">Fed:</span>{' '}
          {fmt(regime.signals.fed_rate.value, '%')}
        </span>
        <span className="text-slate-700">|</span>
        <span>
          <span className="text-slate-500">CPI:</span>{' '}
          {regime.signals.cpi.yoy !== null
            ? `${regime.signals.cpi.yoy.toFixed(1)}% YoY`
            : '--'}
        </span>
      </div>

      <p className={`text-[11px] mt-2 ${cfg.color} opacity-80`}>{cfg.hint}</p>
    </div>
  );
}
