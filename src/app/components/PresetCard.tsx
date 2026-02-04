'use client';

import { ReactNode } from 'react';

export type RiskLevel = 'low' | 'medium' | 'high';

const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

interface PresetCardProps {
  name: string;
  subtitle: string;
  description: string;
  icon: ReactNode;
  riskLevel: RiskLevel;
  weights: { v: number; q: number; t: number; r: number };
  selected: boolean;
  onClick: () => void;
  riskLabels?: Partial<Record<RiskLevel, string>>;
}

export function PresetCard({ name, subtitle, description, icon, riskLevel, weights, selected, onClick, riskLabels }: PresetCardProps) {
  const riskColors: Record<RiskLevel, string> = {
    low: 'bg-emerald-500',
    medium: 'bg-amber-500',
    high: 'bg-red-500',
  };
  const defaultRiskLabels: Record<RiskLevel, string> = {
    low: 'Defensive',
    medium: 'Balanced',
    high: 'Aggressive',
  };
  const displayLabel = riskLabels?.[riskLevel] ?? defaultRiskLabels[riskLevel];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'w-full text-left p-4 rounded-lg border-2 transition-all',
        selected
          ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.3)]'
          : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="text-emerald-300">{icon}</div>
          <div>
            <div className="font-semibold text-white">{name}</div>
            <div className="text-xs text-slate-400">{subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <span className={`w-2 h-2 rounded-full ${riskColors[riskLevel]}`} />
          {displayLabel}
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-3 leading-relaxed">{description}</p>
      <div className="flex gap-1 h-1.5" aria-label="Pillar weights">
        <div className="bg-blue-500 rounded" style={{ width: `${weights.v}%` }} title={`Value ${weights.v}%`} />
        <div className="bg-purple-500 rounded" style={{ width: `${weights.q}%` }} title={`Quality ${weights.q}%`} />
        <div className="bg-orange-400 rounded" style={{ width: `${weights.t}%` }} title={`Technical ${weights.t}%`} />
        <div className="bg-emerald-500 rounded" style={{ width: `${weights.r}%` }} title={`Risk ${weights.r}%`} />
      </div>
    </button>
  );
}
