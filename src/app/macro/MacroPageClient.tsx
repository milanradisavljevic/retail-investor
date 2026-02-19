'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import type { MacroTickerData, MacroCategory, MacroApiResponse } from '@/types/macro';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '@/types/macro';
import GlossaryTooltip from '@/app/components/GlossaryTooltip';

type TimePeriod = '1d' | '1w' | '1m' | '3m' | 'ytd';

const PERIOD_LABELS: Record<TimePeriod, string> = {
  '1d': '1D',
  '1w': '1W',
  '1m': '1M',
  '3m': '3M',
  ytd: 'YTD',
};

function getChangeValue(ticker: MacroTickerData, period: TimePeriod): number | null {
  switch (period) {
    case '1d':
      return ticker.change_1d;
    case '1w':
      return ticker.change_1w;
    case '1m':
      return ticker.change_1m;
    case '3m':
      return ticker.change_3m;
    case 'ytd':
      return ticker.change_ytd;
  }
}

function getHeatmapBg(change: number | null): string {
  if (change === null || Number.isNaN(change)) return '';
  const clamped = Math.max(-0.05, Math.min(0.05, change));
  if (clamped === 0) return '';

  const intensity = Math.abs(clamped) / 0.05;
  const alpha = Number((intensity * 0.35).toFixed(2));
  if (clamped > 0) {
    return `rgba(34, 197, 94, ${alpha})`;
  }
  return `rgba(239, 68, 68, ${alpha})`;
}

function getBorderColor(change: number | null): string {
  if (change === null) return 'border-navy-600';
  if (change >= 0.02) return 'border-emerald-500/50';
  if (change >= 0) return 'border-emerald-500/30';
  if (change >= -0.02) return 'border-red-500/30';
  return 'border-red-500/50';
}

function formatPrice(value: number | null): string {
  if (value === null) return '--';
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('de-DE', { maximumFractionDigits: 0 });
  }
  if (Math.abs(value) >= 10) {
    return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

function formatChange(change: number | null): string {
  if (change === null || Number.isNaN(change)) return '--';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${(change * 100).toFixed(2)}%`;
}

function getChangeTextClass(change: number | null): string {
  if (change === null || Number.isNaN(change)) return 'text-text-muted';
  return change >= 0 ? 'text-emerald-400' : 'text-red-400';
}

function MiniSparkline({ data }: { data: number[] }) {
  if (!data || data.length === 0) return null;
  
  const chartData = data.map((v, i) => ({ value: v, idx: i }));
  const isPositive = data.length > 1 && data[data.length - 1] >= data[0];
  const lineColor = isPositive ? '#10B981' : '#EF4444';
  
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, left: 0, right: 0, bottom: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={lineColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipData {
  ticker: MacroTickerData;
  period: TimePeriod;
}

function HeatmapCell({ 
  ticker, 
  period,
  onHover 
}: { 
  ticker: MacroTickerData; 
  period: TimePeriod;
  onHover: (data: TooltipData | null) => void;
}) {
  const change = getChangeValue(ticker, period);
  const heatmapBg = getHeatmapBg(change);
  const borderClass = getBorderColor(change);
  
  return (
    <div
      className={`relative rounded-lg border ${borderClass} bg-navy-800 p-3 min-w-[140px] transition-all hover:scale-[1.02] hover:border-accent-blue/50 cursor-pointer overflow-hidden`}
      onMouseEnter={() => onHover({ ticker, period })}
      onMouseLeave={() => onHover(null)}
    >
      {heatmapBg && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: heatmapBg }}
        />
      )}
      <div className="relative z-10 text-xs text-text-muted mb-1 truncate">{ticker.name}</div>
      <div className="relative z-10 text-lg font-semibold text-text-primary">
        {formatPrice(ticker.price_current)}
      </div>
      <div className={`relative z-10 text-sm font-medium mt-1 ${getChangeTextClass(change)}`}>
        {formatChange(change)}
      </div>
    </div>
  );
}

function HoverTooltip({ data }: { data: TooltipData | null }) {
  if (!data) return null;
  
  const { ticker } = data;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-navy-800 border border-navy-600 rounded-xl p-4 shadow-2xl min-w-[280px]">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-text-primary">{ticker.name}</span>
        <span className="text-xs text-text-muted">{ticker.ticker}</span>
      </div>
      
      <div className="mb-3">
        <MiniSparkline data={ticker.sparkline_30d} />
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between">
          <span className="text-text-muted">1D</span>
          <span className={getChangeTextClass(ticker.change_1d)}>
            {formatChange(ticker.change_1d)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">1W</span>
          <span className={getChangeTextClass(ticker.change_1w)}>
            {formatChange(ticker.change_1w)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">1M</span>
          <span className={getChangeTextClass(ticker.change_1m)}>
            {formatChange(ticker.change_1m)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">3M</span>
          <span className={getChangeTextClass(ticker.change_3m)}>
            {formatChange(ticker.change_3m)}
          </span>
        </div>
        <div className="flex justify-between col-span-2">
          <span className="text-text-muted">YTD</span>
          <span className={getChangeTextClass(ticker.change_ytd)}>
            {formatChange(ticker.change_ytd)}
          </span>
        </div>
      </div>
      
      <div className="text-[10px] text-text-muted mt-2 pt-2 border-t border-navy-700">
        Letzte Aktualisierung: {ticker.last_updated}
      </div>
    </div>
  );
}

function RatesCard({ ticker }: { ticker: MacroTickerData }) {
  const change = ticker.change_1m;
  
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-text-primary">{ticker.name}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${
          change === null || Number.isNaN(change)
            ? 'bg-navy-700 text-text-muted'
            : change >= 0
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-red-500/10 text-red-400'
        }`}>
          {formatChange(change)} (1M)
        </span>
      </div>
      <div className="text-2xl font-bold text-text-primary mb-3">
        {formatPrice(ticker.price_current)}<span className="text-sm text-text-muted ml-1">%</span>
      </div>
      <MiniSparkline data={ticker.sparkline_30d} />
    </div>
  );
}

function YieldSpreadIndicator({ 
  treasury10Y, 
  treasury30Y 
}: { 
  treasury10Y: MacroTickerData | undefined;
  treasury30Y: MacroTickerData | undefined;
}) {
  const spread10y = treasury10Y?.price_current ?? null;
  const spread30y = treasury30Y?.price_current ?? null;
  
  const spread = (spread10y !== null && spread30y !== null)
    ? spread30y - spread10y
    : null;
  
  const isInverted = spread !== null && spread < 0;
  const isNormal = spread !== null && spread >= 0;
  
  return (
    <div className={`rounded-xl border p-4 ${
      isInverted 
        ? 'border-red-500/50 bg-red-500/10' 
        : isNormal 
          ? 'border-emerald-500/50 bg-emerald-500/10'
          : 'border-navy-700 bg-navy-800'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-text-primary">
          <GlossaryTooltip term="spread">Yield Spread</GlossaryTooltip> (30Y - 10Y)
        </span>
        {isInverted && (
          <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 animate-pulse">
            INVERTIERT
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-text-primary">
        {spread !== null ? `${spread >= 0 ? '+' : ''}${spread.toFixed(2)}%` : '--'}
      </div>
      <div className={`text-xs mt-2 ${isInverted ? 'text-red-400' : 'text-emerald-400'}`}>
        {isInverted 
          ? 'Rezessionswarnung: Invertierte Zinskurve'
          : isNormal
            ? 'Normal: Lange Enden höher'
            : 'Keine Daten verfügbar'}
      </div>
      <div className="text-[11px] text-text-muted mt-2">
        Differenzen werden häufig in <GlossaryTooltip term="basis_points">Basis Points (bps)</GlossaryTooltip> gelesen.
      </div>
    </div>
  );
}

function generateInterpretation(tickers: MacroTickerData[]): string {
  const gold = tickers.find(t => t.ticker === 'GC=F');
  const dxy = tickers.find(t => t.ticker === 'DX-Y.NYB');
  const oil = tickers.find(t => t.ticker === 'CL=F');
  const treasury10y = tickers.find(t => t.ticker === '^TNX');
  
  const interpretations: string[] = [];
  
  if (gold && gold.change_1m !== null && gold.change_1m > 0.03) {
    if (dxy && dxy.change_1m !== null && dxy.change_1m < -0.01) {
      interpretations.push('Gold steigt bei schwachem Dollar - typisches Risk-Off-Muster. Anleger suchen Sicherheit in Edelmetallen.');
    } else {
      interpretations.push('Gold zeigt starke Performance - potenzielle Inflationsängste oder geopolitische Unsicherheit.');
    }
  }
  
  if (oil && oil.change_1m !== null && oil.change_1m > 0.05) {
    interpretations.push('Steigende Ölpreise können Inflation antreiben und Growth-Aktien belasten. Energy-Sektor profitiert.');
  }
  
  if (treasury10y && treasury10y.change_3m !== null && treasury10y.change_3m > 0.01) {
    const spread30y = tickers.find(t => t.ticker === '^TYX');
    const isSpreadNormal = spread30y && spread30y.price_current !== null && treasury10y.price_current !== null
      ? spread30y.price_current > treasury10y.price_current
      : true;
    
    if (isSpreadNormal) {
      interpretations.push('Steigende Zinsen bei normaler Zinskurve - Wirtschaft intakt, Value-Aktien bevorzugt.');
    }
  }
  
  if (dxy && dxy.change_1m !== null && dxy.change_1m > 0.02) {
    interpretations.push('Starker US-Dollar belastet Exporteure und Schwellenländer. Vorsicht bei Emerging Markets.');
  }
  
  if (interpretations.length === 0) {
    interpretations.push('Gemischte Signale - keine klare Makro-Richtung erkennbar. Ausgewogene Portfolio-Allocation empfohlen.');
  }
  
  return interpretations.slice(0, 2).join(' ');
}

function formatFetchedAt(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

interface MacroPageClientProps {
  initialData: MacroApiResponse | null;
}

export function MacroPageClient({ initialData }: MacroPageClientProps) {
  const [data, setData] = useState<MacroApiResponse | null>(initialData);
  const [period, setPeriod] = useState<TimePeriod>('1d');
  const [hoverData, setHoverData] = useState<TooltipData | null>(null);
  const [loading, setLoading] = useState(!initialData);
  
  useEffect(() => {
    if (!initialData) {
      fetch('/api/macro')
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          setData(d);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [initialData]);
  
  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-64 bg-navy-700 rounded" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="h-24 bg-navy-700 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }
  
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <div className="text-4xl mb-4">📊</div>
        <h1 className="text-xl font-semibold text-text-primary mb-2">Makro-Daten nicht verfügbar</h1>
        <p className="text-text-secondary mb-4">
          Führe das ETL-Script aus, um die Daten zu laden:
        </p>
        <code className="bg-navy-800 px-4 py-2 rounded text-sm text-text-muted">
          python scripts/etl/fetch_commodities.py
        </code>
      </div>
    );
  }
  
  const tickers = data.data;
  const commodities = tickers.filter(t => 
    ['precious_metals', 'base_metals', 'energy', 'agriculture'].includes(t.category)
  );
  const rates = tickers.filter(t => t.category === 'rates');
  const currency = tickers.filter(t => t.category === 'currency');
  
  const commoditiesByCategory = CATEGORY_ORDER
    .filter(cat => cat !== 'rates' && cat !== 'currency')
    .reduce((acc, cat) => {
      acc[cat] = commodities.filter(t => t.category === cat);
      return acc;
    }, {} as Record<MacroCategory, MacroTickerData[]>);
  
  const treasury10Y = rates.find(t => t.ticker === '^TNX');
  const treasury30Y = rates.find(t => t.ticker === '^TYX');
  const dxy = currency.find(t => t.ticker === 'DX-Y.NYB');
  
  const interpretation = generateInterpretation(tickers);
  
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">
            MAKRO-KONTEXT
          </div>
          <h1 className="text-2xl font-bold text-text-primary">
            Rohstoffe, Zinsen & Währungen
          </h1>
        </div>
        <div className="text-right">
          <div className="text-xs text-text-muted">
            Zuletzt aktualisiert:
          </div>
          <div className="text-sm text-text-secondary">
            {formatFetchedAt(data.meta.fetched_at)}
          </div>
        </div>
      </div>
      
      {data.meta.stale && (
        <div className="bg-accent-gold/10 border border-accent-gold/40 rounded-lg p-4 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <div className="font-medium text-accent-gold">Daten sind älter als 24h</div>
            <div className="text-sm text-text-secondary">
              ETL erneut ausführen: <code className="text-text-muted">python scripts/etl/fetch_commodities.py</code>
            </div>
          </div>
        </div>
      )}
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Rohstoff-Heatmap</h2>
          <div className="flex gap-1 bg-navy-800 rounded-lg p-1">
            {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-accent-blue text-white'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
        
        <div className="space-y-6">
          {Object.entries(commoditiesByCategory).map(([category, items]) => (
            items.length > 0 && (
              <div key={category}>
                <h3 className="text-sm font-medium text-text-secondary mb-3">
                  {CATEGORY_LABELS[category as MacroCategory]}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {items.map(ticker => (
                    <HeatmapCell
                      key={ticker.ticker}
                      ticker={ticker}
                      period={period}
                      onHover={setHoverData}
                    />
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      </div>
      
      <div className="border-t border-navy-700 pt-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Zinsen & Anleihen</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {rates.map(ticker => (
            <RatesCard key={ticker.ticker} ticker={ticker} />
          ))}
          {dxy && <RatesCard ticker={dxy} />}
        </div>
        
        <div className="mt-4 max-w-md">
          <YieldSpreadIndicator 
            treasury10Y={treasury10Y} 
            treasury30Y={treasury30Y} 
          />
        </div>
      </div>
      
      <div className="border-t border-navy-700 pt-6">
        <div className="bg-navy-800/50 border border-navy-700 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">💡</span>
            <h2 className="text-lg font-semibold text-text-primary">
              Was bedeutet das für deine Strategie?
            </h2>
          </div>
          <p className="text-text-secondary leading-relaxed">
            {interpretation}
          </p>
          <div className="mt-4 pt-4 border-t border-navy-700 flex items-center justify-between">
            <Link 
              href="/" 
              className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
            >
              Aktuelles Regime auf dem Dashboard ansehen →
            </Link>
            <span className="text-xs text-text-muted">
              Regelbasierte Analyse (keine Finanzberatung)
            </span>
          </div>
        </div>
      </div>
      
      <HoverTooltip data={hoverData} />
    </div>
  );
}
