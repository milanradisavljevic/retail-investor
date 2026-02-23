'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Info } from 'lucide-react';
import type { PortfolioPosition } from '@/types/portfolio';
import { FX_RATES_TO_USD } from '@/types/portfolio';
import type { DisplayCurrency } from '@/lib/settings/types';
import { convertFromUsd, formatMoney } from '@/lib/currency/client';

interface PortfolioDiversificationDashboardProps {
  positions: PortfolioPosition[];
  totalValueUsd: number;
  displayCurrency: DisplayCurrency;
  usdToEurRate: number;
}

interface SectorRow {
  name: string;
  value: number;
  pct: number;
  positions: number;
  avgScore: number | null;
  color: string;
}

interface ExposureRow {
  name: string;
  value: number;
  pct: number;
}

const PIE_COLORS = [
  '#60A5FA',
  '#34D399',
  '#F59E0B',
  '#F87171',
  '#A78BFA',
  '#22D3EE',
  '#F472B6',
  '#4ADE80',
  '#FB7185',
  '#38BDF8',
  '#FBBF24',
  '#818CF8',
];

const TARGET_SECTORS = [
  'Technology',
  'Healthcare',
  'Financial Services',
  'Industrials',
  'Communication Services',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Energy',
  'Utilities',
  'Real Estate',
  'Basic Materials',
];

const REGION_BY_SUFFIX: Record<string, string> = {
  DE: 'Deutschland',
  F: 'Deutschland',
  PA: 'Frankreich',
  L: 'UK',
  LN: 'UK',
  AS: 'Niederlande',
  BR: 'Belgien',
  MI: 'Italien',
  SW: 'Schweiz',
  TO: 'Kanada',
  T: 'Japan',
  HK: 'Hongkong',
  BO: 'Indien',
  NS: 'Indien',
  AX: 'Australien',
  SA: 'Brasilien',
};

function getPositionValueUsd(position: PortfolioPosition): number {
  if (
    position.current_value_usd !== null &&
    position.current_value_usd !== undefined &&
    Number.isFinite(position.current_value_usd) &&
    position.current_value_usd > 0
  ) {
    return position.current_value_usd;
  }

  const fxRate = FX_RATES_TO_USD[position.currency] ?? 1;
  const fallback = position.quantity * position.buy_price * fxRate;
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

function getSectorName(position: PortfolioPosition): string {
  if (position.asset_type === 'commodity') {
    return 'Edelmetalle';
  }

  const sector = position.sector?.trim();
  if (sector) return sector;

  const industry = position.industry?.trim();
  if (industry) {
    return industry.split(' - ')[0];
  }

  return 'Unbekannt';
}

function getRegion(symbol: string): string {
  if (symbol.startsWith('PHYS:')) return 'Rohstoffe';

  const upper = symbol.toUpperCase();
  const dotIndex = upper.lastIndexOf('.');
  if (dotIndex === -1) return 'USA';

  const suffix = upper.slice(dotIndex + 1);
  return REGION_BY_SUFFIX[suffix] ?? 'International';
}

function getDiversificationTone(score: number): string {
  if (score > 70) return 'text-emerald-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-400';
}

function suggestSector(sectorRows: SectorRow[]): string | null {
  const shareMap = new Map<string, number>();
  sectorRows.forEach((row) => shareMap.set(row.name, row.pct));

  const missing = TARGET_SECTORS.find((sector) => (shareMap.get(sector) ?? 0) < 0.08);
  if (missing) return missing;

  const smallestRepresented = sectorRows
    .filter((row) => row.name !== 'Unbekannt' && row.name !== 'Edelmetalle')
    .sort((a, b) => a.pct - b.pct)[0];

  return smallestRepresented?.name ?? null;
}

function ExposureBarCard({
  title,
  data,
  fill,
  displayCurrency,
  usdToEurRate,
}: {
  title: string;
  data: ExposureRow[];
  fill: string;
  displayCurrency: DisplayCurrency;
  usdToEurRate: number;
}) {
  const chartData = data.map((row) => ({
    ...row,
    pctValue: Number((row.pct * 100).toFixed(2)),
  }));

  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800/40 p-4">
      <h3 className="mb-3 text-sm font-semibold text-text-primary">{title}</h3>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fill: '#94A3B8', fontSize: 11 }}
              tickFormatter={(value) => `${value}%`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="name"
              type="category"
              width={105}
              tick={{ fill: '#CBD5E1', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip
              cursor={{ fill: 'rgba(51, 65, 85, 0.3)' }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const row = payload[0]?.payload as (ExposureRow & { pctValue: number }) | undefined;
                if (!row) return null;
                return (
                  <div className="rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 shadow-lg">
                    <div className="text-xs font-medium text-text-primary">{row.name}</div>
                    <div className="text-xs text-text-muted">{row.pctValue.toFixed(1)}%</div>
                    <div className="text-xs text-text-secondary">
                      {formatMoney(convertFromUsd(row.value, displayCurrency, usdToEurRate), displayCurrency)}
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="pctValue" radius={[0, 6, 6, 0]} fill={fill} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function PortfolioDiversificationDashboard({
  positions,
  totalValueUsd,
  displayCurrency,
  usdToEurRate,
}: PortfolioDiversificationDashboardProps) {
  const {
    sectorRows,
    currencyRows,
    geoRows,
    diversificationScore,
    hhi,
    concentrationRisk,
    recommendation,
  } = useMemo(() => {
    const sectorMap = new Map<string, { value: number; positions: number; scoreSum: number; scoreCount: number }>();
    const currencyMap = new Map<string, number>();
    const geoMap = new Map<string, number>();

    let portfolioValue = 0;
    for (const position of positions) {
      const valueUsd = getPositionValueUsd(position);
      if (valueUsd <= 0) continue;

      portfolioValue += valueUsd;

      const sector = getSectorName(position);
      const sectorBucket = sectorMap.get(sector) ?? { value: 0, positions: 0, scoreSum: 0, scoreCount: 0 };
      sectorBucket.value += valueUsd;
      sectorBucket.positions += 1;
      if (position.total_score !== null && position.total_score !== undefined) {
        sectorBucket.scoreSum += position.total_score;
        sectorBucket.scoreCount += 1;
      }
      sectorMap.set(sector, sectorBucket);

      const currencyBucket = currencyMap.get(position.currency) ?? 0;
      currencyMap.set(position.currency, currencyBucket + valueUsd);

      const region = getRegion(position.symbol);
      const geoBucket = geoMap.get(region) ?? 0;
      geoMap.set(region, geoBucket + valueUsd);
    }

    const denominator = portfolioValue > 0 ? portfolioValue : Math.max(totalValueUsd, 1);
    const sortedSectors = Array.from(sectorMap.entries())
      .map(([name, data], index) => ({
        name,
        value: data.value,
        pct: data.value / denominator,
        positions: data.positions,
        avgScore: data.scoreCount > 0 ? data.scoreSum / data.scoreCount : null,
        color: PIE_COLORS[index % PIE_COLORS.length],
      }))
      .sort((a, b) => b.pct - a.pct);

    const sortedCurrency = Array.from(currencyMap.entries())
      .map(([name, value]) => ({ name, value, pct: value / denominator }))
      .sort((a, b) => b.value - a.value);

    const sortedGeo = Array.from(geoMap.entries())
      .map(([name, value]) => ({ name, value, pct: value / denominator }))
      .sort((a, b) => b.value - a.value);

    const computedHHI = sortedSectors.reduce((sum, row) => sum + row.pct * row.pct, 0);
    const score = Math.round(Math.max(0, Math.min(100, (1 - computedHHI) * 100)));
    const concentration = sortedSectors.find((row) => row.pct > 0.3) ?? null;
    const suggestion = suggestSector(sortedSectors);

    return {
      sectorRows: sortedSectors,
      currencyRows: sortedCurrency,
      geoRows: sortedGeo,
      diversificationScore: score,
      hhi: computedHHI,
      concentrationRisk: concentration,
      recommendation: suggestion,
    };
  }, [positions, totalValueUsd]);

  if (sectorRows.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-navy-700 bg-navy-800 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Diversifikations-Analyse</h2>
          <p className="text-xs text-text-muted">
            Herfindahl-Index (HHI): {hhi.toFixed(3)} · Diversifikation: {diversificationScore}/100
          </p>
        </div>
        <div className={`text-lg font-semibold ${getDiversificationTone(diversificationScore)}`}>
          {diversificationScore}/100
        </div>
      </div>

      {concentrationRisk && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Konzentrationsrisiko: {concentrationRisk.name} {Math.round(concentrationRisk.pct * 100)}%
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-navy-700 bg-navy-800/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">Asset Allocation nach Sektor</h3>
          <div className="relative h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sectorRows}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={112}
                  paddingAngle={2}
                  stroke="rgba(15, 23, 42, 0.8)"
                >
                  {sectorRows.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0]?.payload as SectorRow | undefined;
                    if (!row) return null;
                    return (
                      <div className="rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 shadow-lg">
                        <div className="text-xs font-medium text-text-primary">{row.name}</div>
                        <div className="text-xs text-text-muted">{(row.pct * 100).toFixed(1)}%</div>
                        <div className="text-xs text-text-secondary">
                          {formatMoney(convertFromUsd(row.value, displayCurrency, usdToEurRate), displayCurrency)}
                        </div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-xs text-text-muted">Diversifikation</div>
                <div className={`text-2xl font-semibold ${getDiversificationTone(diversificationScore)}`}>
                  {diversificationScore}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-navy-700 bg-navy-800/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">Sektor-Exposure</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-navy-700 text-left text-xs uppercase tracking-wider text-text-muted">
                  <th className="pb-2 font-medium">Sektor</th>
                  <th className="pb-2 font-medium">Positionen</th>
                  <th className="pb-2 font-medium">Wert ({displayCurrency})</th>
                  <th className="pb-2 font-medium">Anteil</th>
                  <th className="pb-2 text-right font-medium">Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {sectorRows.map((row) => (
                  <tr key={row.name} className="border-b border-navy-700/70 last:border-0">
                    <td className="py-2 text-text-primary">{row.name}</td>
                    <td className="py-2 text-text-secondary">{row.positions}</td>
                    <td className="py-2 text-text-secondary">
                      {formatMoney(convertFromUsd(row.value, displayCurrency, usdToEurRate), displayCurrency)}
                    </td>
                    <td className="py-2">
                      <div className="w-36">
                        <div className="mb-1 flex items-center justify-between text-xs text-text-muted">
                          <span>{(row.pct * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-navy-700">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(0, row.pct * 100))}%`,
                              backgroundColor: row.color,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      {row.avgScore !== null ? (
                        <span className={row.avgScore >= 70 ? 'text-emerald-400' : row.avgScore >= 50 ? 'text-amber-400' : 'text-red-400'}>
                          {row.avgScore.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExposureBarCard
          title="Währungs-Exposure"
          data={currencyRows}
          fill="#60A5FA"
          displayCurrency={displayCurrency}
          usdToEurRate={usdToEurRate}
        />
        <ExposureBarCard
          title="Geographie-Verteilung"
          data={geoRows}
          fill="#34D399"
          displayCurrency={displayCurrency}
          usdToEurRate={usdToEurRate}
        />
      </div>

      {recommendation && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-navy-600 bg-navy-800/40 px-3 py-2 text-sm text-text-secondary">
          <Info className="h-4 w-4 text-accent-blue" />
          <span>Tipp: Positionen in {recommendation} könnten die Diversifikation verbessern.</span>
        </div>
      )}
    </section>
  );
}
