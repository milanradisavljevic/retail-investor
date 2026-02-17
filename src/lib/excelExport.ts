import ExcelJS from 'exceljs';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getLatestRun, getRunById } from './runLoader';
import { getPositions } from '@/data/portfolio';
import { enrichPositions, calculatePortfolioSummary, getPortfolioScore } from '@/data/portfolioEnrichment';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';
import type { MacroTickerData, MacroCategory, CATEGORY_LABELS } from '@/types/macro';
import type { PortfolioPosition } from '@/types/portfolio';

interface RawScore {
  symbol: string;
  company_name?: string;
  industry?: string;
  total_score: number;
  evidence?: {
    valuation: number;
    quality: number;
    technical: number;
    risk: number;
  };
  price_target?: {
    current_price?: number | null;
    fair_value?: number | null;
    upside_pct?: number | null;
    target_buy_price?: number | null;
    target_sell_price?: number | null;
    confidence?: string | null;
  } | null;
  data_quality?: {
    data_quality_score?: number;
  };
}

interface MacroDataFile {
  fetched_at: string;
  tickers: Record<string, {
    name: string;
    category: MacroCategory;
    price_current: number | null;
    change_1d?: number | null;
    change_1w?: number | null;
    change_1m?: number | null;
    change_ytd?: number | null;
  }>;
}

const CATEGORY_LABELS_DE: Record<MacroCategory, string> = {
  precious_metals: 'Edelmetalle',
  base_metals: 'Industriemetalle',
  energy: 'Energie',
  agriculture: 'Agrar',
  rates: 'Zinsen',
  currency: 'Waehrungen',
};

const HEADER_BG = '1A1F36';
const HEADER_FONT = 'FFFFFF';
const GREEN_BG = 'C6EFCE';
const GREEN_FONT = '006100';
const YELLOW_BG = 'FFEB9C';
const YELLOW_FONT = '9C6500';
const RED_BG = 'FFC7CE';
const RED_FONT = '9C0006';

function loadMacroData(): MacroDataFile | null {
  const macroPath = join(process.cwd(), 'data', 'macro', 'commodities.json');
  if (!existsSync(macroPath)) return null;
  try {
    const content = readFileSync(macroPath, 'utf-8');
    return JSON.parse(content) as MacroDataFile;
  } catch {
    return null;
  }
}

function applyScoreConditionalFormatting(cell: ExcelJS.Cell, score: number | null | undefined) {
  if (score === null || score === undefined) return;
  
  if (score >= 60) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_BG } };
    cell.font = { color: { argb: GREEN_FONT } };
  } else if (score >= 40) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW_BG } };
    cell.font = { color: { argb: YELLOW_FONT } };
  } else {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_BG } };
    cell.font = { color: { argb: RED_FONT } };
  }
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 20;
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
}

function setColumnWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => {
    sheet.columns[index].width = width;
  });
}

function addAutoFilter(sheet: ExcelJS.Worksheet, endColumn: string) {
  sheet.autoFilter = `A1:${endColumn}1`;
}

function freezeHeader(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function generateRunExport(runId?: string): Promise<Buffer> {
  const loadedRun = runId ? getRunById(runId) : getLatestRun();
  
  if (!loadedRun) {
    throw new Error('No run data available');
  }
  
  const run = loadedRun.run;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'INTRINSIC';
  workbook.created = new Date();
  
  // Sheet 1: Scores
  const scoresSheet = workbook.addWorksheet('Scores');
  
  const headers = [
    'Rang', 'Symbol', 'Name', 'Sektor', 'Total Score',
    'Valuation', 'Quality', 'Technical', 'Risk',
    'Aktueller Preis', 'Fair Value', 'Upside %',
    'Kaufziel', 'Verkaufsziel', 'Confidence', 'Data Quality'
  ];
  
  scoresSheet.addRow(headers);
  styleHeaderRow(scoresSheet.getRow(1));
  
  const scores = (run.scores as RawScore[]).slice().sort((a, b) => b.total_score - a.total_score);
  
  scores.forEach((score, index) => {
    const row = scoresSheet.addRow([
      index + 1,
      score.symbol,
      score.company_name || score.symbol,
      score.industry || '-',
      score.total_score,
      score.evidence?.valuation ?? '-',
      score.evidence?.quality ?? '-',
      score.evidence?.technical ?? '-',
      score.evidence?.risk ?? '-',
      score.price_target?.current_price ?? '-',
      score.price_target?.fair_value ?? '-',
      score.price_target?.upside_pct != null 
        ? (score.price_target.upside_pct * 100).toFixed(1) + '%' 
        : '-',
      score.price_target?.target_buy_price ?? '-',
      score.price_target?.target_sell_price ?? '-',
      score.price_target?.confidence ?? '-',
      score.data_quality?.data_quality_score ?? '-'
    ]);
    
    row.getCell(5).numFmt = '0.0';
    row.getCell(6).numFmt = '0.0';
    row.getCell(7).numFmt = '0.0';
    row.getCell(8).numFmt = '0.0';
    row.getCell(9).numFmt = '0.0';
    row.getCell(10).numFmt = '#,##0.00';
    row.getCell(11).numFmt = '#,##0.00';
    row.getCell(14).numFmt = '#,##0.00';
    row.getCell(15).numFmt = '#,##0.00';
    
    applyScoreConditionalFormatting(row.getCell(5), score.total_score);
    applyScoreConditionalFormatting(row.getCell(6), score.evidence?.valuation);
    applyScoreConditionalFormatting(row.getCell(7), score.evidence?.quality);
    applyScoreConditionalFormatting(row.getCell(8), score.evidence?.technical);
    applyScoreConditionalFormatting(row.getCell(9), score.evidence?.risk);
    
    row.alignment = { horizontal: 'left' };
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'right' };
    row.getCell(6).alignment = { horizontal: 'right' };
    row.getCell(7).alignment = { horizontal: 'right' };
    row.getCell(8).alignment = { horizontal: 'right' };
    row.getCell(9).alignment = { horizontal: 'right' };
    row.getCell(10).alignment = { horizontal: 'right' };
    row.getCell(11).alignment = { horizontal: 'right' };
    row.getCell(12).alignment = { horizontal: 'right' };
    row.getCell(14).alignment = { horizontal: 'right' };
    row.getCell(15).alignment = { horizontal: 'right' };
    row.getCell(16).alignment = { horizontal: 'center' };
  });
  
  setColumnWidths(scoresSheet, [6, 10, 30, 25, 12, 12, 12, 12, 12, 14, 14, 12, 14, 14, 12, 14]);
  addAutoFilter(scoresSheet, 'P');
  freezeHeader(scoresSheet);
  
  // Sheet 2: Meta
  const metaSheet = workbook.addWorksheet('Meta');
  
  const metaRows = [
    ['Feld', 'Wert'],
    ['Run ID', run.run_id],
    ['Universum', run.universe?.definition?.name || '-'],
    ['Strategie/Preset', process.env.SCORING_PRESET || process.env.PRESET || 'Compounder'],
    ['Datum', run.run_date || '-'],
    ['As of Date', run.as_of_date || '-'],
    ['Symbole gesamt', run.universe?.symbols?.length || run.scores?.length || 0],
    ['Symbole gescort', run.scores?.length || 0],
    ['Provider', run.provider?.name || 'yfinance'],
    ['Regime', run.mode ? `${run.mode.label} (${run.mode.score})` : '-'],
    ['Benchmark', run.mode?.benchmark || run.benchmark || '-'],
  ];
  
  metaRows.forEach((rowData) => {
    metaSheet.addRow(rowData);
  });
  
  styleHeaderRow(metaSheet.getRow(1));
  setColumnWidths(metaSheet, [25, 50]);
  
  metaSheet.getRow(1).getCell(1).alignment = { horizontal: 'left' };
  metaSheet.getRow(1).getCell(2).alignment = { horizontal: 'left' };
  
  // Sheet 3: Macro
  const macroSheet = workbook.addWorksheet('Macro');
  
  const macroHeaders = ['Ticker', 'Name', 'Kategorie', 'Preis', '1D', '1W', '1M', 'YTD'];
  macroSheet.addRow(macroHeaders);
  styleHeaderRow(macroSheet.getRow(1));
  
  const macroData = loadMacroData();
  if (macroData) {
    for (const [ticker, data] of Object.entries(macroData.tickers)) {
      macroSheet.addRow([
        ticker,
        data.name,
        CATEGORY_LABELS_DE[data.category] || data.category,
        data.price_current ?? '-',
        data.change_1d != null ? (data.change_1d * 100).toFixed(2) + '%' : '-',
        data.change_1w != null ? (data.change_1w * 100).toFixed(2) + '%' : '-',
        data.change_1m != null ? (data.change_1m * 100).toFixed(2) + '%' : '-',
        data.change_ytd != null ? (data.change_ytd * 100).toFixed(2) + '%' : '-',
      ]);
    }
  }
  
  setColumnWidths(macroSheet, [12, 20, 18, 12, 10, 10, 10, 10]);
  addAutoFilter(macroSheet, 'H');
  freezeHeader(macroSheet);
  
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

interface EnrichedPosition extends PortfolioPosition {
  display_name?: string;
  current_value_usd?: number | null;
  gain_loss_pct?: number | null;
  total_score?: number | null;
}

export async function generatePortfolioExport(): Promise<Buffer> {
  const positions = getPositions();
  const enrichedPositions = enrichPositions(positions) as EnrichedPosition[];
  const summary = calculatePortfolioSummary(enrichedPositions);
  const portfolioScore = getPortfolioScore(summary.weighted_score_sum, summary.scored_equity_value);
  
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'INTRINSIC';
  workbook.created = new Date();
  
  // Sheet 1: Holdings
  const holdingsSheet = workbook.addWorksheet('Holdings');
  
  const holdingHeaders = [
    'Symbol', 'Name', 'Typ', 'Menge', 'Einheit',
    'Kaufpreis', 'Kaufdatum', 'Waehrung',
    'Aktueller Preis', 'Wert (USD)', 'G/V %', 'Score',
    'Broker', 'Notizen'
  ];
  
  holdingsSheet.addRow(holdingHeaders);
  styleHeaderRow(holdingsSheet.getRow(1));
  
  const sortedPositions = enrichedPositions.slice().sort((a, b) => {
    const aValue = a.current_value_usd ?? 0;
    const bValue = b.current_value_usd ?? 0;
    return bValue - aValue;
  });
  
  let totalValue = 0;
  let totalCost = 0;
  
  sortedPositions.forEach((pos) => {
    const cost = pos.buy_price * pos.quantity;
    const value = pos.current_value_usd ?? cost;
    totalValue += value;
    totalCost += cost;
    
    const row = holdingsSheet.addRow([
      pos.symbol,
      pos.display_name || pos.symbol,
      pos.asset_type,
      pos.quantity,
      pos.quantity_unit,
      pos.buy_price,
      pos.buy_date,
      pos.currency,
      pos.current_price ?? '-',
      pos.current_value_usd ?? '-',
      pos.gain_loss_pct != null ? (pos.gain_loss_pct * 100).toFixed(2) + '%' : '-',
      pos.total_score ?? '-',
      pos.broker || '-',
      pos.notes || '-'
    ]);
    
    row.getCell(4).numFmt = '#,##0.####';
    row.getCell(6).numFmt = '#,##0.00';
    row.getCell(9).numFmt = '#,##0.00';
    row.getCell(10).numFmt = '#,##0.00';
    
    row.getCell(4).alignment = { horizontal: 'right' };
    row.getCell(6).alignment = { horizontal: 'right' };
    row.getCell(9).alignment = { horizontal: 'right' };
    row.getCell(10).alignment = { horizontal: 'right' };
    row.getCell(11).alignment = { horizontal: 'right' };
    row.getCell(12).alignment = { horizontal: 'center' };
    
    if (pos.total_score !== null && pos.total_score !== undefined) {
      applyScoreConditionalFormatting(row.getCell(12), pos.total_score);
    }
  });
  
  // Sum row
  const sumRow = holdingsSheet.addRow([
    '', 'SUMMEN', '', '', '', '', '', '', '', 
    totalValue,
    totalCost > 0 ? ((totalValue - totalCost) / totalCost * 100).toFixed(2) + '%' : '-',
    portfolioScore?.toFixed(1) ?? '-', '', ''
  ]);
  sumRow.font = { bold: true };
  sumRow.getCell(2).font = { bold: true };
  sumRow.getCell(10).font = { bold: true };
  sumRow.getCell(11).font = { bold: true };
  sumRow.getCell(12).font = { bold: true };
  sumRow.getCell(10).numFmt = '#,##0.00';
  
  setColumnWidths(holdingsSheet, [10, 30, 10, 12, 8, 12, 12, 10, 14, 14, 12, 10, 15, 30]);
  addAutoFilter(holdingsSheet, 'N');
  freezeHeader(holdingsSheet);
  
  // Sheet 2: Diversifikation
  const divSheet = workbook.addWorksheet('Diversifikation');
  
  const sectorMap = new Map<string, { count: number; value: number; scores: number[] }>();
  
  enrichedPositions.forEach((pos) => {
    const sector = pos.sector || pos.asset_type;
    const value = pos.current_value_usd ?? (pos.buy_price * pos.quantity);
    
    if (!sectorMap.has(sector)) {
      sectorMap.set(sector, { count: 0, value: 0, scores: [] });
    }
    const entry = sectorMap.get(sector)!;
    entry.count++;
    entry.value += value;
    if (pos.total_score !== null && pos.total_score !== undefined) {
      entry.scores.push(pos.total_score);
    }
  });
  
  const divHeaders = ['Sektor', 'Positionen', 'Wert (USD)', 'Anteil %', 'Avg Score'];
  divSheet.addRow(divHeaders);
  styleHeaderRow(divSheet.getRow(1));
  
  const sortedSectors = Array.from(sectorMap.entries()).sort((a, b) => b[1].value - a[1].value);
  
  sortedSectors.forEach(([sector, data]) => {
    const avgScore = data.scores.length > 0 
      ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length 
      : null;
    const share = totalValue > 0 ? (data.value / totalValue * 100) : 0;
    
    divSheet.addRow([
      sector,
      data.count,
      data.value,
      share.toFixed(1) + '%',
      avgScore?.toFixed(1) ?? '-'
    ]);
  });
  
  // HHI calculation
  let hhi = 0;
  if (totalValue > 0) {
    sectorMap.forEach((data) => {
      const share = data.value / totalValue;
      hhi += share * share;
    });
    hhi *= 10000;
  }
  
  const divScore = Math.max(0, Math.min(100, 100 - hhi));
  
  divSheet.addRow([]);
  divSheet.addRow(['Diversifikations-Score (HHI)', '', '', hhi.toFixed(0), '']);
  divSheet.addRow(['Diversifikations-Score (0-100)', '', '', divScore.toFixed(1), '']);
  
  setColumnWidths(divSheet, [25, 12, 14, 12, 12]);
  addAutoFilter(divSheet, 'E');
  freezeHeader(divSheet);
  
  // Currency exposure
  divSheet.addRow([]);
  divSheet.addRow(['Waehrungs-Exposure']);
  divSheet.addRow(['Waehrung', 'Positionen', 'Wert (USD)', 'Anteil %']);
  
  const currencyMap = new Map<string, { count: number; value: number }>();
  enrichedPositions.forEach((pos) => {
    const value = pos.current_value_usd ?? (pos.buy_price * pos.quantity);
    if (!currencyMap.has(pos.currency)) {
      currencyMap.set(pos.currency, { count: 0, value: 0 });
    }
    currencyMap.get(pos.currency)!.count++;
    currencyMap.get(pos.currency)!.value += value;
  });
  
  currencyMap.forEach((data, currency) => {
    const share = totalValue > 0 ? (data.value / totalValue * 100) : 0;
    divSheet.addRow([currency, data.count, data.value, share.toFixed(1) + '%']);
  });
  
  // Sheet 3: Portfolio Summary
  const summarySheet = workbook.addWorksheet('Summary');
  
  const totalGainLoss = totalCost > 0 ? ((totalValue - totalCost) / totalCost * 100) : 0;
  const equityPct = totalValue > 0 ? (summary.equity_value_usd / totalValue * 100) : 0;
  const etfPct = totalValue > 0 ? (summary.etf_value_usd / totalValue * 100) : 0;
  const commodityPct = totalValue > 0 ? (summary.commodity_value_usd / totalValue * 100) : 0;
  
  const summaryData = [
    ['Kennzahl', 'Wert'],
    ['Gesamtwert (USD)', totalValue],
    ['Gesamtkosten (USD)', totalCost],
    ['G/V %', totalGainLoss.toFixed(2) + '%'],
    ['Portfolio-Score', portfolioScore?.toFixed(1) ?? '-'],
    ['', ''],
    ['Positionen gesamt', enrichedPositions.length],
    ['Equity Positionen', summary.equity_count],
    ['ETF Positionen', summary.etf_count],
    ['Commodity Positionen', summary.commodity_count],
    ['', ''],
    ['Equity-Anteil', equityPct.toFixed(1) + '%'],
    ['ETF-Anteil', etfPct.toFixed(1) + '%'],
    ['Commodity-Anteil', commodityPct.toFixed(1) + '%'],
    ['', ''],
    ['Export-Datum', new Date().toISOString().split('T')[0]],
  ];
  
  summaryData.forEach((row) => {
    summarySheet.addRow(row);
  });
  
  styleHeaderRow(summarySheet.getRow(1));
  setColumnWidths(summarySheet, [25, 20]);
  
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function getExportFilename(type: 'run' | 'portfolio', runDate?: string): string {
  const date = runDate || new Date().toISOString().split('T')[0];
  if (type === 'run') {
    return `INTRINSIC-Run-${date}.xlsx`;
  }
  return `INTRINSIC-Portfolio-${date}.xlsx`;
}
