"use client";

import { useEffect, useMemo, useState } from "react";
import MarketContextBar from "@/app/components/MarketContextBar";
import RegimeBadge from "@/app/components/RegimeBadge";
import { formatPercent } from "@/lib/percent";
import { Zap, Clock, Play, Loader2, FlaskConical, Timer } from "lucide-react";
import type { MarketContextResponse } from "@/lib/marketContext";
import type { RunV1SchemaJson } from "@/types/generated/run_v1";
import type { UniverseWithMetadata, PresetConfig } from "./loaders";
import { SectorExposure } from "@/app/components/SectorExposure";
import { EquityCurve } from "@/app/components/EquityCurve";
import { DrawdownChart } from "@/app/components/DrawdownChart";
import { FilterCheckbox } from "@/app/components/FilterCheckbox";
import { useDraftConfig, type DraftConfig } from "@/hooks/useDraftConfig";
import { DirtyStateIndicator } from "@/app/components/DirtyStateIndicator";
import { RunProgressIndicator } from "@/app/components/RunProgressIndicator";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { PresetSelector } from "./components/PresetSelector";

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

// Removed SAMPLE_RECENT_BACKTESTS - now loaded server-side from actual backtest files

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

/**
 * Extract current config from the latest run.
 * Note: Current run schema doesn't persist config, so we use defaults.
 * This serves as the baseline for draft comparison.
 */
function extractConfigFromRun(run: RunV1SchemaJson | null, universeId: string): DraftConfig {
  return {
    universe: run?.universe?.definition?.name || universeId,
    preset: null, // Run schema doesn't persist preset info
    weights: { valuation: 25, quality: 40, technical: 20, risk: 15 }, // Default weights
    filters: {
      excludeCrypto: false,
      marketCapMin: 0,
      liquidityMin: 0,
      excludeDefense: false,
      excludeFossil: false,
    },
    topK: 10,
  };
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
  t,
}: {
  value: string;
  onChange: (id: string) => void;
  universes: UniverseWithMetadata[];
  t: (key: string) => string;
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
              {t(`strategyLab.regions.${region}`)}
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
                    <span>{universe.symbol_count} {t('strategyLab.common.stocks')}</span>
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

function WeightEditor({
  weights,
  onChange,
  t,
}: {
  weights: PillarWeights;
  onChange: (next: PillarWeights) => void;
  t: (key: string) => string;
}) {
  const total = weights.valuation + weights.quality + weights.technical + weights.risk;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#E2E8F0] font-semibold">{t('strategyLab.weights.title')}</p>
        <ValidationBadge total={total} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(
          [
            { key: "valuation", label: t('scoring.pillars.valuation'), color: "#3B82F6" },
            { key: "quality", label: t('scoring.pillars.quality'), color: "#10B981" },
            { key: "technical", label: t('scoring.pillars.technical'), color: "#F59E0B" },
            { key: "risk", label: t('scoring.pillars.risk'), color: "#EF4444" },
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
                <div className="text-xs text-[#94A3B8]">{t('strategyLab.weights.weight')}</div>
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
            {t(`strategyLab.weights.presets.${key}`) || preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterPanel({ filters, onChange, t }: { filters: FilterState; onChange: (f: FilterState) => void; t: (key: string) => string }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3 space-y-3">
        <p className="text-sm font-semibold text-[#E2E8F0]">{t('strategyLab.filters.riskExclusion.title')}</p>
        <FilterCheckbox
          label={t('strategyLab.filters.crypto.label')}
          tooltip={t('strategyLab.filters.crypto.tooltip')}
          checked={filters.excludeCrypto}
          recommended
          recommendedLabel={t('strategyLab.filters.presets.institutional') || 'Recommended'}
          onChange={(v) => onChange({ ...filters, excludeCrypto: v })}
        />
        <FilterCheckbox
          label={t('strategyLab.filters.defense.label')}
          tooltip={t('strategyLab.filters.defense.tooltip')}
          checked={filters.excludeDefense}
          onChange={(v) => onChange({ ...filters, excludeDefense: v })}
        />
        <FilterCheckbox
          label={t('strategyLab.filters.fossil.label')}
          tooltip={t('strategyLab.filters.fossil.tooltip')}
          checked={filters.excludeFossil}
          onChange={(v) => onChange({ ...filters, excludeFossil: v })}
        />
      </div>

      <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3 space-y-3">
        <p className="text-sm font-semibold text-[#E2E8F0]">{t('strategyLab.filters.sizeLiquidity.title')}</p>
        <div className="space-y-2">
          <p className="text-xs text-slate-400">{t('strategyLab.filters.minCap.label')}</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: t('strategyLab.filters.minCap.options.all'), value: 0 },
              { label: t('strategyLab.filters.minCap.options.mid'), value: 500 },
              { label: t('strategyLab.filters.minCap.options.large'), value: 2000 },
              { label: t('strategyLab.filters.minCap.options.mega'), value: 10000 },
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
          <p className="text-xs text-slate-400">{t('strategyLab.filters.minLiquidity.label')}</p>
          <div className="flex gap-2">
            {[
              { label: t('strategyLab.filters.minLiquidity.options.none'), value: 0 },
              { label: t('strategyLab.filters.minLiquidity.options.low'), value: 5 },
              { label: t('strategyLab.filters.minLiquidity.options.medium'), value: 10 },
              { label: t('strategyLab.filters.minLiquidity.options.high'), value: 25 },
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
        <p className="text-sm font-semibold text-[#E2E8F0] mb-1">{t('strategyLab.filters.presets.title')}</p>
        <p className="text-xs text-slate-500">{t('strategyLab.filters.presets.description')}</p>
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
            {t('strategyLab.filters.presets.institutional')}
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
            {t('strategyLab.filters.presets.liquidity')}
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveRunOutput({ picks, t }: { picks: LivePick[]; t: (key: string) => string }) {
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
              <p className="text-xs text-[#94A3B8] uppercase tracking-wide">{t('briefing.totalScore')}</p>
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
                { key: "valuation", label: t('scoring.pillars.valuation'), color: "#3B82F6" },
                { key: "quality", label: t('scoring.pillars.quality'), color: "#10B981" },
                { key: "technical", label: t('scoring.pillars.technical'), color: "#F59E0B" },
                { key: "risk", label: t('scoring.pillars.risk'), color: "#EF4444" },
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

function MetricsTable({ metrics, t }: { metrics: BacktestMetrics; t: (key: string) => string }) {
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
            <th className="px-4 py-3 text-left">{t('strategyLab.backtest.table.metric')}</th>
            <th className="px-4 py-3 text-left">{t('strategyLab.backtest.table.columns.strategy')}</th>
            <th className="px-4 py-3 text-left">{t('strategyLab.backtest.table.columns.sp500')}</th>
            <th className="px-4 py-3 text-left">{t('strategyLab.backtest.table.columns.russell')}</th>
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
  recentBacktests = [],
}: {
  latestRun: RunV1SchemaJson | null;
  universes: UniverseWithMetadata[];
  presets: PresetConfig[];
  marketContext?: MarketContextResponse | null;
  recentBacktests?: Array<{ title: string; ago: string; metrics: string }>;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"live" | "backtest">("live");

  // Initialize default universe
  const defaultUniverse = universes.find(u => u.id === "russell2000_full")?.id || universes[0]?.id || "test";

  // Extract current config from latest run
  const currentConfig = useMemo(
    () => extractConfigFromRun(latestRun, defaultUniverse),
    [latestRun, defaultUniverse]
  );

  // Draft state management with localStorage persistence
  const { draft, updateDraft, isDirty, diffSummary, reset: resetDraft, clearDraft } = useDraftConfig(currentConfig);

  // Use draft values for UI state
  const selectedUniverse = draft.universe;
  const selectedPreset = draft.preset;
  const weights = draft.weights;
  const filters = draft.filters;
  const topK = draft.topK;

  // Align with available backtest outputs; UI currently supports hybrid/momentum
  const [strategy] = useState<string>("hybrid");
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
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [runComplete, setRunComplete] = useState(false);

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

  // Setter functions that update draft
  const setSelectedUniverse = (universe: string) => {
    updateDraft({ universe });
  };

  const setWeights = (newWeights: PillarWeights) => {
    updateDraft({ weights: newWeights });
  };

  const setFilters = (newFilters: FilterState) => {
    updateDraft({ filters: newFilters });
  };

  const setTopK = (newTopK: number) => {
    updateDraft({ topK: newTopK });
  };

  const setSelectedPreset = (presetId: string | null) => {
    updateDraft({ preset: presetId });
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
    setRunComplete(false);
    setCurrentRunId(null);

    try {
      // Step 1: Trigger the run and get runId
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

      if (!res.ok) {
        throw new Error(`Live run failed (${res.status})`);
      }

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // If we got a runId, the run is starting in the background
      if (data.runId) {
        setCurrentRunId(data.runId);
        // The progress indicator will handle the rest via SSE
      } else if (data.topPicks) {
        // Fallback: direct response with results
        setLivePicks(data.topPicks);
        setLiveAsOfDate(data.asOfDate);
        setLiveLoading(false);
        clearDraft();
      }
    } catch (err) {
      console.error(err);
      setLiveError("Failed to start live run. Falling back to last run.");
      setLivePicks(buildLivePicksFromRun(latestRun, 20));
      setLiveLoading(false);
    }
  }

  // Handle run completion
  const handleRunComplete = async () => {
    setRunComplete(true);
    setLiveLoading(false);
    setCurrentRunId(null);

    // Refresh the latest run data
    try {
      const res = await fetch("/api/live-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topK }),
      });

      if (res.ok) {
        const data = (await res.json()) as LiveRunResponse;
        if (data.topPicks) {
          setLivePicks(data.topPicks);
          setLiveAsOfDate(data.asOfDate);
        }
      }
    } catch (err) {
      console.error("Failed to refresh results:", err);
    }

    clearDraft();
  };

  const handleRunError = (error: string) => {
    setLiveError(`Run failed: ${error}`);
    setLiveLoading(false);
    setCurrentRunId(null);
    // Fall back to last run
    setLivePicks(buildLivePicksFromRun(latestRun, 20));
  };

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

      // Clear draft after successful run
      clearDraft();
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
            <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">{t('strategyLab.header.eyebrow')}</p>
            <h1 className="text-2xl font-semibold text-[#F8FAFC]">{t('strategyLab.header.title')}</h1>
            <p className="text-sm text-[#94A3B8]">
              {t('strategyLab.header.subtitle')}
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
              <Zap className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-white">{t('strategyLab.modes.live.title')}</span>
            </div>
            <p className="text-xs text-slate-400">
              {t('strategyLab.modes.live.description')}
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
              <Timer className="w-4 h-4 text-blue-400" />
              <span className="font-semibold text-white">{t('strategyLab.modes.backtest.title')}</span>
            </div>
            <p className="text-xs text-slate-400">
              {t('strategyLab.modes.backtest.description')}
            </p>
          </div>
        </div>

        <button
          onClick={activeTab === "live" ? handleLiveRun : handleBacktestRun}
          disabled={
            activeTab === "live"
              ? liveLoading || !!currentRunId
              : backtestLoading || !periodValid
          }
          className={classNames(
            "w-full py-3 rounded-lg font-semibold text-lg transition-all flex items-center justify-center gap-2",
            activeTab === "live"
              ? "bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60"
              : "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60"
          )}
        >
          {activeTab === "live" ? (
            currentRunId ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> {t('strategyLab.actions.running')}
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" /> {t('strategyLab.actions.findTopStocks')}
              </>
            )
          ) : (
            <>
              <Play className="w-5 h-5" /> {t('strategyLab.actions.startBacktest')}
            </>
          )}
        </button>

        <div className="flex flex-wrap items-center gap-3 text-xs text-[#94A3B8]">
          {selectedUniverseMeta && (
            <>
              <span className="px-3 py-1 rounded-full border border-[#1F2937] bg-[#0B1220] flex items-center gap-1.5">
                <span>{selectedUniverseMeta.flag}</span>
                <span>{selectedUniverseMeta.name}</span>
                <span className="text-[#64748B]">({selectedUniverseMeta.symbol_count} {t('strategyLab.common.stocks')})</span>
              </span>
              <span className="px-3 py-1 rounded-full border border-[#1F2937] bg-[#0B1220] font-mono">
                Runtime: {formatRuntime(selectedUniverseMeta.estimatedRuntimeMin)}
              </span>
            </>
          )}
          {selectedPreset && (
            <span className="px-3 py-1 rounded-full border border-[#3B82F6]/30 bg-[#0B1220] text-[#E2E8F0]">
              {t('strategyLab.header.preset')}: {presets.find(p => p.id === selectedPreset)?.name || selectedPreset}
            </span>
          )}
          <span className="px-3 py-1 rounded-full border border-[#1F2937] bg-[#0B1220]">
            {t('strategyLab.header.weightTotal')}: {weightTotal}%
          </span>
          {latestRun && (
            <span className="px-3 py-1 rounded-full border border-[#1F2937] bg-[#0B1220] text-[#94A3B8]">
              {t('strategyLab.header.latest')}: {latestRun.as_of_date}
            </span>
          )}
        </div>
      </header>

      <MarketContextBar initialData={marketContext ?? undefined} />

      <RegimeBadge />

      <SectionCard
        title={t('strategyLab.sections.sharedConfig.title')}
        subtitle={t('strategyLab.sections.sharedConfig.subtitle')}
      >
        {/* Proton Pass injects data-protonpass-form on mount in some browsers; suppress hydration diff */}
        <div className="space-y-6" suppressHydrationWarning>
          <div className="space-y-3">
            <StepLabel step={1}>{t('strategyLab.steps.1')}</StepLabel>
            <UniverseSelector
              value={selectedUniverse}
              onChange={setSelectedUniverse}
              universes={universes}
              t={t}
            />
          </div>

          <div className="space-y-3">
            <StepLabel step={2}>{t('strategyLab.steps.2')}</StepLabel>
            <PresetSelector
              value={selectedPreset}
              onChange={handlePresetChange}
              presets={presets}
            />
          </div>

          <div className="space-y-3">
            <WeightEditor weights={weights} onChange={setWeights} t={t} />
          </div>

          <div className="space-y-3">
            <StepLabel step={3}>{t('strategyLab.steps.3')}</StepLabel>
            <FilterPanel filters={filters} onChange={setFilters} t={t} />
          </div>
        </div>
      </SectionCard>

      {activeTab === "live" && currentRunId && (
        <SectionCard title={t('strategyLab.sections.runProgress.title')} subtitle={t('strategyLab.sections.runProgress.subtitle')}>
          <RunProgressIndicator
            runId={currentRunId}
            onComplete={handleRunComplete}
            onError={handleRunError}
          />
        </SectionCard>
      )}

      {activeTab === "live" && (
        <div className="space-y-6">
          <SectionCard title={t('strategyLab.sections.runConfig.title')} subtitle={t('strategyLab.sections.runConfig.subtitle')}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4" suppressHydrationWarning>
              <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">{t('strategyLab.sections.runConfig.labels.asOfDate')}</p>
                <p className="text-lg text-[#E2E8F0] font-semibold">{liveAsOfDate}</p>
                <p className="text-xs text-[#64748B]">{t('strategyLab.sections.runConfig.liveRunsNote')}</p>
              </div>
              <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">{t('strategyLab.sections.runConfig.labels.estimatedRuntime')}</p>
                <p className="text-lg text-[#E2E8F0] font-semibold font-mono">
                  {selectedUniverseMeta ? runtimeEstimate(selectedUniverseMeta.symbol_count ?? 0, "live").label : '--'}
                </p>
                <p className="text-xs text-[#64748B]">
                  {selectedUniverseMeta?.status === 'TEST' && 'Quick test run'}
                  {selectedUniverseMeta?.status === 'SAMPLE' && 'Medium-sized test'}
                  {selectedUniverseMeta?.status === 'FULL' && 'Full production run'}
                </p>
              </div>
              <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">{t('strategyLab.sections.runConfig.labels.topPicks')}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={topK}
                    onChange={(e) => setTopK(clampNumber(Number(e.target.value), 1, 20))}
                    className="w-20 bg-[#0B1220] border border-[#1F2937] rounded px-2 py-2 text-sm text-[#E2E8F0]"
                  />
                  <span className="text-xs text-[#94A3B8]">{t('strategyLab.common.stocks')}</span>
                </div>
              </div>
              <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">{t('strategyLab.sections.runConfig.labels.exports')}</p>
                  <p className="text-xs text-[#64748B]">{t('strategyLab.sections.runConfig.exportsNote')}</p>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button className="text-xs px-3 py-2 rounded-lg border border-[#3B82F6]/40 text-[#E2E8F0] bg-[#0B1220] hover:border-[#3B82F6]">
                    {t('strategyLab.actions.exportCSV')}
                  </button>
                  <button className="text-xs px-3 py-2 rounded-lg border border-[#1F2937] text-[#E2E8F0] bg-[#0B1220] hover:border-[#334155]">
                    {t('strategyLab.actions.saveWatchlist')}
                  </button>
                  <button className="text-xs px-3 py-2 rounded-lg border border-[#1F2937] text-[#E2E8F0] bg-[#0B1220] hover:border-[#334155]">
                    {t('strategyLab.actions.emailReport')}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={handleLiveRun}
                disabled={liveLoading || !!currentRunId}
                className="px-4 py-2 text-sm rounded-lg border border-[#3B82F6] bg-[#3B82F6]/10 text-[#E2E8F0] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {currentRunId
                  ? "Running..."
                  : liveLoading
                    ? "Starting..."
                    : t('strategyLab.actions.generatePicks')}
              </button>
              <button className="px-4 py-2 text-sm rounded-lg border border-[#1F2937] bg-[#0B1220] text-[#94A3B8]">
                {t('strategyLab.actions.saveConfig')}
              </button>
            </div>
            {liveError && (
              <p className="text-xs text-[#EF4444] mt-2">{liveError}</p>
            )}
          </SectionCard>

          <SectionCard
            title={t('strategyLab.sections.topPicks.title').replace('{count}', topK.toString())}
            subtitle={latestRun ? t('strategyLab.sections.topPicks.subtitle').replace('{date}', liveAsOfDate) : t('strategyLab.sections.topPicks.subtitleSample')}
          >
            <SectorExposure 
              picks={visiblePicks.map(p => ({ 
                symbol: p.symbol, 
                industry: p.sector || "Unknown" 
              }))} 
            />
            <LiveRunOutput picks={visiblePicks} t={t} />
          </SectionCard>
        </div>
      )}

      {activeTab === "backtest" && (
        <div className="space-y-6">
          <SectionCard title={t('strategyLab.sections.backtestConfig.title')} subtitle={t('strategyLab.sections.backtestConfig.subtitle')}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide">{t('strategyLab.backtest.timePeriod')}</p>
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
                      {t(`strategyLab.backtest.periodPresets.${key}`) || preset.label}
                    </button>
                  ))}
                </div>
                {!periodValid && (
                  <p className="text-xs text-[#EF4444]">
                    {t('strategyLab.backtest.periodError')}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] px-4 py-3">
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-2">
                    {t('strategyLab.backtest.rebalancing')}
                  </p>
                  {(
                    [
                      { label: t('strategyLab.backtest.rebalancingOptions.monthly'), value: "monthly" },
                      { label: t('strategyLab.backtest.rebalancingOptions.quarterly'), value: "quarterly" },
                      { label: t('strategyLab.backtest.rebalancingOptions.annually'), value: "annually" },
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
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-2">{t('strategyLab.backtest.slippage')}</p>
                  {(
                    [
                      { label: t('strategyLab.backtest.slippageOptions.optimistic'), value: "optimistic" },
                      { label: t('strategyLab.backtest.slippageOptions.realistic'), value: "realistic" },
                      { label: t('strategyLab.backtest.slippageOptions.conservative'), value: "conservative" },
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
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">{t('strategyLab.sections.runConfig.labels.topPicks')}</p>
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
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">{t('strategyLab.backtest.startingCapital')}</p>
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
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">{t('strategyLab.backtest.runControl')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleBacktestRun}
                    disabled={backtestLoading || !periodValid}
                    className="px-3 py-2 text-xs rounded-lg border border-[#3B82F6] bg-[#3B82F6]/10 text-[#E2E8F0] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {backtestLoading ? "Running..." : t('strategyLab.actions.runBacktest')}
                  </button>
                  <button className="px-3 py-2 text-xs rounded-lg border border-[#1F2937] bg-[#0B1220] text-[#94A3B8]">
                    {t('strategyLab.actions.saveConfig')}
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t('strategyLab.sections.backtestResults.title')} subtitle={backtestError ?? t('strategyLab.sections.backtestResults.subtitle')}>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2 space-y-4">
                <MetricsTable metrics={backtestMetrics} t={t} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-[#1F2937] bg-gradient-to-br from-[#0B1220] to-[#111827] p-4">
                    <p className="text-sm font-semibold text-[#E2E8F0] mb-3">{t('strategyLab.backtest.charts.equity')}</p>
                    <EquityCurve data={equityCurve.map(d => ({ date: d.date, portfolio: d.portfolio_value, benchmark: d.sp500_value }))} />
                  </div>
                  <div className="rounded-xl border border-[#1F2937] bg-gradient-to-br from-[#0B1220] to-[#111827] p-4">
                    <p className="text-sm font-semibold text-[#E2E8F0] mb-3">{t('strategyLab.backtest.charts.drawdown')}</p>
                    <DrawdownChart 
                      data={drawdown.map(d => ({ date: d.date, drawdown: d.drawdown_pct / 100 }))} 
                      maxDrawdown={backtestMetrics.maxDrawdown / 100} 
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                
                <div className="rounded-xl border border-[#1F2937] bg-[#0F172A] p-4">
                  <p className="text-sm font-semibold text-[#E2E8F0] mb-2">{t('strategyLab.backtest.recent.title')}</p>
                  <div className="space-y-3">
                    {recentBacktests.length > 0 ? recentBacktests.map((item) => (
                      <div
                        key={item.title}
                        className="border border-[#1F2937] bg-[#0B1220] rounded-lg px-3 py-2"
                      >
                        <p className="text-xs text-[#94A3B8]">{item.ago}</p>
                        <p className="text-sm text-[#E2E8F0] font-semibold">{item.title}</p>
                        <p className="text-xs text-[#94A3B8]">{item.metrics}</p>
                      </div>
                    )) : (
                      <div className="text-center py-4 text-[#64748B] text-sm">
                        {t('strategyLab.backtest.recent.empty')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Draft State Indicator - Floating notification for unsaved changes */}
      <DirtyStateIndicator
        isDirty={isDirty && !currentRunId}
        diffSummary={diffSummary}
        onReset={resetDraft}
        onRunAnalysis={activeTab === "live" ? handleLiveRun : handleBacktestRun}
        estimatedRuntime={
          selectedUniverseMeta
            ? formatRuntime(selectedUniverseMeta.estimatedRuntimeMin)
            : "~1 minute"
        }
        symbolCount={selectedUniverseMeta?.symbol_count ?? 0}
      />
    </div>
  );
}
