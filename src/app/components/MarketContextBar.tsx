'use client';

import { useEffect, useMemo, useState } from 'react';
import MarketSparkline from './MarketSparkline';
import MacroSparklineCards from './MacroSparklineCards';
import type { MarketContextResponse } from '@/lib/marketContext';

type MarketContextBarProps = {
  initialData?: MarketContextResponse | null;
};

export default function MarketContextBar({ initialData }: MarketContextBarProps) {
  const [data, setData] = useState<MarketContextResponse | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  const lastUpdated = useMemo(() => {
    if (!data?.fetchedAt) return null;
    return new Date(data.fetchedAt);
  }, [data]);

  async function loadMarketContext(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch('/api/market-context');
      if (!res.ok) throw new Error(`status ${res.status}`);
      const payload = (await res.json()) as MarketContextResponse;
      setData(payload);
    } catch (err) {
      console.error('[MarketContextBar] fetch failed', err);
      if (!data) {
        setError('Market data unavailable');
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadMarketContext({ silent: Boolean(initialData) });
  }, [initialData]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg shadow-black/20">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Market Context</p>
          <p className="text-sm text-slate-400">Macro pulse · last 30 sessions</p>
        </div>
        {lastUpdated && (
          <p className="text-[11px] text-slate-500">
            Updated {lastUpdated.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-sm text-slate-400">Market data unavailable.</p>
          <button
            onClick={() => loadMarketContext()}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-emerald-400/60 hover:text-emerald-300 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="min-w-[200px] rounded-xl border border-slate-800 bg-slate-950 p-4 animate-pulse space-y-3"
            >
              <div className="h-3 w-24 rounded bg-slate-800" />
              <div className="h-5 w-16 rounded bg-slate-800" />
              <div className="h-10 w-full rounded bg-slate-800" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {(data?.indices ?? []).map((idx) => (
            <div
              key={idx.symbol}
              className="min-w-[200px] rounded-xl border border-slate-800 bg-slate-950 p-4"
            >
              <MarketSparkline
                name={idx.name}
                value={idx.value}
                changePercent={idx.changePercent}
                data={idx.data}
              />
            </div>
          ))}
        </div>
      )}

      <MacroSparklineCards />
    </div>
  );
}
