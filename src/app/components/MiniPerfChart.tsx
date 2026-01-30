'use client';

import { useEffect, useState, useMemo } from 'react';

interface MiniPerfChartProps {
  symbol: string;
  height?: number;
  className?: string;
}

interface DataPoint {
  date: string;
  close: number;
}

export function MiniPerfChart({ symbol, height = 60, className = '' }: MiniPerfChartProps) {
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

    return () => {
      isMounted = false;
    };
  }, [symbol]);

  useEffect(() => {
    // Measure container width for responsive chart
    const measureWidth = () => {
      const element = document.getElementById(`chart-${symbol}`);
      if (element) {
        setWidth(element.offsetWidth);
      }
    };

    measureWidth();
    window.addEventListener('resize', measureWidth);

    return () => window.removeEventListener('resize', measureWidth);
  }, [symbol]);

  const { return1Y, pathData } = useMemo(() => {
    if (!data || data.length < 2) {
      return { return1Y: 0, pathData: '' };
    }

    const firstPrice = data[0].close;
    const lastPrice = data[data.length - 1].close;
    const returnPct = (lastPrice - firstPrice) / firstPrice;

    // Generate SVG path
    const padding = 4;
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

    return { return1Y: returnPct, pathData: `M ${points}` };
  }, [data, width, height]);

  if (loading) {
    return <div className={`h-[${height}px] w-full animate-pulse bg-slate-700 rounded`} />;
  }

  if (error || !data) {
    return <div className="h-[60px] w-full flex items-center justify-center text-xs text-slate-400">Chart unavailable</div>;
  }

  const color = return1Y >= 0 ? '#10b981' : '#ef4444'; // green/red
  const gradientId = `gradient-${symbol}`;

  return (
    <div id={`chart-${symbol}`} className={`relative my-3 ${className}`} style={{ height }}>
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* Background grid lines */}
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Performance line */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Gradient fill under line */}
        <path
          d={`${pathData} L ${width} ${height} L 0 ${height} Z`}
          fill={`url(#${gradientId})`}
        />
      </svg>

      {/* Return badge */}
      <div className="absolute top-2 right-2 text-xs font-semibold px-2 py-1 rounded bg-black/50 text-white">
        {return1Y >= 0 ? '+' : ''}{(return1Y * 100).toFixed(1)}%
      </div>

      {/* Hover tooltip info */}
      <div className="absolute bottom-1 left-2 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
        1Y Return
      </div>
    </div>
  );
}
