'use client';

import { useMemo, useState } from 'react';
import EquityCurveChart from './EquityCurveChart';
import DrawdownChart from './DrawdownChart';
import MetricsCards from './MetricsCards';
import StrategyComparison from './StrategyComparison';
import ParameterControls from './ParameterControls';
import type { BacktestSummary, TimeSeriesPoint, StrategyComparisonRow } from '../utils/loadBacktestData';

type ModelStatus = 'done' | 'pending' | 'failed';

export interface ModelEntry {
  key: string;
  label: string;
  status: ModelStatus;
  summary?: BacktestSummary | null;
  timeSeries?: TimeSeriesPoint[];
  note?: string;
}

interface Props {
  models: ModelEntry[];
  universes: string[];
  comparisonRows: StrategyComparisonRow[];
}

type Currency = 'USD' | 'EUR';

function convertSeries(
  series: TimeSeriesPoint[] | undefined,
  currency: Currency,
  eurRate: number
): TimeSeriesPoint[] {
  if (!series) return [];
  if (currency === 'USD') return series;
  return series.map((p) => ({
    ...p,
    portfolio_value: p.portfolio_value * eurRate,
    sp500_value: p.sp500_value * eurRate,
  }));
}

function statusColor(status: ModelStatus) {
  switch (status) {
    case 'done':
      return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
    case 'failed':
      return 'text-red-400 border-red-500/40 bg-red-500/10';
    default:
      return 'text-amber-300 border-amber-500/40 bg-amber-500/10';
  }
}

export default function BacktestingClient({ models, universes, comparisonRows }: Props) {
  const initialModel = models.find((m) => m.status === 'done' && m.summary) || models[0];
  const [activeKey, setActiveKey] = useState<string>(initialModel?.key ?? models[0]?.key);
  const [selectedUniverse, setSelectedUniverse] = useState<string>(universes[0] || 'russell2000_full');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [eurRate, setEurRate] = useState<number>(0.92);

  const activeModel = useMemo(
    () => models.find((m) => m.key === activeKey) || models[0],
    [activeKey, models]
  );

  const equitySeries = convertSeries(activeModel?.timeSeries, currency, eurRate);
  const drawdownSeries = equitySeries;
  const currencySymbol = currency === 'EUR' ? '€' : '$';
  const maxDrawdown = drawdownSeries.length
    ? Math.min(...drawdownSeries.map((d) => d.drawdown_pct))
    : 0;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10 space-y-8">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-bold text-amber-400">Backtest Dashboard</h1>
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs uppercase tracking-wide text-amber-200">
              2020–2024
            </span>
          </div>
          <p className="text-slate-400">
            Russell 2000 (1993 Symbole, 51 fehlende) · Benchmark: S&P 500 (SPY)
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          {models.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setActiveKey(m.key)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                activeKey === m.key
                  ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                  : 'border-slate-700 bg-slate-800/50 text-slate-200 hover:border-slate-600'
              }`}
            >
              <span>{m.label}</span>
              <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ${statusColor(m.status)}`}>
                {m.status === 'done' ? 'Ready' : m.status === 'failed' ? 'Failed' : 'Pending'}
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-4">
            <div className="text-xs uppercase text-slate-400">Universe</div>
            <select
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              value={selectedUniverse}
              onChange={(e) => setSelectedUniverse(e.target.value)}
            >
              {universes.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-4">
            <div className="flex items-center justify-between text-xs uppercase text-slate-400">
              <span>Currency</span>
              <span className="text-[11px] text-slate-500">Applied to charts only</span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex gap-2">
                {(['USD', 'EUR'] as Currency[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`rounded-lg border px-3 py-1 text-sm ${
                      currency === c
                        ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                        : 'border-slate-700 bg-slate-900 text-slate-200'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {currency === 'EUR' && (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={eurRate}
                  onChange={(e) => setEurRate(parseFloat(e.target.value) || 0)}
                  className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-sm text-slate-100"
                  aria-label="EUR conversion rate"
                />
              )}
            </div>
          </div>
        </div>

        {activeModel?.summary ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-800/50 p-6 shadow-xl shadow-black/20 backdrop-blur">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">Key Metrics</h3>
                    <div className="text-xs text-slate-500">{activeModel.summary.strategy}</div>
                  </div>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
                    {activeModel.summary.period}
                  </span>
                </div>
                <MetricsCards summary={activeModel.summary} />
              </div>
            </div>
            {activeModel.key === '4pillar' ? (
              <ParameterControls selectedUniverse={selectedUniverse} strategyKey="hybrid" />
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-800/50 p-6 text-sm text-slate-300">
                <div className="mb-2 text-sm font-semibold text-slate-100">Strategy Notes</div>
                <p>{activeModel.note || 'Preset strategy configuration.'}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 text-slate-300">
            Keine Metriken verfügbar für dieses Modell. Bitte Backtest ausführen.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-800/50 p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-100">Equity Curve</h3>
              <span className="text-xs text-slate-400">{currencySymbol}</span>
            </div>
            <EquityCurveChart data={equitySeries} currencySymbol={currencySymbol} />
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-800/50 p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-100">Drawdown</h3>
              <span className="text-xs text-slate-400">Max DD: {maxDrawdown.toFixed(2)}%</span>
            </div>
            <DrawdownChart data={drawdownSeries} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-800/50 p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-100">Strategy Comparison</h3>
          <StrategyComparison strategies={comparisonRows} />
        </div>
      </div>
    </div>
  );
}
