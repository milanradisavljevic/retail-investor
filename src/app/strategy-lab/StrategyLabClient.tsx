"use client";

import { useEffect, useMemo, useState } from "react";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";

type PillarWeights = {
  valuation: number;
  quality: number;
  technical: number;
  risk: number;
};

type FilterState = {
  excludeCrypto: boolean;
  marketCapMin: number;
  liquidityMin: number;
  excludeDefense: boolean;
  excludeFossil: boolean;
};

type LivePick = {
  rank: number;
  symbol: string;
  companyName: string;
  currentPrice: number | null;
  targetPrice: number | null;
  upside: number | null;
  holdDuration: string;
  sector?: string | null;
  totalScore: number | null;
  pillarScores: PillarWeights;
};

type BacktestMetrics = {
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  calmarRatio: number;
  winRate: number;
};

type LiveRunResponse = {
  runId: string;
  asOfDate: string;
  universe: string;
  strategy: string;
  topPicks: LivePick[];
};

type BacktestResultResponse = {
  strategy: string;
  universe: string;
  summary?: {
    metrics?: {
      total_return_pct?: number;
      annualized_return_pct?: number;
      max_drawdown_pct?: number;
      sharpe_ratio?: number;
      calmar_ratio?: number;
      win_rate_pct?: number;
    };
  };
  equityCurve?: Array<{ date: string; portfolio_value: number; sp500_value: number }>;
  drawdown?: Array<{ date: string; drawdown_pct: number }>;
};

const UNIVERSES = [
  { id: "russell2000_full", name: "Russell 2000", stocks: 1943, status: "READY" },
  { id: "sp500", name: "S&P 500", stocks: 503, status: "READY" },
  { id: "nasdaq100", name: "NASDAQ 100", stocks: 100, status: "WIP" },
  { id: "dax40", name: "DAX 40", stocks: 40, status: "COMING" },
];

const WEIGHT_PRESETS: Record<
  string,
  { label: string; weights: PillarWeights }
> = {
  conservative: {
    label: "Conservative",
    weights: { valuation: 30, quality: 35, technical: 20, risk: 15 },
  },
  balanced: {
    label: "Balanced",
    weights: { valuation: 25, quality: 25, technical: 25, risk: 25 },
  },
  aggressive: {
    label: "Aggressive",
    weights: { valuation: 15, quality: 20, technical: 45, risk: 20 },
  },
  quality: {
    label: "Quality Focus",
    weights: { valuation: 20, quality: 45, technical: 20, risk: 15 },
  },
  momentum: {
    label: "Momentum Focus",
    weights: { valuation: 10, quality: 15, technical: 60, risk: 15 },
  },
};

const PERIOD_PRESETS = {
  full: { start: "2020-01-01", end: "2025-12-31", label: "Full Period (2020-2025)" },
  recent4y: { start: "2020-01-01", end: "2024-12-31", label: "2020-2024" },
  recent5y: { start: "2021-01-01", end: "2025-12-31", label: "2021-2025" },
  last3y: { start: "2023-01-01", end: "2025-12-31", label: "Last 3 Years" },
  covid: { start: "2020-01-01", end: "2021-12-31", label: "COVID Era (2020-2021)" },
  postCovid: { start: "2022-01-01", end: "2025-12-31", label: "Post-COVID (2022-2025)" },
};

const SAMPLE_LIVE_PICKS: LivePick[] = [
  {
    rank: 1,
    symbol: "MCY",
    companyName: "Mercury General Corp.",
    currentPrice: 91.09,
    targetPrice: 120.78,
    upside: 0.326,
    holdDuration: "12 months",
    sector: "Insurance",
    totalScore: 89.7,
    pillarScores: { valuation: 96.4, quality: 76.7, technical: 85, risk: 88 },
  },
  {
    rank: 2,
    symbol: "AHL",
    companyName: "Aspen Insurance Holdings",
    currentPrice: 37.28,
    targetPrice: 71.47,
    upside: 0.917,
    holdDuration: "12 months",
    sector: "Insurance",
    totalScore: 86.5,
    pillarScores: { valuation: 92.2, quality: 73.1, technical: 83.4, risk: 85.1 },
  },
];

const SAMPLE_BACKTEST: BacktestMetrics = {
  totalReturn: 61.69,
  annualizedReturn: 10.09,
  maxDrawdown: -23.86,
  sharpeRatio: 0.46,
  calmarRatio: 0.42,
  winRate: 55,
};

const SAMPLE_RECENT_BACKTESTS = [
  {
    title: "Russell2000 4-Pillar (Quality Focus)",
    ago: "2h ago",
    metrics: "61.69% Return | -23.86% DD",
  },
  {
    title: "S&P500 Momentum-Only",
    ago: "Yesterday",
    metrics: "86.36% Return | -13.72% DD",
  },
];

function formatPercent(value: number | null | undefined, opts?: { signed?: boolean }) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  const pct = `${Math.abs(value * 100).toFixed(1)}%`;
  if (opts?.signed) {
    const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${prefix}${pct}`;
  }
  return `${value.toFixed(1)}%`;
}

function classNames(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildLivePicksFromRun(run: RunV1SchemaJson | null, topK: number): LivePick[] {
  if (!run) return SAMPLE_LIVE_PICKS.slice(0, topK);

  const ordered = (run.selections.top20 ?? run.selections.top10 ?? run.selections.top5 ?? []).slice(
    0,
    topK
  );

  return ordered.map((symbol, idx) => {
    const score = run.scores.find((s) => s.symbol === symbol);
    const priceTarget = score?.price_target ?? null;
    const evidence = score?.evidence;
    const breakdown = score?.breakdown;
    const pillarScores: PillarWeights = {
      valuation: evidence?.valuation ?? 0,
      quality: evidence?.quality ?? 0,
      technical: evidence?.technical ?? 0,
      risk: evidence?.risk ?? 0,
    };

    return {
      rank: idx + 1,
      symbol,
      companyName: score?.company_name || symbol,
      currentPrice: priceTarget?.current_price ?? null,
      targetPrice: priceTarget?.target_sell_price ?? priceTarget?.fair_value ?? null,
      upside: priceTarget?.upside_pct ?? priceTarget?.expected_return_pct ?? null,
      holdDuration: priceTarget?.holding_period_months
        ? `${priceTarget.holding_period_months} months`
        : "--",
      sector: score?.industry ?? null,
      totalScore: score?.total_score ?? breakdown?.fundamental ?? null,
      pillarScores,
    };
  });
}

function ValidationBadge({ total }: { total: number }) {
  const isValid = total === 100;
  return (
    <div
      className={classNames(
        "text-xs px-3 py-1 rounded-full border inline-flex items-center gap-2",
        isValid
          ? "border-[#10B981]/30 bg-[#0F172A] text-[#10B981]"
          : "border-[#EF4444]/30 bg-[#1E293B] text-[#EF4444]"
      )}
    >
      <span
        className={classNames(
          "w-2 h-2 rounded-full",
          isValid ? "bg-[#10B981]" : "bg-[#EF4444]"
        )}
      />
      {isValid ? "Total 100% OK" : `Total ${total}% (adjust to 100%)`}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#1F2937] bg-[#111827] shadow-lg shadow-black/30">
      <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#1F2937]">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-[#F1F5F9] tracking-tight">
            {title}
          </h3>
          {subtitle && <p className="text-xs text-[#94A3B8] mt-1">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
}

function UniverseSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {UNIVERSES.map((universe) => {
        const statusColor =
          universe.status === "READY"
            ? "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/40"
            : universe.status === "WIP"
              ? "text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/40"
              : "text-[#94A3B8] bg-[#94A3B8]/10 border-[#94A3B8]/30";
        return (
          <button
            key={universe.id}
            onClick={() => onChange(universe.id)}
            className={classNames(
              "rounded-xl border px-4 py-3 text-left transition-all",
              "bg-[#0F172A] hover:border-[#334155] hover:-translate-y-[1px]",
              value === universe.id ? "border-[#3B82F6] shadow-[0_0_0_1px_rgba(59,130,246,0.3)]" : "border-[#1F2937]"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-[#E2E8F0]">{universe.name}</p>
              <span
                className={classNames(
                  "text-[10px] px-2 py-0.5 rounded-full border",
                  statusColor
                )}
              >
                {universe.status}
              </span>
            </div>
            <p className="text-xs text-[#94A3B8]">{universe.stocks} stocks</p>
          </button>
        );
      })}
    </div>
  );
}

function WeightEditor({
  weights,
  onChange,
}: {
  weights: PillarWeights;
  onChange: (next: PillarWeights) => void;
}) {
  const total = weights.valuation + weights.quality + weights.technical + weights.risk;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#E2E8F0] font-semibold">Pillar Weights</p>
        <ValidationBadge total={total} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(
          [
            { key: "valuation", label: "Valuation", color: "#3B82F6" },
            { key: "quality", label: "Quality", color: "#10B981" },
            { key: "technical", label: "Technical", color: "#F59E0B" },
            { key: "risk", label: "Risk", color: "#EF4444" },
          ] as const
        ).map(({ key, label, color }) => (
          <div
            key={key}
            className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <p className="text-sm font-medium text-[#E2E8F0]">{label}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-[#94A3B8]">Weight</div>
                <input
                  type="number"
                  value={weights[key]}
                  onChange={(e) =>
                    onChange({
                      ...weights,
                      [key]: clampNumber(Number(e.target.value), 0, 100),
                    })
                  }
                  className="w-16 text-right text-sm bg-[#0B1220] border border-[#1F2937] rounded px-2 py-1 text-[#E2E8F0]"
                />
                <span className="text-xs text-[#94A3B8]">%</span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={weights[key]}
              onChange={(e) =>
                onChange({
                  ...weights,
                  [key]: clampNumber(Number(e.target.value), 0, 100),
                })
              }
              className="w-full accent-[#3B82F6]"
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(WEIGHT_PRESETS).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => onChange(preset.weights)}
            className="text-xs px-3 py-2 rounded-lg border border-[#1F2937] bg-[#0F172A] text-[#E2E8F0] hover:border-[#3B82F6] transition-all"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterPanel({ filters, onChange }: { filters: FilterState; onChange: (f: FilterState) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
        <p className="text-sm font-semibold text-[#E2E8F0] mb-3">Risk Management</p>
        <label className="flex items-center gap-3 text-sm text-[#E2E8F0] mb-2">
          <input
            type="checkbox"
            checked={filters.excludeCrypto}
            onChange={(e) => onChange({ ...filters, excludeCrypto: e.target.checked })}
            className="accent-[#3B82F6]"
          />
          Exclude Crypto Mining Stocks
        </label>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="checkbox"
            checked={filters.marketCapMin > 0}
            onChange={(e) =>
              onChange({
                ...filters,
                marketCapMin: e.target.checked ? filters.marketCapMin || 500 : 0,
              })
            }
            className="accent-[#3B82F6]"
          />
          <div className="flex items-center gap-2 text-sm text-[#E2E8F0] flex-1">
            <span>Market Cap Min</span>
            <input
              type="number"
              value={filters.marketCapMin}
              onChange={(e) => onChange({ ...filters, marketCapMin: Number(e.target.value) })}
              className="w-24 bg-[#0B1220] border border-[#1F2937] rounded px-2 py-1 text-sm text-[#E2E8F0]"
            />
            <span className="text-xs text-[#94A3B8]">M USD</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filters.liquidityMin > 0}
            onChange={(e) =>
              onChange({
                ...filters,
                liquidityMin: e.target.checked ? filters.liquidityMin || 10 : 0,
              })
            }
            className="accent-[#3B82F6]"
          />
          <div className="flex items-center gap-2 text-sm text-[#E2E8F0] flex-1">
            <span>Liquidity Min</span>
            <input
              type="number"
              value={filters.liquidityMin}
              onChange={(e) => onChange({ ...filters, liquidityMin: Number(e.target.value) })}
              className="w-24 bg-[#0B1220] border border-[#1F2937] rounded px-2 py-1 text-sm text-[#E2E8F0]"
            />
            <span className="text-xs text-[#94A3B8]">M USD / day</span>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
        <p className="text-sm font-semibold text-[#E2E8F0] mb-3">Ethical Filters</p>
        <label className="flex items-center gap-3 text-sm text-[#E2E8F0] mb-2">
          <input
            type="checkbox"
            checked={filters.excludeDefense}
            onChange={(e) => onChange({ ...filters, excludeDefense: e.target.checked })}
            className="accent-[#3B82F6]"
          />
          Exclude Defense/Weapons
        </label>
        <label className="flex items-center gap-3 text-sm text-[#E2E8F0]">
          <input
            type="checkbox"
            checked={filters.excludeFossil}
            onChange={(e) => onChange({ ...filters, excludeFossil: e.target.checked })}
            className="accent-[#3B82F6]"
          />
          Exclude Fossil Fuels
        </label>
      </div>
      <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
        <p className="text-sm font-semibold text-[#E2E8F0] mb-2">Preset Packs</p>
        <p className="text-xs text-[#94A3B8] mb-3">
          Combine risk and ethical filters to standardize approval flows.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              onChange({
                excludeCrypto: true,
                marketCapMin: 500,
                liquidityMin: 10,
                excludeDefense: true,
                excludeFossil: true,
              })
            }
            className="text-xs px-3 py-2 rounded-lg border border-[#3B82F6]/40 bg-[#0F172A] text-[#E2E8F0] hover:border-[#3B82F6]"
          >
            Institutional Safe
          </button>
          <button
            onClick={() =>
              onChange({
                excludeCrypto: true,
                marketCapMin: 300,
                liquidityMin: 5,
                excludeDefense: false,
                excludeFossil: false,
              })
            }
            className="text-xs px-3 py-2 rounded-lg border border-[#1F2937] bg-[#0F172A] text-[#E2E8F0] hover:border-[#334155]"
          >
            Liquidity First
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveRunOutput({ picks }: { picks: LivePick[] }) {
  return (
    <div className="space-y-3">
      {picks.map((pick) => (
        <div
          key={pick.symbol}
          className="border border-[#1F2937] bg-[#0F172A] rounded-xl p-4 hover:border-[#334155] transition-colors"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#94A3B8]">#{pick.rank}</span>
              <div>
                <p className="text-lg font-semibold text-[#F1F5F9]">{pick.symbol}</p>
                <p className="text-sm text-[#94A3B8]">{pick.companyName}</p>
                {pick.sector && (
                  <p className="text-xs text-[#64748B] mt-1">Sector: {pick.sector}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#94A3B8] uppercase tracking-wide">Total Score</p>
              <p className="text-2xl font-bold text-[#E2E8F0]">
                {pick.totalScore !== null ? pick.totalScore.toFixed(1) : "--"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <div className="bg-[#111827] rounded-lg border border-[#1F2937] px-3 py-2">
              <p className="text-xs text-[#94A3B8] uppercase tracking-wide">Entry</p>
              <p className="text-sm text-[#F1F5F9]">
                {pick.currentPrice !== null ? `$${pick.currentPrice.toFixed(2)}` : "--"}
              </p>
            </div>
            <div className="bg-[#111827] rounded-lg border border-[#1F2937] px-3 py-2">
              <p className="text-xs text-[#94A3B8] uppercase tracking-wide">Target</p>
              <p className="text-sm text-[#F1F5F9]">
                {pick.targetPrice !== null ? `$${pick.targetPrice.toFixed(2)}` : "--"}
              </p>
            </div>
            <div className="bg-[#111827] rounded-lg border border-[#1F2937] px-3 py-2">
              <p className="text-xs text-[#94A3B8] uppercase tracking-wide">Upside</p>
              <p className={classNames("text-sm font-semibold", (pick.upside ?? 0) >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
                {pick.upside !== null ? formatPercent(pick.upside, { signed: true }) : "--"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            {(
              [
                { key: "valuation", label: "Valuation", color: "#3B82F6" },
                { key: "quality", label: "Quality", color: "#10B981" },
                { key: "technical", label: "Technical", color: "#F59E0B" },
                { key: "risk", label: "Risk", color: "#EF4444" },
              ] as const
            ).map(({ key, label, color }) => (
              <div
                key={key}
                className="rounded-lg border border-[#1F2937] bg-[#0B1220] px-3 py-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#94A3B8]">{label}</span>
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                </div>
                <p className="text-sm font-semibold text-[#F1F5F9] mt-1">
                  {pick.pillarScores[key].toFixed(1)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricsTable({ metrics }: { metrics: BacktestMetrics }) {
  const rows = [
    { label: "Total Return", value: metrics.totalReturn, benchmark: 95.3, russell: 45.2 },
    { label: "Annualized Return", value: metrics.annualizedReturn, benchmark: 14.32, russell: 7.8 },
    { label: "Max Drawdown", value: metrics.maxDrawdown, benchmark: -33.72, russell: -28.4 },
    { label: "Sharpe Ratio", value: metrics.sharpeRatio, benchmark: 0.59, russell: 0.38 },
    { label: "Calmar Ratio", value: metrics.calmarRatio, benchmark: 0.42, russell: 0.27 },
    { label: "Win Rate", value: metrics.winRate, benchmark: 75, russell: 52 },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-[#1F2937]">
      <table className="min-w-full bg-[#0F172A]">
        <thead className="bg-[#111827] text-[#E2E8F0] text-xs uppercase tracking-wide">
          <tr>
            <th className="px-4 py-3 text-left">Metric</th>
            <th className="px-4 py-3 text-left">Your Strategy</th>
            <th className="px-4 py-3 text-left">S&P 500</th>
            <th className="px-4 py-3 text-left">Russell 2000</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-[#1F2937] text-sm">
              <td className="px-4 py-3 text-[#E2E8F0]">{row.label}</td>
              <td
                className={classNames(
                  "px-4 py-3 font-semibold",
                  row.value >= (row.label === "Max Drawdown" ? -20 : 0)
                    ? "text-[#10B981]"
                    : "text-[#E2E8F0]"
                )}
              >
                {row.value.toFixed(2)}%
              </td>
              <td className="px-4 py-3 text-[#94A3B8]">{row.benchmark}%</td>
              <td className="px-4 py-3 text-[#94A3B8]">{row.russell}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactChart({ title, points }: { title: string; points?: number }) {
  return (
    <div className="rounded-xl border border-[#1F2937] bg-gradient-to-br from-[#0B1220] to-[#111827] p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-[#E2E8F0]">{title}</p>
        <span className="text-[10px] text-[#94A3B8]">
          {points ? `${points} points` : "interactive soon"}
        </span>
      </div>
      <div className="h-32 rounded-lg bg-[#0F172A] border border-dashed border-[#1F2937] flex items-center justify-center text-xs text-[#64748B]">
        Chart placeholder
      </div>
    </div>
  );
}

export default function StrategyLabClient({ latestRun }: { latestRun: RunV1SchemaJson | null }) {
  const [activeTab, setActiveTab] = useState<"live" | "backtest">("live");
  const [selectedUniverse, setSelectedUniverse] = useState<string>("russell2000_full");
  const [strategy, setStrategy] = useState<string>("4-pillar");
  const [weights, setWeights] = useState<PillarWeights>({
    valuation: 25,
    quality: 40,
    technical: 20,
    risk: 15,
  });
  const [filters, setFilters] = useState<FilterState>({
    excludeCrypto: false,
    marketCapMin: 0,
    liquidityMin: 0,
    excludeDefense: false,
    excludeFossil: false,
  });
  const [topK, setTopK] = useState<number>(10);
  const [startDate, setStartDate] = useState<string>(PERIOD_PRESETS.full.start);
  const [endDate, setEndDate] = useState<string>(PERIOD_PRESETS.full.end);
  const [rebalancing, setRebalancing] = useState<"monthly" | "quarterly" | "annually">("quarterly");
  const [slippage, setSlippage] = useState<"optimistic" | "realistic" | "conservative">("realistic");
  const [startingCapital, setStartingCapital] = useState<number>(100000);

  const [livePicks, setLivePicks] = useState<LivePick[]>(() => buildLivePicksFromRun(latestRun, topK));
  const visiblePicks = useMemo(() => livePicks.slice(0, topK), [livePicks, topK]);
  const [liveAsOfDate, setLiveAsOfDate] = useState<string>(latestRun?.as_of_date ?? new Date().toISOString().slice(0, 10));
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const [backtestMetrics, setBacktestMetrics] = useState<BacktestMetrics>(SAMPLE_BACKTEST);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [equityCurve, setEquityCurve] = useState<Array<{ date: string; portfolio_value: number; sp500_value: number }>>([]);
  const [drawdown, setDrawdown] = useState<Array<{ date: string; drawdown_pct: number }>>([]);
  const weightTotal = weights.valuation + weights.quality + weights.technical + weights.risk;

  const periodValid =
    new Date(endDate).getTime() > new Date(startDate).getTime() &&
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24) >= 365;

  useEffect(() => {
    // Refresh default picks when latest run changes
    setLivePicks(buildLivePicksFromRun(latestRun, 20));
    if (latestRun?.as_of_date) {
      setLiveAsOfDate(latestRun.as_of_date);
    }
  }, [latestRun]);

  async function handleLiveRun() {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const res = await fetch("/api/live-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          universe: selectedUniverse,
          strategy,
          weights,
          filters,
          topK,
        }),
      });
      if (!res.ok) throw new Error(`Live run failed (${res.status})`);
      const data = (await res.json()) as LiveRunResponse;
      setLivePicks(data.topPicks);
      setLiveAsOfDate(data.asOfDate);
    } catch (err) {
      console.error(err);
      setLiveError("Failed to load live picks. Falling back to last run.");
      setLivePicks(buildLivePicksFromRun(latestRun, 20));
    } finally {
      setLiveLoading(false);
    }
  }

  async function fetchBacktestResults(strategyKey: string) {
    try {
      const res = await fetch(`/api/backtest/results?strategy=${encodeURIComponent(strategyKey)}`);
      if (!res.ok) throw new Error(`Backtest results missing (${res.status})`);
      const data = (await res.json()) as BacktestResultResponse;
      const m = data.summary?.metrics;
      if (m) {
        setBacktestMetrics({
          totalReturn: m.total_return_pct ?? SAMPLE_BACKTEST.totalReturn,
          annualizedReturn: m.annualized_return_pct ?? SAMPLE_BACKTEST.annualizedReturn,
          maxDrawdown: m.max_drawdown_pct ?? SAMPLE_BACKTEST.maxDrawdown,
          sharpeRatio: m.sharpe_ratio ?? SAMPLE_BACKTEST.sharpeRatio,
          calmarRatio: m.calmar_ratio ?? SAMPLE_BACKTEST.calmarRatio,
          winRate: m.win_rate_pct ?? SAMPLE_BACKTEST.winRate,
        });
      }
      setEquityCurve(data.equityCurve ?? []);
      setDrawdown(data.drawdown ?? []);
      setBacktestError(null);
    } catch (err) {
      console.error(err);
      setBacktestMetrics(SAMPLE_BACKTEST);
      setEquityCurve([]);
      setDrawdown([]);
      setBacktestError("Using sample backtest output (no results found).");
    }
  }

  async function handleBacktestRun() {
    setBacktestLoading(true);
    setBacktestError(null);
    try {
      const res = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          universe: selectedUniverse,
          strategy,
          weights,
          period: { startDate, endDate },
          rebalancing,
          slippage,
          topK,
          startingCapital,
        }),
      });
      if (!res.ok) throw new Error(`Backtest run failed (${res.status})`);
      await res.json(); // ignore payload, fetch results separately
      await fetchBacktestResults(strategy);
    } catch (err) {
      console.error(err);
      setBacktestError("Backtest failed. Showing sample metrics.");
      setBacktestMetrics(SAMPLE_BACKTEST);
      setEquityCurve([]);
      setDrawdown([]);
    } finally {
      setBacktestLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-[#1F2937] bg-gradient-to-br from-[#0B1220] to-[#0F172A] px-6 py-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">Strategy Lab</p>
            <h1 className="text-2xl font-semibold text-[#F8FAFC]">Dual-Mode Playbook</h1>
            <p className="text-sm text-[#94A3B8]">
              Configure universes, tune pillars, and switch between Live Runs and Backtests without leaving the page.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab("live")}
              className={classNames(
                "px-4 py-2 text-sm rounded-lg border transition-all",
                activeTab === "live"
                  ? "border-[#3B82F6] bg-[#3B82F6]/20 text-[#E2E8F0]"
                  : "border-[#1F2937] bg-[#0B1220] text-[#94A3B8]"
              )}
            >
              Live Run
            </button>
            <button
              onClick={() => setActiveTab("backtest")}
              className={classNames(
                "px-4 py-2 text-sm rounded-lg border transition-all",
                activeTab === "backtest"
                  ? "border-[#3B82F6] bg-[#3B82F6]/20 text-[#E2E8F0]"
                  : "border-[#1F2937] bg-[#0B1220] text-[#94A3B8]"
              )}
            >
              Backtest
            </button>
          </div>
        </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#94A3B8]">
            <span className="px-3 py-1 rounded-full border border-[#1F2937] bg-[#0B1220]">
              Universe: {selectedUniverse.replace(/_/g, " ")}
            </span>
            <span className="px-3 py-1 rounded-full border border-[#1F2937] bg-[#0B1220]">
            Strategy: {strategy}
          </span>
          <span className="px-3 py-1 rounded-full border border-[#1F2937] bg-[#0B1220]">
            Weight total: {weightTotal}%
          </span>
          {latestRun && (
            <span className="px-3 py-1 rounded-full border border-[#3B82F6]/30 bg-[#0B1220] text-[#E2E8F0]">
              Latest run: {latestRun.run_id} | {latestRun.as_of_date}
            </span>
          )}
        </div>
      </header>

      <SectionCard
        title="Shared Configuration"
        subtitle="Universe selection, strategy weights, and filters apply to both modes."
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-sm text-[#94A3B8] uppercase tracking-wide">Universe Selection</p>
              <UniverseSelector value={selectedUniverse} onChange={setSelectedUniverse} />
            </div>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                {["Momentum-Only", "4-Pillar", "Hybrid", "Custom"].map((label) => {
                  const key = label.toLowerCase().replace(" ", "-");
                  return (
                    <label
                      key={label}
                      className={classNames(
                        "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all",
                        strategy === key
                          ? "border-[#3B82F6] bg-[#3B82F6]/10"
                          : "border-[#1F2937] bg-[#0F172A]"
                      )}
                    >
                      <input
                        type="radio"
                        name="strategy"
                        checked={strategy === key}
                        onChange={() => setStrategy(key)}
                        className="accent-[#3B82F6]"
                      />
                      <span className="text-sm text-[#E2E8F0]">{label}</span>
                    </label>
                  );
                })}
              </div>
              <WeightEditor weights={weights} onChange={setWeights} />
            </div>
          </div>
          <FilterPanel filters={filters} onChange={setFilters} />
        </div>
      </SectionCard>

      {activeTab === "live" && (
        <div className="space-y-6">
          <SectionCard title="Run Configuration" subtitle="Generate picks as of today.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">As of Date</p>
                <p className="text-lg text-[#E2E8F0] font-semibold">{liveAsOfDate}</p>
                <p className="text-xs text-[#64748B]">Live runs always use today.</p>
              </div>
              <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">Top Picks</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={topK}
                    onChange={(e) => setTopK(clampNumber(Number(e.target.value), 1, 20))}
                    className="w-20 bg-[#0B1220] border border-[#1F2937] rounded px-2 py-2 text-sm text-[#E2E8F0]"
                  />
                  <span className="text-xs text-[#94A3B8]">stocks</span>
                </div>
              </div>
              <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">Exports</p>
                  <p className="text-xs text-[#64748B]">CSV, watchlist, and email report.</p>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button className="text-xs px-3 py-2 rounded-lg border border-[#3B82F6]/40 text-[#E2E8F0] bg-[#0B1220] hover:border-[#3B82F6]">
                    Export CSV
                  </button>
                  <button className="text-xs px-3 py-2 rounded-lg border border-[#1F2937] text-[#E2E8F0] bg-[#0B1220] hover:border-[#334155]">
                    Save Watchlist
                  </button>
                  <button className="text-xs px-3 py-2 rounded-lg border border-[#1F2937] text-[#E2E8F0] bg-[#0B1220] hover:border-[#334155]">
                    Email Report
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={handleLiveRun}
                disabled={liveLoading}
                className="px-4 py-2 text-sm rounded-lg border border-[#3B82F6] bg-[#3B82F6]/10 text-[#E2E8F0] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {liveLoading ? "Loading..." : "Generate Picks"}
              </button>
              <button className="px-4 py-2 text-sm rounded-lg border border-[#1F2937] bg-[#0B1220] text-[#94A3B8]">
                Save Configuration
              </button>
            </div>
            {liveError && (
              <p className="text-xs text-[#EF4444] mt-2">{liveError}</p>
            )}
          </SectionCard>

          <SectionCard
            title={`Top ${topK} Stock Picks`}
            subtitle={latestRun ? `As of ${liveAsOfDate}` : "Sample output until a run is available"}
          >
            <LiveRunOutput picks={visiblePicks} />
          </SectionCard>
        </div>
      )}

      {activeTab === "backtest" && (
        <div className="space-y-6">
          <SectionCard title="Backtest Configuration" subtitle="Define period, rebalancing, slippage, and capital.">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide">Time Period</p>
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={startDate}
                    min="2020-01-01"
                    max={endDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-[#0B1220] border border-[#1F2937] rounded px-3 py-2 text-sm text-[#E2E8F0]"
                  />
                  <span className="text-xs text-[#94A3B8]">to</span>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    max="2025-12-31"
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-[#0B1220] border border-[#1F2937] rounded px-3 py-2 text-sm text-[#E2E8F0]"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(PERIOD_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setStartDate(preset.start);
                        setEndDate(preset.end);
                      }}
                      className="text-xs px-3 py-2 rounded-lg border border-[#1F2937] bg-[#0F172A] text-[#E2E8F0] hover:border-[#3B82F6]"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {!periodValid && (
                  <p className="text-xs text-[#EF4444]">
                    Min. period is 1 year. Ensure start &lt; end and within 2020-01-01 to 2025-12-31.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-2">
                    Rebalancing
                  </p>
                  {(
                    [
                      { label: "Monthly", value: "monthly" },
                      { label: "Quarterly", value: "quarterly" },
                      { label: "Annually", value: "annually" },
                    ] as const
                  ).map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm text-[#E2E8F0] mb-1">
                      <input
                        type="radio"
                        name="rebalancing"
                        checked={rebalancing === opt.value}
                        onChange={() => setRebalancing(opt.value)}
                        className="accent-[#3B82F6]"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-2">Slippage Model</p>
                  {(
                    [
                      { label: "Optimistic (0.1-0.5%)", value: "optimistic" },
                      { label: "Realistic (0.5-2.0%)", value: "realistic" },
                      { label: "Conservative (1.0-3.0%)", value: "conservative" },
                    ] as const
                  ).map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm text-[#E2E8F0] mb-1">
                      <input
                        type="radio"
                        name="slippage"
                        checked={slippage === opt.value}
                        onChange={() => setSlippage(opt.value)}
                        className="accent-[#3B82F6]"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">Top Picks</p>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={topK}
                  onChange={(e) => setTopK(clampNumber(Number(e.target.value), 5, 50))}
                  className="w-full bg-[#0B1220] border border-[#1F2937] rounded px-3 py-2 text-sm text-[#E2E8F0]"
                />
              </div>
              <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">Starting Capital</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#94A3B8]">$</span>
                  <input
                    type="number"
                    min={10000}
                    value={startingCapital}
                    onChange={(e) => setStartingCapital(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-[#0B1220] border border-[#1F2937] rounded px-3 py-2 text-sm text-[#E2E8F0]"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">Run Control</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleBacktestRun}
                    disabled={backtestLoading || !periodValid}
                    className="px-3 py-2 text-xs rounded-lg border border-[#3B82F6] bg-[#3B82F6]/10 text-[#E2E8F0] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {backtestLoading ? "Running..." : "Run Backtest"}
                  </button>
                  <button className="px-3 py-2 text-xs rounded-lg border border-[#1F2937] bg-[#0B1220] text-[#94A3B8]">
                    Save Configuration
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Backtest Results" subtitle={backtestError ?? "Quarterly rebalancing output"}>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2 space-y-4">
                <MetricsTable metrics={backtestMetrics} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <CompactChart title="Equity Curve" points={equityCurve.length || undefined} />
                  <CompactChart title="Drawdown" points={drawdown.length || undefined} />
                </div>
              </div>
              <div className="space-y-4">
                <CompactChart title="Quarterly Breakdown" />
                <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] p-4">
                  <p className="text-sm font-semibold text-[#E2E8F0] mb-2">Recent Backtests</p>
                  <div className="space-y-3">
                    {SAMPLE_RECENT_BACKTESTS.map((item) => (
                      <div
                        key={item.title}
                        className="border border-[#1F2937] bg-[#0B1220] rounded-lg px-3 py-2"
                      >
                        <p className="text-xs text-[#94A3B8]">{item.ago}</p>
                        <p className="text-sm text-[#E2E8F0] font-semibold">{item.title}</p>
                        <p className="text-xs text-[#94A3B8]">{item.metrics}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
