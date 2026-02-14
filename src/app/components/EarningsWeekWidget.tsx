'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { EarningsApiResponse, EarningsCalendarEntry } from '@/types/earnings';

const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function weekdayShort(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '?';
  return WEEKDAY_SHORT[date.getUTCDay()] ?? '?';
}

export default function EarningsWeekWidget() {
  const [entries, setEntries] = useState<EarningsCalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<'Portfolio' | 'Universum'>('Portfolio');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const portfolioRes = await fetch('/api/earnings?days=7&portfolio=true');
        const portfolioPayload = portfolioRes.ok
          ? ((await portfolioRes.json()) as EarningsApiResponse)
          : null;

        let data = portfolioPayload?.data ?? [];
        let source: 'Portfolio' | 'Universum' = 'Portfolio';

        if (data.length === 0) {
          const allRes = await fetch('/api/earnings?days=7');
          if (!allRes.ok) {
            throw new Error(`status ${allRes.status}`);
          }
          const allPayload = (await allRes.json()) as EarningsApiResponse;
          data = allPayload.data ?? [];
          source = 'Universum';
        }

        if (active) {
          setEntries(data.slice(0, 5));
          setSourceLabel(source);
        }
      } catch (err) {
        if (active) {
          setError('Earnings data unavailable');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const compactLine = useMemo(() => {
    if (entries.length === 0) return 'Keine Termine diese Woche';
    return entries.map((entry) => `${entry.symbol} (${weekdayShort(entry.earnings_date)})`).join(', ');
  }, [entries]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg shadow-black/20">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-emerald-300" />
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Earnings</p>
        </div>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">
          {sourceLabel}
        </span>
      </div>

      {loading ? (
        <div className="h-9 animate-pulse rounded bg-slate-800" />
      ) : error ? (
        <p className="text-sm text-slate-400">{error}</p>
      ) : (
        <>
          <p className="text-sm text-slate-200">Earnings diese Woche:</p>
          <p className="mt-1 text-sm text-slate-400">{compactLine}</p>
        </>
      )}
    </div>
  );
}
