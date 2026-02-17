'use client';

import { useMemo, useState } from 'react';
import type { StrategyComparisonRow } from '../utils/loadBacktestData';

interface Props {
  strategies: StrategyComparisonRow[];
}

type SortKey = 'totalReturn' | 'sharpe' | 'maxDrawdown' | 'outperformance';
type SortDir = 'asc' | 'desc';

const headers: { key: SortKey; label: string; align?: 'left' | 'right' }[] = [
  { key: 'totalReturn', label: 'Gesamtrendite', align: 'right' },
  { key: 'sharpe', label: 'Sharpe', align: 'right' },
  { key: 'maxDrawdown', label: 'Max DD', align: 'right' },
  { key: 'outperformance', label: 'vs. Benchmark', align: 'right' },
];

function formatPct(value: number, digits = 2): string {
  if (Number.isNaN(value)) return '–';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

export default function StrategyComparison({ strategies }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('totalReturn');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const best = useMemo(() => {
    if (!strategies.length) return null;
    return {
      totalReturn: Math.max(...strategies.map((s) => s.totalReturn)),
      sharpe: Math.max(...strategies.map((s) => s.sharpe)),
      maxDrawdown: Math.min(...strategies.map((s) => s.maxDrawdown)), // most shallow drawdown is closer to 0
      outperformance: Math.max(...strategies.map((s) => s.outperformance)),
    };
  }, [strategies]);

  const sorted = useMemo(() => {
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...strategies].sort((a, b) => (a[sortKey] - b[sortKey]) * factor);
  }, [strategies, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'maxDrawdown' ? 'asc' : 'desc');
    }
  };

  if (!strategies.length) {
    return <div className="text-slate-500 text-sm">Keine Strategievergleiche verfügbar.</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/40">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="sticky top-0 bg-slate-900">
            <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
              <th className="p-4 text-left">Strategie</th>
              {headers.map((h) => (
                <th
                  key={h.key}
                  className={`cursor-pointer p-4 ${h.align === 'right' ? 'text-right' : 'text-left'}`}
                  onClick={() => toggleSort(h.key)}
                >
                  <div className="inline-flex items-center gap-2">
                    {h.label}
                    {sortKey === h.key && (
                      <span className="text-amber-400 text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr
                key={s.name}
                className="border-b border-slate-800/80 text-sm text-slate-200 hover:bg-slate-800/40"
              >
                <td className="p-4 font-medium text-slate-100">{s.name}</td>
                <td
                  className={`p-4 text-right ${
                    best && s.totalReturn === best.totalReturn ? 'text-emerald-400 font-semibold' : 'text-slate-200'
                  }`}
                >
                  {formatPct(s.totalReturn)}
                </td>
                <td
                  className={`p-4 text-right ${
                    best && s.sharpe === best.sharpe ? 'text-emerald-400 font-semibold' : 'text-amber-300'
                  }`}
                >
                  {s.sharpe.toFixed(2)}
                </td>
                <td
                  className={`p-4 text-right ${
                    best && s.maxDrawdown === best.maxDrawdown ? 'text-emerald-400 font-semibold' : 'text-red-400'
                  }`}
                >
                  {formatPct(s.maxDrawdown)}
                </td>
                <td
                  className={`p-4 text-right ${
                    s.outperformance >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {formatPct(s.outperformance, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
