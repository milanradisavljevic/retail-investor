import { getMacroSeries } from '@/data/macro-db';
import { detectRegimeFromSnapshot, type RegimeResult, shiftDateByMonths } from './engine';

type MacroPoint = { date: string; value: number | null };

export function computeRegimeHistory(startDate: string, endDate: string): RegimeResult[] {
  const dgs10Series = getMacroSeries('DGS10', startDate, endDate);
  const yieldCurveSeries = getMacroSeries('T10Y2Y', startDate, endDate);
  const vixSeries = getMacroSeries('VIXCLS', startDate, endDate);
  const cpiSeries = getMacroSeries('CPIAUCSL', undefined, endDate);
  const fedSeries = getMacroSeries('FEDFUNDS', undefined, endDate);

  const tradingDays = extractTradingDays([dgs10Series, yieldCurveSeries, vixSeries], startDate, endDate);
  const results: RegimeResult[] = [];

  for (const date of tradingDays) {
    const snapshot: Record<string, number | null> = {
      DGS10: getLatestNonNullValueOnOrBefore(dgs10Series, date),
      T10Y2Y: getLatestNonNullValueOnOrBefore(yieldCurveSeries, date),
      VIXCLS: getLatestNonNullValueOnOrBefore(vixSeries, date),
      CPIAUCSL: getLatestNonNullValueOnOrBefore(cpiSeries, date),
      FEDFUNDS: getLatestNonNullValueOnOrBefore(fedSeries, date),
      CPIAUCSL_12M_AGO: getLatestNonNullValueOnOrBefore(cpiSeries, shiftDateByMonths(date, -12)),
      FEDFUNDS_3M_AGO: getLatestNonNullValueOnOrBefore(fedSeries, shiftDateByMonths(date, -3)),
      FEDFUNDS_6M_AGO: getLatestNonNullValueOnOrBefore(fedSeries, shiftDateByMonths(date, -6)),
    };

    results.push(detectRegimeFromSnapshot(snapshot, date));
  }

  return results;
}

function extractTradingDays(
  dailySeries: MacroPoint[][],
  startDate: string,
  endDate: string
): string[] {
  const days = new Set<string>();

  for (const series of dailySeries) {
    for (const point of series) {
      if (point.date >= startDate && point.date <= endDate) {
        days.add(point.date);
      }
    }
  }

  return Array.from(days).sort((a, b) => a.localeCompare(b));
}

function getLatestNonNullValueOnOrBefore(series: MacroPoint[], targetDate: string): number | null {
  let left = 0;
  let right = series.length - 1;
  let bestIndex = -1;

  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    if (series[mid].date <= targetDate) {
      bestIndex = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  for (let idx = bestIndex; idx >= 0; idx -= 1) {
    const value = series[idx].value;
    if (value !== null) {
      return value;
    }
  }

  return null;
}
