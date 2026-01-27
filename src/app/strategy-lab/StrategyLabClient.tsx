"use client";

import { useEffect, useMemo, useState } from "react";
import { Zap, History, Play, TrendingUp, Shield, Rocket } from "lucide-react";
import MarketContextBar from "@/app/components/MarketContextBar";
import { formatPercent } from "@/lib/percent";
import type { MarketContextResponse } from "@/lib/marketContext";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import type { UniverseWithMetadata, PresetConfig } from "./loaders";
import { SectorExposure } from "@/app/components/SectorExposure";
import { EquityCurve } from "@/app/components/EquityCurve";
import { DrawdownChart } from "@/app/components/DrawdownChart";
import { PresetCard } from "@/app/components/PresetCard";
import { FilterCheckbox } from "@/app/components/FilterCheckbox";

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

// Universes are now loaded server-side and passed as props

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
  full: { start: "2015-01-01", end: "2025-12-31", label: "Full Period (2015-2025)" },
  decade: { start: "2015-01-01", end: "2025-12-31", label: "Last 10 Years" },
  fiveYear: { start: "2020-01-01", end: "2025-12-31", label: "Last 5 Years (2020-2025)" },
  threeYear: { start: "2023-01-01", end: "2025-12-31", label: "Last 3 Years" },
  preCovid: { start: "2015-01-01", end: "2019-12-31", label: "Pre-COVID (2015-2019)" },
  covid: { start: "2020-01-01", end: "2021-12-31", label: "COVID Era (2020-2021)" },
  postCovid: { start: "2022-01-01", end: "2025-12-31", label: "Post-COVID (2022-2025)" },
  bear2022: { start: "2022-01-01", end: "2022-12-31", label: "2022 Bear Market" },
  bull2023: { start: "2023-01-01", end: "2023-12-31", label: "2023 Bull Market" },
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

const SAMPLE_EQUITY: Array<{ date: string; portfolio_value: number; sp500_value: number }> = Array.from({ length: 12 }).map(
  (_, i) => {
    const month = i + 1;
    const date = `2020-${month.toString().padStart(2, "0")}-01`;
    const base = 100000;
    const portfolio_value = base * (1 + 0.01 * i);
    const sp500_value = base * (1 + 0.008 * i);
    return { date, portfolio_value, sp500_value };
  }
);

const SAMPLE_DRAWDOWN: Array<{ date: string; drawdown_pct: number }> = [
  { date: "2020-01-01", drawdown_pct: 0 },
  { date: "2020-04-01", drawdown_pct: -5 },
  { date: "2020-07-01", drawdown_pct: -12 },
  { date: "2020-10-01", drawdown_pct: -6 },
  { date: "2021-01-01", drawdown_pct: -2 },
];

function classNames(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function StepLabel({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold">
        {step}
      </span>
      <span>{children}</span>
    </div>
  );
}

function runtimeEstimate(symbolCount: number, mode: "live" | "backtest") {
  const minutes =
    mode === "live" ? Math.max(1, Math.ceil(symbolCount / 20)) : Math.max(1, Math.ceil(symbolCount / 100));
  return { minutes, label: minutes < 1 ? "< 1 Minute" : `~${minutes} Minute${minutes === 1 ? "" : "n"}` };
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
  universes,
}: {
  value: string;
  onChange: (id: string) => void;
  universes: UniverseWithMetadata[];
}) {
  // Group by region
  const grouped = useMemo(() => {
    const groups: Record<string, UniverseWithMetadata[]> = {
      US: [],
      Europe: [],
      Asia: [],
      LatAm: [],
    };

    universes.forEach(u => {
      if (groups[u.region]) {
        groups[u.region].push(u);
      }
    });

    return groups;
  }, [universes]);

  const statusColor = (status: string) => {
    if (status === "FULL") return "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/40";
    if (status === "SAMPLE") return "text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/40";
    return "text-[#94A3B8] bg-[#94A3B8]/10 border-[#94A3B8]/30";
  };

  const formatRuntime = (min: number) => {
    if (min === 0) return "~15 sec";
    if (min < 1) return "~1 min";
    if (min >= 60) {
      const hours = Math.floor(min / 60);
      const mins = min % 60;
      return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`;
    }
    return `~${min} min`;
  };

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([region, items]) => {
        if (items.length === 0) return null;

        return (
          <div key={region}>
            <p className="text-xs uppercase tracking-wide text-[#94A3B8] mb-2 font-semibold">
              {region === 'US' && '🇺🇸 United States'}
              {region === 'Europe' && '🇪🇺 Europe'}
              {region === 'Asia' && '🌏 Asia'}
              {region === 'LatAm' && '🌎 Latin America'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {items.map((universe) => (
                <button
                  key={universe.id}
                  onClick={() => onChange(universe.id)}
                  className={classNames(
                    "rounded-xl border px-3 py-2.5 text-left transition-all",
                    "bg-[#0F172A] hover:border-[#334155] hover:-translate-y-[1px]",
                    value === universe.id
                      ? "border-[#3B82F6] shadow-[0_0_0_1px_rgba(59,130,246,0.3)]"
                      : "border-[#1F2937]"
                  )}
                >
                  <div className="flex items-start justify-between mb-1.5 gap-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-sm">{universe.flag}</span>
                      <p className="text-xs font-semibold text-[#E2E8F0] truncate">
                        {universe.name}
                      </p>
                    </div>
                    <span
                      className={classNames(
                        "text-[9px] px-1.5 py-0.5 rounded-full border uppercase tracking-wide flex-shrink-0",
                        statusColor(universe.status)
                      )}
                    >
                      {universe.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[#94A3B8]">
                    <span>{universe.symbol_count} stocks</span>
                    <span className="font-mono">{formatRuntime(universe.estimatedRuntimeMin)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PresetSelector({
  value,
  onChange,
  presets,
}: {
  value: string | null;
  onChange: (id: string | null, weights?: PillarWeights) => void;
  presets: PresetConfig[];
}) {
  const riskMap: Record<string, "low" | "medium" | "high"> = {
    shield: "low",
    deep-value: "medium",
    compounder: "medium",
    quant: "medium",
    rocket: "high",
  };

  const iconFor = (id: string) => {
    if (id.includes("shield")) return <Shield className="w-5 h-5" />;
    if (id.includes("rocket")) return <Rocket className="w-5 h-5" />;
    return <TrendingUp className="w-5 h-5" />;
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#E2E8F0] font-semibold">Strategy Presets</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <PresetCard
          name="Custom"
          subtitle="Manuelle Gewichtung"
          description="Passe Pillar-Gewichte frei an oder nutze eigene Vorgaben."
          icon={<Play className="w-5 h-5 text-emerald-400" />}
          riskLevel="medium"
          weights={{ v: 25, q: 25, t: 25, r: 25 }}
          selected={value === null}
          onClick={() => onChange(null)}
        />
        {presets.map((preset) => (
          <PresetCard
            key={preset.id}
            name={preset.name}
            subtitle={preset.id}
            description={preset.description}
            icon={iconFor(preset.id)}
            riskLevel={riskMap[preset.id] ?? "medium"}
            weights={{
              v: Math.round(preset.pillar_weights.valuation * 100),
              q: Math.round(preset.pillar_weights.quality * 100),
              t: Math.round(preset.pillar_weights.technical * 100),
              r: Math.round(preset.pillar_weights.risk * 100),
            }}
            selected={value === preset.id}
            onClick={() => onChange(preset.id, preset.pillar_weights)}
          />
        ))}
      </div>
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
      <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3 space-y-3">
        <p className="text-sm font-semibold text-[#E2E8F0]">Risiko & Exklusion</p>
        <FilterCheckbox
          label="Crypto-Mining-Aktien ausschließen"
          tooltip="Entfernt MARA, RIOT, HUT, COIN & Co. (sehr hohe Volatilität)."
          checked={filters.excludeCrypto}
          recommended
          onChange={(v) => onChange({ ...filters, excludeCrypto: v })}
        />
        <FilterCheckbox
          label="Rüstungsunternehmen ausschließen"
          tooltip="Entfernt LMT, RTX, NOC, GD, BA und weitere Defense-Namen (ESG)."
          checked={filters.excludeDefense}
          onChange={(v) => onChange({ ...filters, excludeDefense: v })}
        />
        <FilterCheckbox
          label="Fossil-Fuel-Unternehmen ausschließen"
          tooltip="Entfernt Öl- und Gasproduzenten (XOM, CVX, COP ...)."
          checked={filters.excludeFossil}
          onChange={(v) => onChange({ ...filters, excludeFossil: v })}
        />
      </div>

      <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3 space-y-3">
        <p className="text-sm font-semibold text-[#E2E8F0]">Größen- & Liquiditätsfilter</p>
        <div className="space-y-2">
          <p className="text-xs text-slate-400">Mindest-Marktkapitalisierung</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Alle", value: 0 },
              { label: "> 500M (Mid Cap)", value: 500 },
              { label: "> 2B (Large Cap)", value: 2000 },
              { label: "> 10B (Mega Cap)", value: 10000 },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => onChange({ ...filters, marketCapMin: opt.value })}
                className={classNames(
                  "px-3 py-1.5 text-xs rounded-full transition-all",
                  filters.marketCapMin === opt.value
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-700 text-slate-200 hover:bg-slate-600"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-slate-400">Liquidität (ø Tagesumsatz, Mio USD)</p>
          <div className="flex gap-2">
            {[
              { label: "None", value: 0 },
              { label: ">= 5M", value: 5 },
              { label: ">= 10M", value: 10 },
              { label: ">= 25M", value: 25 },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => onChange({ ...filters, liquidityMin: opt.value })}
                className={classNames(
                  "px-3 py-1.5 text-xs rounded-full transition-all",
                  filters.liquidityMin === opt.value
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-700 text-slate-200 hover:bg-slate-600"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3 space-y-3">
        <p className="text-sm font-semibold text-[#E2E8F0] mb-1">Schnell-Presets</p>
        <p className="text-xs text-slate-500">1 Klick für typische Compliance-Sets.</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() =>
              onChange({
                excludeCrypto: true,
                marketCapMin: 2000,
                liquidityMin: 10,
                excludeDefense: true,
                excludeFossil: true,
              })
            }
            className="text-xs px-3 py-2 rounded-lg border border-emerald-500/60 text-emerald-100 bg-emerald-500/10 hover:border-emerald-400"
          >
            Institutional Safe (empfohlen)
          </button>
          <button
            onClick={() =>
              onChange({
                excludeCrypto: true,
                marketCapMin: 500,
                liquidityMin: 5,
                excludeDefense: false,
                excludeFossil: false,
              })
            }
            className="text-xs px-3 py-2 rounded-lg border border-slate-700 text-slate-200 bg-slate-800/60 hover:border-slate-500"
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



export default function StrategyLabClient({
  latestRun,
  universes,
  presets,
  marketContext,
}: {
  latestRun: RunV1SchemaJson | null;
  universes: UniverseWithMetadata[];
  presets: PresetConfig[];
  marketContext?: MarketContextResponse | null;
}) {
  const [activeTab, setActiveTab] = useState<"live" | "backtest">("live");
  const [selectedUniverse, setSelectedUniverse] = useState<string>(
    universes.find(u => u.id === "russell2000_full")?.id || universes[0]?.id || "test"
  );
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  // Align with available backtest outputs; UI currently supports hybrid/momentum
  const [strategy] = useState<string>("hybrid");
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
  const [startDate, setStartDate] = useState<string>(PERIOD_PRESETS.fiveYear.start);
  const [endDate, setEndDate] = useState<string>(PERIOD_PRESETS.fiveYear.end);
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

  // Get selected universe metadata
  const selectedUniverseMeta = useMemo(
    () => universes.find(u => u.id === selectedUniverse),
    [universes, selectedUniverse]
  );

  // Fetch backtest results when component mounts or strategy changes
  useEffect(() => {
    fetchBacktestResults(strategy);
  }, [strategy]);

  // Format runtime display
  const formatRuntime = (min: number) => {
    if (min === 0) return "~15 seconds";
    if (min < 1) return "~1 minute";
    if (min >= 60) {
      const hours = Math.floor(min / 60);
      const mins = min % 60;
      return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`;
    }
    return `~${min} minutes`;
  };

  // Handle preset selection
  const handlePresetChange = (presetId: string | null, presetWeights?: PillarWeights) => {
    setSelectedPreset(presetId);
    if (presetWeights) {
      // Convert decimal weights (0.30) to percentage (30) for UI sliders
      setWeights({
        valuation: Math.round(presetWeights.valuation * 100),
        quality: Math.round(presetWeights.quality * 100),
        technical: Math.round(presetWeights.technical * 100),
        risk: Math.round(presetWeights.risk * 100),
      });
    }
  };

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
          preset: selectedPreset,
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
      const curve = data.equityCurve ?? [];
      const dd = data.drawdown ?? [];

      if (curve.length === 0 || dd.length === 0) {
        console.warn('[Backtest] No timeseries returned, falling back to sample curves');
        setEquityCurve(SAMPLE_EQUITY);
        setDrawdown(SAMPLE_DRAWDOWN);
        setBacktestError("Backtest results missing timeseries — showing sample curve.");
      } else {
        setEquityCurve(curve);
        setDrawdown(dd);
        setBacktestError(null);
      }
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
          preset: selectedPreset,
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

  // Handle tab switching to refresh data if needed
  const handleTabSwitch = (tab: "live" | "backtest") => {
    setActiveTab(tab);
    if (tab === "backtest") {
      fetchBacktestResults(strategy);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-[#1F2937] bg-gradient-to-br from-[#0B1220] to-[#0F172A] px-6 py-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">Strategy Lab</p>
            <h1 className="text-2xl font-semibold text-[#F8FAFC]">Dual-Mode Playbook</h1>
            <p className="text-sm text-[#94A3B8]">
              Klarer 3-Schritte-Flow: Universum wählen, Strategie wählen, Analyse starten.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className={classNames(
              "p-4 rounded-lg border-2 cursor-pointer transition-all",
              activeTab === "live"
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-slate-700 hover:border-slate-600 bg-[#0B1220]"
            )}
            onClick={() => handleTabSwitch("live")}
          >
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-emerald-400" />
              <span className="font-semibold text-white">Live-Analyse</span>
            </div>
            <p className="text-xs text-slate-400">
              Analysiere aktuelle Marktdaten und erhalte heute kaufenswerte Aktien.
            </p>
          </div>
          <div
            className={classNames(
              "p-4 rounded-lg border-2 cursor-pointer transition-all",
              activeTab === "backtest"
                ? "border-blue-500 bg-blue-500/10"
                : "border-slate-700 hover:border-slate-600 bg-[#0B1220]"
            )}
            onClick={() => handleTabSwitch("backtest")}
          >
            <div className="flex items-center gap-2 mb-1">
              <History className="w-5 h-5 text-blue-400" />
              <span className="font-semibold text-white">Backtest</span>
            </div>
            <p className="text-xs text-slate-400">
              Teste, wie die Strategie von 2015–2025 performt hätte.
            </p>
          </div>
        </div>

        <button
          onClick={activeTab === "live" ? handleLiveRun : handleBacktestRun}
          disabled={activeTab === "live" ? liveLoading : backtestLoading || !periodValid}
          className={classNames(
            "w-full py-3 rounded-lg font-semibold text-lg transition-all flex items-center justify-center gap-2",
            activeTab === "live"
              ? "bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60"
              : "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60"
          )}
        >
          {activeTab === "live" ? (
            <>
              <Zap className="w-5 h-5" /> Top-Aktien jetzt finden
            </>
          ) : (
            <>
              <Play className="w-5 h-5" /> Backtest starten (2015–2025)
            </>
          )}
        </button>

        <div className="flex flex-wrap items-center gap-3 text-xs text-[#94A3B8]">
          {selectedUniverseMeta && (
            <>
              <span className="px-3 py-1 rounded-full border border-[#1F2937] bg-[#0B1220] flex items-center gap-1.5">
                <span>{selectedUniverseMeta.flag}</span>
                <span>{selectedUniverseMeta.name}</span>
                <span className="text-[#64748B]">({selectedUniverseMeta.symbol_count} stocks)</span>
              </span>
              <span className="px-3 py-1 rounded-full border border-[#1F2937] bg-[#0B1220] font-mono">
                Runtime: {formatRuntime(selectedUniverseMeta.estimatedRuntimeMin)}
              </span>
            </>
          )}
          {selectedPreset && (
            <span className="px-3 py-1 rounded-full border border-[#3B82F6]/30 bg-[#0B1220] text-[#E2E8F0]">
              Preset: {presets.find(p => p.id === selectedPreset)?.name || selectedPreset}
            </span>
          )}
          <span className="px-3 py-1 rounded-full border border-[#1F2937] bg-[#0B1220]">
            Weight total: {weightTotal}%
          </span>
          {latestRun && (
            <span className="px-3 py-1 rounded-full border border-[#1F2937] bg-[#0B1220] text-[#94A3B8]">
              Latest: {latestRun.as_of_date}
            </span>
          )}
        </div>
      </header>

      <MarketContextBar initialData={marketContext ?? undefined} />

      <SectionCard
        title="Shared Configuration"
        subtitle="Folge den drei Schritten – alles wirkt auf Live & Backtest."
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <StepLabel step={1}>Wähle dein Anlageuniversum</StepLabel>
            <UniverseSelector
              value={selectedUniverse}
              onChange={setSelectedUniverse}
              universes={universes}
            />
          </div>

          <div className="space-y-3">
            <StepLabel step={2}>Wähle eine Strategie (oder passe Gewichte an)</StepLabel>
            <PresetSelector
              value={selectedPreset}
              onChange={handlePresetChange}
              presets={presets}
            />
          </div>

          <div className="space-y-3">
            <WeightEditor weights={weights} onChange={setWeights} />
          </div>

          <div className="space-y-3">
            <StepLabel step={3}>Feinjustiere Filter (optional)</StepLabel>
            <FilterPanel filters={filters} onChange={setFilters} />
          </div>
        </div>
      </SectionCard>

      {activeTab === "live" && (
        <div className="space-y-6">
          <SectionCard title="Run Configuration" subtitle="Generate picks as of today.">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">As of Date</p>
                <p className="text-lg text-[#E2E8F0] font-semibold">{liveAsOfDate}</p>
                <p className="text-xs text-[#64748B]">Live runs always use today.</p>
              </div>
              <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">Estimated Runtime</p>
                <p className="text-lg text-[#E2E8F0] font-semibold font-mono">
                  {selectedUniverseMeta ? runtimeEstimate(selectedUniverseMeta.symbol_count ?? 0, "live").label : '--'}
                </p>
                <p className="text-xs text-[#64748B]">
                  {selectedUniverseMeta?.status === 'TEST' && '⚡ Quick test run'}
                  {selectedUniverseMeta?.status === 'SAMPLE' && '📊 Medium-sized test'}
                  {selectedUniverseMeta?.status === 'FULL' && '🏭 Full production run'}
                </p>
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
            <SectorExposure 
              picks={visiblePicks.map(p => ({ 
                symbol: p.symbol, 
                industry: p.sector || "Unknown" 
              }))} 
            />
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
                    min="2015-01-01"
                    max={endDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-[#0B1220] border border-[#1F2937] rounded px-3 py-2 text-sm text-[#E2E8F0]"
                  />
                  <span className="text-xs text-[#94A3B8]">to</span>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    max="2026-01-31"
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
                    Min. period is 1 year. Ensure start &lt; end and within 2015-01-01 to 2026-01-31.
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
                  <div className="rounded-xl border border-[#1F2937] bg-gradient-to-br from-[#0B1220] to-[#111827] p-4">
                    <p className="text-sm font-semibold text-[#E2E8F0] mb-3">Equity Curve</p>
                    <EquityCurve data={equityCurve.map(d => ({ date: d.date, portfolio: d.portfolio_value, benchmark: d.sp500_value }))} />
                  </div>
                  <div className="rounded-xl border border-[#1F2937] bg-gradient-to-br from-[#0B1220] to-[#111827] p-4">
                    <p className="text-sm font-semibold text-[#E2E8F0] mb-3">Drawdown</p>
                    <DrawdownChart 
                      data={drawdown.map(d => ({ date: d.date, drawdown: d.drawdown_pct / 100 }))} 
                      maxDrawdown={backtestMetrics.maxDrawdown / 100} 
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                
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
