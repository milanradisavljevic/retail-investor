'use client';

import { useMemo, useState } from 'react';

type PillarWeights = {
  valuation: number;
  quality: number;
  technical: number;
  risk: number;
};

const PRESETS: Record<string, PillarWeights> = {
  Conservative: { valuation: 20, quality: 35, technical: 15, risk: 30 },
  Balanced: { valuation: 25, quality: 25, technical: 25, risk: 25 },
  Aggressive: { valuation: 15, quality: 20, technical: 40, risk: 25 },
  'Quality Focus': { valuation: 15, quality: 40, technical: 20, risk: 25 },
};

function WeightSlider({
  label,
  value,
  onChange,
  colorClass,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  colorClass: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-slate-200 font-medium">{label}</label>
        <span className="font-mono text-amber-400">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className={`h-2 w-full cursor-pointer appearance-none rounded-lg ${colorClass}`}
      />
    </div>
  );
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-600"
    >
      {label}
    </button>
  );
}

interface ParameterControlsProps {
  selectedUniverse: string;
  strategyKey?: string;
}

export default function ParameterControls({ selectedUniverse, strategyKey = 'hybrid' }: ParameterControlsProps) {
  const [weights, setWeights] = useState<PillarWeights>(PRESETS.Balanced);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const total = useMemo(
    () => Object.values(weights).reduce((acc, v) => acc + v, 0),
    [weights]
  );
  const isValid = total === 100;

  async function handleRunBacktest() {
    if (!isValid || isRunning) return;
    setIsRunning(true);
    setStatus('Running backtest...');

    try {
      const res = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: strategyKey, // 4-Pillar weights applied to hybrid scoring downstream
          weights,
          universe: selectedUniverse,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        setStatus(body?.error || 'Backtest failed');
      } else {
        setStatus('Backtest completed. Ergebnisse aktualisiert.');
      }
    } catch (err) {
      setStatus('Backtest failed');
      console.error('Backtest run failed', err);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/60 p-6 shadow-xl shadow-black/20 backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-amber-400">4-Pillar Weights</h3>
          <div className="text-xs text-slate-400">Universe: {selectedUniverse}</div>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
          Live Preview
        </span>
      </div>

      <div className="space-y-5">
        <WeightSlider
          label="Valuation"
          value={weights.valuation}
          onChange={(v) => setWeights({ ...weights, valuation: v })}
          colorClass="bg-blue-500"
        />
        <WeightSlider
          label="Quality"
          value={weights.quality}
          onChange={(v) => setWeights({ ...weights, quality: v })}
          colorClass="bg-emerald-500"
        />
        <WeightSlider
          label="Technical"
          value={weights.technical}
          onChange={(v) => setWeights({ ...weights, technical: v })}
          colorClass="bg-amber-500"
        />
        <WeightSlider
          label="Risk"
          value={weights.risk}
          onChange={(v) => setWeights({ ...weights, risk: v })}
          colorClass="bg-red-500"
        />
      </div>

      <div
        className={`mt-5 rounded-lg border px-4 py-3 ${
          isValid ? 'border-emerald-700 bg-emerald-900/20 text-emerald-400' : 'border-red-700 bg-red-900/20 text-red-400'
        }`}
      >
        Total: {total}% {isValid ? '✓' : '(Must be 100%)'}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {Object.entries(PRESETS).map(([label, preset]) => (
          <PresetButton key={label} label={label} onClick={() => setWeights(preset)} />
        ))}
      </div>

      <button
        type="button"
        disabled={!isValid || isRunning}
        onClick={handleRunBacktest}
        className={`mt-6 w-full rounded-lg py-3 font-semibold transition ${
          isValid && !isRunning
            ? 'bg-amber-500 text-slate-900 hover:bg-amber-400'
            : 'cursor-not-allowed bg-slate-700 text-slate-500'
        }`}
      >
        {isRunning ? 'Running...' : 'Run Backtest with Custom Weights'}
      </button>

      {status && <div className="mt-3 text-sm text-slate-300">{status}</div>}
    </div>
  );
}
