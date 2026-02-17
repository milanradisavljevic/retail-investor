'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MacroApiResponse, MacroTickerData } from '@/types/macro';

type MacroTicker = 'GC=F' | 'CL=F' | '^TNX' | 'DX-Y.NYB';

type MacroCardConfig = {
  label: string;
  ticker: MacroTicker;
};

const CARD_CONFIG: MacroCardConfig[] = [
  { ticker: 'GC=F', label: 'Gold' },
  { ticker: 'CL=F', label: 'WTI Oel' },
  { ticker: '^TNX', label: '10Y Yield' },
  { ticker: 'DX-Y.NYB', label: 'DXY' },
];

function formatDollar(value: number | null, fractionDigits = 2): string {
  if (value === null || Number.isNaN(value)) return '--';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatPlain(value: number | null, fractionDigits = 1): string {
  if (value === null || Number.isNaN(value)) return '--';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatYield(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '--';
  return `${value.toFixed(2)}%`;
}

function formatPercentFromRatio(changeRatio: number | null): string {
  if (changeRatio === null || Number.isNaN(changeRatio)) return '--';
  const pct = changeRatio * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function formatBpsFromRatio(changeRatio: number | null): string {
  if (changeRatio === null || Number.isNaN(changeRatio)) return '--';
  const bps = Math.round(changeRatio * 10000);
  const sign = bps >= 0 ? '+' : '';
  return `${sign}${bps} bps`;
}

function getLinePoints(values: number[]): string {
  const width = 100;
  const height = 40;
  if (values.length === 0) return '';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  return values
    .map((value, idx) => {
      const x = values.length === 1 ? width : (idx / (values.length - 1)) * width;
      const y = span === 0 ? height / 2 : height - ((value - min) / span) * height;
      return `${x},${y}`;
    })
    .join(' ');
}

function isPositiveForDisplay(ticker: string, change1m: number | null): boolean {
  if (change1m === null || Number.isNaN(change1m)) return true;
  if (ticker === '^TNX') return change1m < 0;
  return change1m >= 0;
}

function MacroCardSkeleton() {
  return (
    <div className="min-w-[200px] rounded-xl border border-slate-800 bg-slate-950 p-4 animate-pulse space-y-3">
      <div className="h-3 w-24 rounded bg-slate-800" />
      <div className="h-5 w-20 rounded bg-slate-800" />
      <div className="h-10 w-full rounded bg-slate-800" />
    </div>
  );
}

function MacroCard({ cfg, item }: { cfg: MacroCardConfig; item: MacroTickerData | null }) {
  const change = item?.change_1m ?? null;
  const hasChange = change !== null && !Number.isNaN(change);
  const positive = isPositiveForDisplay(cfg.ticker, change);
  const changeColor = !hasChange
    ? 'text-slate-400 bg-slate-700/40'
    : positive
      ? 'text-emerald-400 bg-emerald-500/10'
      : 'text-red-400 bg-red-500/10';
  const lineColor = !hasChange ? '#64748B' : positive ? '#10B981' : '#EF4444';
  const points = getLinePoints(item?.sparkline_30d ?? []);

  const formattedValue = (() => {
    if (cfg.ticker === '^TNX') return formatYield(item?.price_current ?? null);
    if (cfg.ticker === 'GC=F') return formatDollar(item?.price_current ?? null, 0);
    if (cfg.ticker === 'CL=F') return formatDollar(item?.price_current ?? null, 2);
    if (cfg.ticker === 'DX-Y.NYB') return formatPlain(item?.price_current ?? null, 1);
    return formatPlain(item?.price_current ?? null, 2);
  })();

  const formattedChange = cfg.ticker === '^TNX' ? formatBpsFromRatio(change) : formatPercentFromRatio(change);

  return (
    <div className="min-w-[200px] rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-medium">{cfg.label}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${changeColor}`}>{formattedChange}</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-lg font-semibold text-slate-100 leading-tight">{formattedValue}</span>
      </div>
      <div className="mt-2 h-10 w-full">
        {points ? (
          <svg viewBox="0 0 100 40" className="h-10 w-full" preserveAspectRatio="none" role="img" aria-label={`${cfg.label} sparkline`}>
            <polyline fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={points} />
          </svg>
        ) : (
          <div className="h-10 w-full rounded bg-slate-900" />
        )}
      </div>
    </div>
  );
}

export default function MacroSparklineCards() {
  const [data, setData] = useState<MacroTickerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const tickerParam = CARD_CONFIG.map((c) => c.ticker).join(',');

    async function loadMacroCards() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/macro?ticker=${encodeURIComponent(tickerParam)}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const payload = (await res.json()) as MacroApiResponse;
        if (!isMounted) return;
        setData(payload.data ?? []);
      } catch (err) {
        console.error('[MacroSparklineCards] fetch failed', err);
        if (!isMounted) return;
        setError(true);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadMacroCards();
    return () => {
      isMounted = false;
    };
  }, []);

  const dataByTicker = useMemo(() => {
    const map = new Map<string, MacroTickerData>();
    for (const item of data) {
      map.set(item.ticker, item);
    }
    return map;
  }, [data]);

  return (
    <div className="mt-4 border-t border-slate-800 pt-4">
      <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-slate-500">Rohstoffe &amp; Zinsen</p>
      {error ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400">
          Makro-Daten nicht verfuegbar
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {loading
            ? CARD_CONFIG.map((cfg) => <MacroCardSkeleton key={cfg.ticker} />)
            : CARD_CONFIG.map((cfg) => <MacroCard key={cfg.ticker} cfg={cfg} item={dataByTicker.get(cfg.ticker) ?? null} />)}
        </div>
      )}
    </div>
  );
}
