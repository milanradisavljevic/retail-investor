'use client';

import { type PresetConfig } from '@/lib/presets/loader';
import { useTranslation } from '@/lib/i18n/useTranslation';
import {
  SlidersHorizontal,
  TrendingUp,
  Scale,
  Target,
  Crown,
  Coins,
  Gauge,
  Sparkles,
  Zap,
  ShieldCheck,
  ClipboardCheck,
  Cpu,
  Rocket,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';

type PillarWeights = {
  valuation: number;
  quality: number;
  technical: number;
  risk: number;
};

interface PresetSelectorProps {
  value: string | null;
  onChange: (id: string | null, weights?: PillarWeights) => void;
  presets: PresetConfig[];
}

const ICON_MAP: Record<string, LucideIcon> = {
  shield: ShieldCheck,
  rocket: Rocket,
  'dividend-aristocrats': Crown,
  dividend_quality: Coins,
  dividend: Coins,
  compounder: TrendingUp,
  deep_value: Target,
  'deep-value': Scale,
  garp: Gauge,
  'magic-formula': Sparkles,
  'momentum-hybrid': Zap,
  momentum: Zap,
  piotroski: ClipboardCheck,
  quant: Cpu,
};

function iconFor(id: string): LucideIcon {
  if (ICON_MAP[id]) return ICON_MAP[id];
  for (const [key, icon] of Object.entries(ICON_MAP)) {
    if (id.includes(key)) return icon;
  }
  return BarChart3;
}

export function PresetSelector({ value, onChange, presets }: PresetSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Custom Strategy Card */}
        <button
          onClick={() => onChange(null)}
          className={`relative p-5 text-left rounded-2xl border transition-all duration-200 ${
            value === null
              ? "bg-slate-800/80 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
              : "bg-slate-800/40 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-3">
              <SlidersHorizontal className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <div>
                <h4 className="font-bold text-white text-lg">{t('strategyLab.presets.custom.label')}</h4>
                <span className="text-[10px] uppercase tracking-wider font-medium text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">
                  Manual Setup
                </span>
              </div>
            </div>
          </div>
          <p className="text-sm text-slate-400 mb-4 line-clamp-2">
            {t('strategyLab.presets.custom.description')}
          </p>
          <div className="flex gap-0.5 h-1 w-full bg-slate-900 rounded-full overflow-hidden">
            <div className="bg-slate-700 w-full h-full rounded-full" />
          </div>
        </button>

        {/* Preset Cards */}
        {presets.map((preset) => {
          const isSelected = value === preset.id;
          const tier = preset.tier || 'experimental';
          const Icon = iconFor(preset.id);

          return (
            <button
              key={preset.id}
              onClick={() => onChange(preset.id, preset.pillar_weights)}
              className={`group relative p-5 text-left rounded-2xl border transition-all duration-200 ${
                isSelected
                  ? "bg-slate-800/80 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                  : "bg-slate-800/40 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-white text-lg">{preset.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      {tier === 'validated' ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 border border-emerald-500/40 text-emerald-500">
                          Validated
                        </span>
                      ) : (
                        <div className="relative group/tier">
                          <span className="text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 border border-amber-500/40 text-amber-500">
                            Experimental
                          </span>
                          <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-slate-900 border border-slate-700 rounded-lg text-[10px] text-slate-300 opacity-0 group-hover/tier:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                            Diese Strategie ist in Entwicklung. Backtest-Ergebnisse k&ouml;nnen sich &auml;ndern.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-400 mb-4 line-clamp-2" title={preset.description}>
                {preset.description}
              </p>

              <div className="flex gap-0.5 h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-l-full transition-all"
                  style={{ width: `${preset.pillar_weights.valuation * 100}%` }}
                />
                <div
                  className="bg-emerald-500 h-full transition-all"
                  style={{ width: `${preset.pillar_weights.quality * 100}%` }}
                />
                <div
                  className="bg-amber-500 h-full transition-all"
                  style={{ width: `${preset.pillar_weights.technical * 100}%` }}
                />
                <div
                  className="bg-red-500 h-full rounded-r-full transition-all"
                  style={{ width: `${preset.pillar_weights.risk * 100}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
