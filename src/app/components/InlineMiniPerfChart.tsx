/**
 * Inline Mini Performance Chart
 * Ultra-compact chart for embedding inside stock cards
 * Height: 40px, width: auto-fit
 */

'use client';

import { useEffect, useState, useMemo, useRef } from 'react';

interface InlineMiniPerfChartProps {
  symbol: string;
  height?: number;
  className?: string;
  showReturnBadge?: boolean;
}

interface DataPoint {
  date: string;
  close: number;
}

export function InlineMiniPerfChart({ 
  symbol, 
  height = 40, 
  className = '', 
  showReturnBadge = true 
}: InlineMiniPerfChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<DataPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(200);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        setLoading(true);
        
        const response = await fetch(`/api/stock/chart?symbol=${encodeURIComponent(symbol)}&days=252`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`);
        }
        
        const chartData = await response.json() as DataPoint[];
        
        if (!isMounted) return;

        if (!chartData || chartData.length === 0) {
          throw new Error('No data available');
        }

        setData(chartData);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load chart');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchData();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect?.width) {
        setWidth(Math.max(160, Math.floor(entry.contentRect.width)));
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      isMounted = false;
      observer.disconnect();
    };
  }, [symbol]);

  const { return1Y, pathData, returnColor } = useMemo(() => {
    if (!data || data.length < 2) {
      return { return1Y: 0, pathData: '', returnColor: '#94a3b8' };
    }

    const firstPrice = data[0].close;
    const lastPrice = data[data.length - 1].close;
    const returnPct = (lastPrice - firstPrice) / firstPrice;

    // Generate SVG path for ultra-compact chart
    const padding = 2;
    const chartHeight = height - padding * 2;
    const chartWidth = width - padding * 2;
    
    const values = data.map(d => d.close);
    const minPrice = Math.min(...values);
    const maxPrice = Math.max(...values);
    const priceRange = maxPrice - minPrice || 1;

    const points = data.map((d, i) => {
      const x = padding + (i / (data.length - 1)) * chartWidth;
      const y = padding + ((maxPrice - d.close) / priceRange) * chartHeight;
      return `${x},${y}`;
    }).join(' ');

    const color = returnPct >= 0 ? '#10b981' : '#ef4444';

    return { return1Y: returnPct, pathData: `M ${points}`, returnColor: color };
  }, [data, width, height]);

  if (loading) {
    return <div className="h-8 w-20 animate-pulse bg-slate-700 rounded" />;
  }

  if (error || !data) {
    return <div className="h-8 w-20 flex items-center justify-center text-xs text-slate-500">-</div>;
  }

  const gradientId = `inline-gradient-${symbol}`;

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full ${className}`}
      style={{ height: `${height}px` }}
    >
      <svg width={width} height={height} className="absolute inset-0">
        {/* Gradient definition */}
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={returnColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={returnColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Chart line */}
        <path
          d={pathData}
          fill="none"
          stroke={returnColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Gradient fill */}
        <path
          d={`${pathData} L ${width} ${height} L 0 ${height} Z`}
          fill={`url(#${gradientId})`}
        />
      </svg>

      {/* Return badge (optional) */}
      {showReturnBadge && (
        <div className="absolute -top-1 -right-1 text-[10px] font-semibold px-1 py-0.5 rounded bg-black/60 text-white">
          {return1Y >= 0 ? '+' : ''}{(return1Y * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}
