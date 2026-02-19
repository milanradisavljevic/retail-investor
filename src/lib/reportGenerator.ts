import React, { type ReactElement } from 'react';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { type DocumentProps, renderToBuffer } from '@react-pdf/renderer';
import { getLatestRun, getRecentRuns } from '@/lib/runLoader';
import { buildScoreView, type ScoreQuery } from '@/lib/scoreView';
import { computeDeltas } from '@/lib/runDelta';
import { getCompanyName } from '@/core/company';
import { detectRegime, type RegimeLabel } from '@/regime/engine';
import { getMarketContext } from '@/lib/marketContext';
import { getDatabase } from '@/data/db';
import { getPositions } from '@/data/portfolio';
import {
  calculatePortfolioSummary,
  enrichPositions,
  getPortfolioScore,
} from '@/data/portfolioEnrichment';
import { loadEarningsCalendar } from '@/lib/earnings';
import type { EarningsCalendarEntry } from '@/types/earnings';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';
import type { PortfolioPosition } from '@/types/portfolio';
import {
  DailyReportDocument,
  type DailyReportDocumentData,
  type StockReportDocumentData,
  StockReportDocument,
} from '@/lib/reportGeneratorDocument';

export type ReportSection = 'market' | 'picks' | 'portfolio' | 'earnings' | 'quality';

const ALL_SECTIONS: ReportSection[] = ['market', 'picks', 'portfolio', 'earnings', 'quality'];

const DEFAULT_QUERY: ScoreQuery = {
  sort: 'total',
  filters: {
    deepAnalysis: false,
    confidenceLow: false,
    missingData: false,
    upsideNegative: false,
    expectedReturnNegative: false,
    symbol: undefined,
  },
};

type MacroTickerLike = {
  ticker: string;
  name: string;
  price_current: number | null;
  change_1d: number | null;
  change_1w: number | null;
  change_1m: number | null;
  change_3m: number | null;
  change_ytd: number | null;
  sparkline_30d: number[];
};

interface MacroFileShape {
  fetched_at?: string;
  tickers?: Record<string, MacroTickerLike>;
}

function formatDateDe(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatDateTimeDe(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatIsoDateToDe(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return formatDateTimeDe(date);
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function pctFromRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return pct(value * 100);
}

function money(value: number | null | undefined, currency: string = 'USD'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function compactMoney(value: number | null | undefined, currency: string = 'USD'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return money(value, currency);
  }
}

function shortNum(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

function valueFromMetrics(
  metrics: RunV1SchemaJson['scores'][number]['data_quality']['metrics'] | undefined,
  keys: string[]
): number | null {
  if (!metrics) return null;
  for (const key of keys) {
    const value = metrics[key]?.value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function strategyLabelFromRun(run: RunV1SchemaJson): string {
  const asAny = run as unknown as Record<string, unknown>;
  const raw =
    typeof asAny.preset === 'string'
      ? asAny.preset
      : typeof asAny.strategy === 'string'
        ? asAny.strategy
        : typeof process.env.PRESET === 'string'
          ? process.env.PRESET
          : null;

  if (!raw) return 'Default';
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function regimeLabelDe(label: RegimeLabel): string {
  if (label === 'RISK_ON') return 'RISK_ON';
  if (label === 'RISK_OFF') return 'RISK_OFF';
  if (label === 'CRISIS') return 'CRISIS';
  return 'NEUTRAL';
}

function shiftDays(dateIso: string, delta: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateIso;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function computeRegimeStreakDays(asOfDate: string, label: RegimeLabel, maxLookbackDays = 90): number | null {
  if (!asOfDate) return null;
  try {
    let streak = 0;
    for (let offset = 0; offset < maxLookbackDays; offset += 1) {
      const day = shiftDays(asOfDate, -offset);
      const regime = detectRegime(day);
      if (regime.label !== label) break;
      streak += 1;
    }
    return streak > 0 ? streak : null;
  } catch {
    return null;
  }
}

function loadMacroFile(): MacroFileShape | null {
  const filePath = path.join(process.cwd(), 'data', 'macro', 'commodities.json');
  if (!existsSync(filePath)) return null;

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as MacroFileShape;
  } catch {
    return null;
  }
}

function calcPctFromSeries(values: number[], lookback: number): number | null {
  if (values.length <= lookback) return null;
  const last = values[values.length - 1];
  const base = values[values.length - 1 - lookback];
  if (!Number.isFinite(last) || !Number.isFinite(base) || base === 0) return null;
  return ((last - base) / base) * 100;
}

function marketInterpretation(tickers: MacroTickerLike[]): string {
  const gold = tickers.find((t) => t.ticker === 'GC=F');
  const dxy = tickers.find((t) => t.ticker === 'DX-Y.NYB');
  const oil = tickers.find((t) => t.ticker === 'CL=F');
  const treasury10y = tickers.find((t) => t.ticker === '^TNX');
  const treasury30y = tickers.find((t) => t.ticker === '^TYX');

  const lines: string[] = [];

  if (gold?.change_1m !== null && gold?.change_1m !== undefined && gold.change_1m > 0.03) {
    if (dxy?.change_1m !== null && dxy?.change_1m !== undefined && dxy.change_1m < -0.01) {
      lines.push('Gold steigt bei schwachem Dollar, ein typisches Risk-Off-Muster.');
    } else {
      lines.push('Gold zeigt Stärke und signalisiert potenzielle Inflations- oder Risikoängste.');
    }
  }

  if (oil?.change_1m !== null && oil?.change_1m !== undefined && oil.change_1m > 0.05) {
    lines.push('Steigende Ölpreise können Inflation treiben und Growth-Bewertungen belasten.');
  }

  if (treasury10y?.change_3m !== null && treasury10y?.change_3m !== undefined && treasury10y.change_3m > 0.01) {
    const spreadNormal =
      treasury30y?.price_current !== null &&
      treasury30y?.price_current !== undefined &&
      treasury10y.price_current !== null &&
      treasury10y.price_current !== undefined
        ? treasury30y.price_current > treasury10y.price_current
        : true;
    if (spreadNormal) {
      lines.push('Steigende Zinsen bei normaler Kurve sprechen eher für ein intaktes Wachstumsszenario.');
    }
  }

  if (dxy?.change_1m !== null && dxy?.change_1m !== undefined && dxy.change_1m > 0.02) {
    lines.push('Ein starker US-Dollar erhöht Gegenwind für Exporteure und Schwellenländer.');
  }

  if (lines.length === 0) {
    lines.push('Gemischte Makro-Signale, eine ausgewogene Allokation bleibt sinnvoll.');
  }

  return lines.slice(0, 2).join(' ');
}

function scoreCellTone(value: number | null): 'good' | 'mid' | 'bad' | 'none' {
  if (value === null || Number.isNaN(value)) return 'none';
  if (value > 60) return 'good';
  if (value < 40) return 'bad';
  return 'mid';
}

function getPositionValueUsd(position: PortfolioPosition): number {
  if (
    position.current_value_usd !== null &&
    position.current_value_usd !== undefined &&
    Number.isFinite(position.current_value_usd) &&
    position.current_value_usd > 0
  ) {
    return position.current_value_usd;
  }
  if (position.quantity > 0 && position.buy_price > 0) {
    return position.quantity * position.buy_price;
  }
  return 0;
}

function sectorName(position: PortfolioPosition): string {
  if (position.asset_type === 'commodity') return 'Edelmetalle';
  if (position.sector && position.sector.trim()) return position.sector.trim();
  if (position.industry && position.industry.trim()) return position.industry.split(' - ')[0];
  return 'Unbekannt';
}

function buildPortfolioDiversificationSummary(positions: PortfolioPosition[]): {
  diversificationScore: number | null;
  topSectors: Array<{ name: string; pct: number }>;
} {
  const sectorMap = new Map<string, number>();
  let total = 0;

  for (const position of positions) {
    const value = getPositionValueUsd(position);
    if (value <= 0) continue;
    total += value;
    const sector = sectorName(position);
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + value);
  }

  if (total <= 0 || sectorMap.size === 0) {
    return { diversificationScore: null, topSectors: [] };
  }

  const rows = Array.from(sectorMap.entries())
    .map(([name, value]) => ({ name, pct: value / total }))
    .sort((a, b) => b.pct - a.pct);
  const hhi = rows.reduce((sum, row) => sum + row.pct * row.pct, 0);
  const diversificationScore = Math.round(Math.max(0, Math.min(100, (1 - hhi) * 100)));

  return {
    diversificationScore,
    topSectors: rows.slice(0, 3),
  };
}

function buildTopPickInsight(
  row: Pick<RunV1SchemaJson['scores'][number], 'symbol' | 'evidence'>
): string {
  const entries = [
    { key: 'Valuation', value: row.evidence.valuation },
    { key: 'Quality', value: row.evidence.quality },
    { key: 'Technical', value: row.evidence.technical },
    { key: 'Risk', value: row.evidence.risk },
  ];
  const strongest = [...entries].sort((a, b) => b.value - a.value)[0];
  const weakest = [...entries].sort((a, b) => a.value - b.value)[0];
  return `${row.symbol}: Strong ${strongest.key} (${strongest.value.toFixed(0)}), schwache ${weakest.key} (${weakest.value.toFixed(0)})`;
}

function parseSections(sections?: ReportSection[]): Record<ReportSection, boolean> {
  const selected = sections && sections.length > 0 ? new Set(sections) : new Set(ALL_SECTIONS);
  return {
    market: selected.has('market'),
    picks: selected.has('picks'),
    portfolio: selected.has('portfolio'),
    earnings: selected.has('earnings'),
    quality: selected.has('quality'),
  };
}

function parseIndexRows(
  indices: Awaited<ReturnType<typeof getMarketContext>>['indices']
): DailyReportDocumentData['marketRows'] {
  return indices.map((index) => {
    const values = index.data.map((point) => point.value).filter((value) => Number.isFinite(value));
    const oneDay = index.changePercent;
    const oneWeek = calcPctFromSeries(values, 5);
    const oneMonth = calcPctFromSeries(values, 21);
    const ytdApprox = values.length >= 2 ? ((values[values.length - 1] - values[0]) / values[0]) * 100 : null;

    return {
      name: index.name,
      value: index.value !== null ? shortNum(index.value, index.symbol === '^VIX' ? 2 : 1) : '—',
      d1: pct(oneDay),
      w1: pct(oneWeek),
      m1: pct(oneMonth),
      ytd: pct(ytdApprox),
    };
  });
}

function getMacroTicker(tickers: Record<string, MacroTickerLike> | undefined, symbol: string): MacroTickerLike | null {
  if (!tickers) return null;
  return tickers[symbol] ?? null;
}

function safeUpperSymbol(symbol: string): string {
  return symbol.toUpperCase().trim();
}

function extractFilenameDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mapEarningsRows(
  entries: EarningsCalendarEntry[],
  scoreMap: Map<string, number>,
  portfolioSet: Set<string>
): DailyReportDocumentData['earningsRows'] {
  return entries.map((entry) => {
    const totalScore = scoreMap.get(entry.symbol) ?? null;
    return {
      date: entry.earnings_date,
      symbol: entry.symbol,
      name: entry.name || getCompanyName(entry.symbol) || entry.symbol,
      score: totalScore,
      scoreLabel: totalScore === null ? '—' : totalScore.toFixed(1),
      scoreTone: scoreCellTone(totalScore),
      epsEstimate: entry.eps_estimate === null ? '—' : entry.eps_estimate.toFixed(2),
      isPortfolioHolding: portfolioSet.has(entry.symbol),
    };
  });
}

function buildStockPeers(run: RunV1SchemaJson, symbol: string): StockReportDocumentData['peers'] {
  const current = run.scores.find((item) => item.symbol === symbol);
  if (!current) return [];

  const currentIndustry = current.industry ?? null;
  const currentSector = current.price_target_diagnostics?.inputs?.sector ?? null;

  const peerPool = run.scores.filter((item) => item.symbol !== symbol);
  const filtered = peerPool.filter((item) => {
    if (currentIndustry && item.industry === currentIndustry) return true;
    const sector = item.price_target_diagnostics?.inputs?.sector ?? null;
    return Boolean(currentSector && sector === currentSector);
  });

  const bestPool = filtered.length > 0 ? filtered : peerPool;
  return bestPool
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 6)
    .map((item) => ({
      symbol: item.symbol,
      name: item.company_name || getCompanyName(item.symbol) || item.symbol,
      score: item.total_score,
      scoreLabel: item.total_score.toFixed(1),
      industry: item.industry ?? '—',
    }));
}

function buildStockReportData(symbolInput: string): StockReportDocumentData {
  const symbol = safeUpperSymbol(symbolInput);
  const latest = getLatestRun();
  const now = new Date();
  const generatedAt = formatDateTimeDe(now);
  const dateLabel = formatDateDe(now);
  const filenameDate = extractFilenameDate(now);

  if (!latest) {
    return {
      symbol,
      companyName: getCompanyName(symbol) || symbol,
      generatedAt,
      reportDateLong: dateLabel,
      asOfDate: '—',
      totalScoreLabel: '—',
      breakdown: [],
      keyMetrics: [],
      priceTarget: [],
      peers: [],
      filenameDate,
      missingReason: 'Kein Run vorhanden. Bitte zuerst einen Daily Run ausführen.',
    };
  }

  const run = latest.run;
  const score = run.scores.find((item) => item.symbol === symbol);

  if (!score) {
    return {
      symbol,
      companyName: getCompanyName(symbol) || symbol,
      generatedAt,
      reportDateLong: dateLabel,
      asOfDate: run.as_of_date,
      totalScoreLabel: '—',
      breakdown: [],
      keyMetrics: [],
      priceTarget: [],
      peers: [],
      filenameDate,
      missingReason: `${symbol} ist im neuesten Run (${run.as_of_date}) nicht enthalten.`,
    };
  }

  const metrics = score.data_quality?.metrics;
  const marketCap = valueFromMetrics(metrics, ['marketCap', 'market_cap']);
  const peRatio = valueFromMetrics(metrics, ['peRatio', 'pe_ratio']);
  const dividendYield = valueFromMetrics(metrics, ['dividendYield', 'dividend_yield']);
  const beta = valueFromMetrics(metrics, ['beta']);
  const low52 = valueFromMetrics(metrics, ['low52Week', 'fiftyTwoWeekLow', 'week52Low']);
  const high52 = valueFromMetrics(metrics, ['high52Week', 'fiftyTwoWeekHigh', 'week52High']);

  const rawDividendYield = dividendYield;
  const dividendYieldPct =
    rawDividendYield === null
      ? null
      : Math.abs(rawDividendYield) <= 1
        ? rawDividendYield * 100
        : rawDividendYield;

  const breakdown: StockReportDocumentData['breakdown'] = [
    { label: 'Valuation', score: score.evidence.valuation, scoreLabel: score.evidence.valuation.toFixed(1), tone: scoreCellTone(score.evidence.valuation) },
    { label: 'Quality', score: score.evidence.quality, scoreLabel: score.evidence.quality.toFixed(1), tone: scoreCellTone(score.evidence.quality) },
    { label: 'Technical', score: score.evidence.technical, scoreLabel: score.evidence.technical.toFixed(1), tone: scoreCellTone(score.evidence.technical) },
    { label: 'Risk', score: score.evidence.risk, scoreLabel: score.evidence.risk.toFixed(1), tone: scoreCellTone(score.evidence.risk) },
  ];

  const keyMetrics: StockReportDocumentData['keyMetrics'] = [
    { label: 'Market Cap', value: compactMoney(marketCap) },
    { label: 'P/E', value: peRatio === null ? '—' : peRatio.toFixed(2) },
    { label: 'Dividend Yield', value: dividendYieldPct === null ? '—' : `${dividendYieldPct.toFixed(2)}%` },
    { label: 'Beta', value: beta === null ? '—' : beta.toFixed(2) },
    {
      label: '52W Range',
      value:
        low52 !== null && high52 !== null
          ? `${money(low52)} - ${money(high52)}`
          : '—',
    },
  ];

  const target = score.price_target;
  const priceTarget: StockReportDocumentData['priceTarget'] = target
    ? [
        { label: 'Current Price', value: target.current_price !== undefined ? money(target.current_price) : '—' },
        { label: 'Fair Value', value: target.fair_value !== undefined ? money(target.fair_value) : '—' },
        { label: 'Upside', value: target.upside_pct !== undefined ? pctFromRatio(target.upside_pct) : '—' },
        { label: 'Target Buy', value: target.target_buy_price !== undefined ? money(target.target_buy_price) : '—' },
        { label: 'Target Sell', value: target.target_sell_price !== undefined ? money(target.target_sell_price) : '—' },
        { label: 'Expected Return', value: target.expected_return_pct !== undefined ? pctFromRatio(target.expected_return_pct) : '—' },
        { label: 'Confidence', value: target.confidence ?? '—' },
      ]
    : [{ label: 'Price Target', value: 'Nicht verfügbar (Scan-only oder fehlende Inputs).' }];

  return {
    symbol,
    companyName: score.company_name || getCompanyName(symbol) || symbol,
    generatedAt,
    reportDateLong: dateLabel,
    asOfDate: run.as_of_date,
    totalScoreLabel: score.total_score.toFixed(1),
    breakdown,
    keyMetrics,
    priceTarget,
    peers: buildStockPeers(run, symbol),
    filenameDate,
  };
}

async function buildDailyReportData(
  userId: string,
  sections?: ReportSection[]
): Promise<DailyReportDocumentData> {
  const now = new Date();
  const generatedAt = formatDateTimeDe(now);
  const reportDateLong = formatDateDe(now);
  const filenameDate = extractFilenameDate(now);
  const enabledSections = parseSections(sections);

  const [latest, previous] = getRecentRuns(2);
  const run = latest?.run ?? null;

  if (!run) {
    return {
      generatedAt,
      reportDateLong,
      filenameDate,
      universeLabel: '—',
      strategyLabel: '—',
      regimeStatusLine: '● UNAVAILABLE',
      executiveSummary: ['Kein Run vorhanden. Bitte zuerst einen Daily Run ausführen.'],
      marketRows: [],
      macroRows: [],
      yieldSpreadValue: '—',
      yieldSpreadHint: 'Keine Daten verfügbar.',
      macroInterpretation: 'Keine Makro-Daten verfügbar.',
      topPickRows: [],
      topPickInsights: [],
      portfolio: null,
      earningsRows: [],
      hasPortfolioEarningsIn7d: false,
      dataQuality: {
        coverageLabel: 'Coverage: —',
        providerLabel: 'Provider: —',
        updatedLabel: `Letzte Aktualisierung: ${generatedAt}`,
      },
      sections: enabledSections,
    };
  }

  const runWithNames: RunV1SchemaJson = {
    ...run,
    scores: run.scores.map((item) => ({
      ...item,
      company_name: item.company_name ?? getCompanyName(item.symbol),
    })),
  };

  const sorted = buildScoreView(runWithNames, DEFAULT_QUERY);
  const top20 = sorted.slice(0, 20);
  const deltaMap = computeDeltas(runWithNames, previous?.run);
  const topPickRows: DailyReportDocumentData['topPickRows'] = top20.map((item, index) => {
    const delta = deltaMap.get(item.symbol);
    const deltaValue = delta?.deltaTotal ?? null;
    return {
      rank: index + 1,
      symbol: item.symbol,
      name: item.company_name || item.symbol,
      total: item.total_score,
      totalLabel: item.total_score.toFixed(1),
      valuation: item.evidence.valuation,
      quality: item.evidence.quality,
      technical: item.evidence.technical,
      risk: item.evidence.risk,
      deltaLabel:
        deltaValue === null || !Number.isFinite(deltaValue)
          ? '—'
          : `${deltaValue >= 0 ? '+' : ''}${deltaValue.toFixed(1)}`,
      totalTone: scoreCellTone(item.total_score),
    };
  });

  const topPickInsights = top20.slice(0, 5).map((item) => buildTopPickInsight(item));

  let marketRows: DailyReportDocumentData['marketRows'] = [
    { name: 'S&P 500', value: '—', d1: '—', w1: '—', m1: '—', ytd: '—' },
    { name: 'Russell 2000', value: '—', d1: '—', w1: '—', m1: '—', ytd: '—' },
    { name: 'NASDAQ', value: '—', d1: '—', w1: '—', m1: '—', ytd: '—' },
    { name: 'VIX (Fear)', value: '—', d1: '—', w1: '—', m1: '—', ytd: '—' },
  ];

  try {
    const market = await getMarketContext();
    marketRows = parseIndexRows(market.indices);
  } catch {
    // Keep placeholders
  }

  const macroFile = loadMacroFile();
  const macroTickers = macroFile?.tickers ?? {};
  const macroRows: DailyReportDocumentData['macroRows'] = [
    { name: 'Gold', value: shortNum(getMacroTicker(macroTickers, 'GC=F')?.price_current ?? null, 2), d1: pctFromRatio(getMacroTicker(macroTickers, 'GC=F')?.change_1d ?? null), w1: pctFromRatio(getMacroTicker(macroTickers, 'GC=F')?.change_1w ?? null), m1: pctFromRatio(getMacroTicker(macroTickers, 'GC=F')?.change_1m ?? null) },
    { name: 'WTI Oil', value: shortNum(getMacroTicker(macroTickers, 'CL=F')?.price_current ?? null, 2), d1: pctFromRatio(getMacroTicker(macroTickers, 'CL=F')?.change_1d ?? null), w1: pctFromRatio(getMacroTicker(macroTickers, 'CL=F')?.change_1w ?? null), m1: pctFromRatio(getMacroTicker(macroTickers, 'CL=F')?.change_1m ?? null) },
    { name: '10Y Yield', value: getMacroTicker(macroTickers, '^TNX')?.price_current !== null && getMacroTicker(macroTickers, '^TNX')?.price_current !== undefined ? `${shortNum(getMacroTicker(macroTickers, '^TNX')?.price_current ?? null, 2)}%` : '—', d1: pctFromRatio(getMacroTicker(macroTickers, '^TNX')?.change_1d ?? null), w1: pctFromRatio(getMacroTicker(macroTickers, '^TNX')?.change_1w ?? null), m1: pctFromRatio(getMacroTicker(macroTickers, '^TNX')?.change_1m ?? null) },
    { name: 'DXY', value: shortNum(getMacroTicker(macroTickers, 'DX-Y.NYB')?.price_current ?? null, 2), d1: pctFromRatio(getMacroTicker(macroTickers, 'DX-Y.NYB')?.change_1d ?? null), w1: pctFromRatio(getMacroTicker(macroTickers, 'DX-Y.NYB')?.change_1w ?? null), m1: pctFromRatio(getMacroTicker(macroTickers, 'DX-Y.NYB')?.change_1m ?? null) },
  ];

  const t10 = getMacroTicker(macroTickers, '^TNX')?.price_current ?? null;
  const t30 = getMacroTicker(macroTickers, '^TYX')?.price_current ?? null;
  const spread = t10 !== null && t30 !== null ? t30 - t10 : null;
  const yieldSpreadValue = spread === null ? '—' : `${spread >= 0 ? '+' : ''}${spread.toFixed(2)}%`;
  const yieldSpreadHint =
    spread === null
      ? 'Yield-Spread-Daten nicht verfügbar.'
      : spread < 0
        ? 'Invertierte Zinskurve: erhöhte Rezessionswahrscheinlichkeit.'
        : 'Normale Zinskurve: lange Laufzeiten rentieren höher als kurze.';

  const macroInterpretation = marketInterpretation(Object.values(macroTickers));

  let portfolioSection: DailyReportDocumentData['portfolio'] = null;
  let portfolioSymbols = new Set<string>();
  try {
    getDatabase();
    const positions = enrichPositions(getPositions(userId));
    portfolioSymbols = new Set(positions.map((item) => item.symbol.toUpperCase()));

    if (positions.length > 0) {
      const summaryRaw = calculatePortfolioSummary(positions);
      const portfolioScore = getPortfolioScore(
        summaryRaw.weighted_score_sum,
        summaryRaw.scored_equity_value
      );

      const { diversificationScore, topSectors } = buildPortfolioDiversificationSummary(positions);
      const total = summaryRaw.total_value_usd;
      const totalCost = summaryRaw.total_cost_usd;
      const gainLossPct = totalCost > 0 ? (total - totalCost) / totalCost : 0;
      const equityShare = total > 0 ? ((summaryRaw.equity_value_usd + summaryRaw.etf_value_usd) / total) * 100 : 0;
      const commodityShare = total > 0 ? (summaryRaw.commodity_value_usd / total) * 100 : 0;

      portfolioSection = {
        rows: positions.map((item) => ({
          symbol: item.symbol,
          type: item.asset_type,
          quantity: `${item.quantity.toFixed(item.quantity % 1 === 0 ? 0 : 2)} ${item.quantity_unit}`,
          buyPrice: money(item.buy_price, item.currency),
          current: item.current_price === null || item.current_price === undefined ? '—' : money(item.current_price, item.currency),
          value: item.current_value_usd === null || item.current_value_usd === undefined ? '—' : money(item.current_value_usd, 'USD'),
          gainLossPct: item.gain_loss_pct === null || item.gain_loss_pct === undefined ? '—' : pctFromRatio(item.gain_loss_pct),
          score: item.total_score === null || item.total_score === undefined ? '—' : item.total_score.toFixed(1),
          scoreTone: scoreCellTone(item.total_score ?? null),
        })),
        summary: {
          totalValue: money(total, 'USD'),
          gainLossPct: pctFromRatio(gainLossPct),
          portfolioScore: portfolioScore === null ? '—' : portfolioScore.toFixed(0),
          split: `Equity/ETF ${equityShare.toFixed(0)}% · Commodity ${commodityShare.toFixed(0)}%`,
        },
        diversification: {
          score: diversificationScore === null ? '—' : diversificationScore.toString(),
          sectors: topSectors.map((item) => `${item.name} (${(item.pct * 100).toFixed(1)}%)`),
        },
      };
    }
  } catch {
    portfolioSection = null;
  }

  const scoreLookup = new Map<string, number>();
  for (const item of runWithNames.scores) {
    scoreLookup.set(item.symbol, item.total_score);
  }

  const earningsLoaded = loadEarningsCalendar();
  const earningsRows = earningsLoaded
    ? mapEarningsRows(
        earningsLoaded.upcoming.filter((item) => item.days_until >= 0 && item.days_until <= 14).slice(0, 40),
        scoreLookup,
        portfolioSymbols
      )
    : [];

  const hasPortfolioEarningsIn7d = earningsRows.some(
    (item) => item.isPortfolioHolding && (() => {
      const diff = Math.floor((new Date(`${item.date}T00:00:00Z`).getTime() - new Date(`${run.as_of_date}T00:00:00Z`).getTime()) / (24 * 60 * 60 * 1000));
      return diff >= 0 && diff <= 7;
    })()
  );

  const regime = detectRegime(run.as_of_date);
  const regimeStreak = computeRegimeStreakDays(run.as_of_date, regime.label);

  const topPick = top20[0] ?? null;
  const scoreableCount =
    run.pipeline?.scored_symbol_count ?? run.scores.length;
  const originalCount =
    run.pipeline?.original_symbol_count ?? run.scores.length;
  const coverage = originalCount > 0 ? (scoreableCount / originalCount) * 100 : null;

  const executiveSummary: string[] = [
    `Der Markt befindet sich im ${regimeLabelDe(regime.label)}-Regime${regimeStreak ? ` seit ${regimeStreak} Tagen` : ''}.`,
    topPick
      ? `Top-Pick: ${topPick.symbol} (${topPick.total_score.toFixed(1)}) — stärkster Score im aktuellen Run.`
      : 'Kein Top-Pick verfügbar.',
    portfolioSection
      ? `Dein Portfolio-Score: ${portfolioSection.summary.portfolioScore} (basierend auf ${portfolioSection.rows.filter((item) => item.type === 'equity' || item.type === 'etf').length} Equity/ETF-Positionen).`
      : 'Kein Portfolio konfiguriert.',
    hasPortfolioEarningsIn7d
      ? 'Es gibt Earnings von Portfolio-Holdings in den nächsten 7 Tagen.'
      : 'Keine Earnings deiner Holdings in den nächsten 7 Tagen.',
  ];

  return {
    generatedAt,
    reportDateLong,
    filenameDate,
    universeLabel: `${run.universe.definition.name} · ${originalCount} Aktien`,
    strategyLabel: strategyLabelFromRun(run),
    regimeStatusLine: `● ${regimeLabelDe(regime.label)} · Composite: ${regime.composite_score.toFixed(2)}`,
    executiveSummary,
    marketRows,
    macroRows,
    yieldSpreadValue,
    yieldSpreadHint,
    macroInterpretation,
    topPickRows,
    topPickInsights,
    portfolio: portfolioSection,
    earningsRows,
    hasPortfolioEarningsIn7d,
    dataQuality: {
      coverageLabel: `Coverage: ${coverage === null ? '—' : `${coverage.toFixed(1)}%`}`,
      providerLabel: `Provider: ${run.provider.name}`,
      updatedLabel: `Letzte Aktualisierung: ${formatIsoDateToDe(run.run_date ?? run.as_of_date)}`,
    },
    sections: enabledSections,
  };
}

export function parseReportSections(raw: string | null): ReportSection[] | undefined {
  if (!raw) return undefined;
  const selected = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item): item is ReportSection => ALL_SECTIONS.includes(item as ReportSection));

  if (selected.length === 0) return undefined;
  return Array.from(new Set(selected));
}

export async function generateDailyReport(
  userId: string,
  options?: { sections?: ReportSection[] }
): Promise<Buffer> {
  const data = await buildDailyReportData(userId, options?.sections);
  const element = React.createElement(DailyReportDocument, { data }) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

export async function generateStockReport(symbol: string): Promise<Buffer> {
  const data = buildStockReportData(symbol);
  const element = React.createElement(StockReportDocument, { data }) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}
