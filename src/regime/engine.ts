import { getMacroSeries, getMacroSnapshot } from '@/data/macro-db';

export type RegimeLabel = 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | 'CRISIS';

export interface RegimeResult {
  label: RegimeLabel;
  composite_score: number;
  confidence: number;
  signals: {
    vix: { value: number | null; score: number };
    yield_curve: { value: number | null; score: number };
    fed_rate: { value: number | null; score: number; delta_3m: number | null };
    cpi: { value: number | null; score: number; yoy: number | null };
  };
  as_of_date: string;
  data_gaps: string[];
}

type MacroSnapshot = Record<string, number | null>;

const SIGNAL_WEIGHTS = {
  vix: 0.35,
  yield_curve: 0.30,
  fed_rate: 0.20,
  cpi: 0.15,
} as const;

export function detectRegime(date: string): RegimeResult {
  const snapshot = getMacroSnapshot(date);
  const fedSeries = getMacroSeries('FEDFUNDS', undefined, date);
  const cpiSeries = getMacroSeries('CPIAUCSL', undefined, date);

  const enrichedSnapshot: MacroSnapshot = {
    ...snapshot,
    FEDFUNDS: snapshot.FEDFUNDS ?? getLatestNonNullValueOnOrBefore(fedSeries, date),
    CPIAUCSL: snapshot.CPIAUCSL ?? getLatestNonNullValueOnOrBefore(cpiSeries, date),
    FEDFUNDS_3M_AGO: getLatestNonNullValueOnOrBefore(fedSeries, shiftDateByMonths(date, -3)),
    FEDFUNDS_6M_AGO: getLatestNonNullValueOnOrBefore(fedSeries, shiftDateByMonths(date, -6)),
    CPIAUCSL_12M_AGO: getLatestNonNullValueOnOrBefore(cpiSeries, shiftDateByMonths(date, -12)),
  };

  return detectRegimeFromSnapshot(enrichedSnapshot, date);
}

export function detectRegimeFromSnapshot(snapshot: MacroSnapshot, date: string): RegimeResult {
  const vix = snapshot.VIXCLS ?? null;
  const yieldCurve = snapshot.T10Y2Y ?? null;
  const fedRate = snapshot.FEDFUNDS ?? null;
  const fed3mAgo = snapshot.FEDFUNDS_3M_AGO ?? null;
  const fed6mAgo = snapshot.FEDFUNDS_6M_AGO ?? null;
  const cpi = snapshot.CPIAUCSL ?? null;
  const cpi12mAgo = snapshot.CPIAUCSL_12M_AGO ?? null;

  const vixOverride = vix !== null && vix > 40;

  const vixAvailable = vix !== null;
  const yieldAvailable = yieldCurve !== null;
  const fedAvailable = fedRate !== null && fed3mAgo !== null;
  const cpiAvailable = cpi !== null && cpi12mAgo !== null && cpi12mAgo !== 0;

  const vixScore = scoreVix(vix);
  const yieldScore = scoreYieldCurve(yieldCurve);
  const delta3m = fedAvailable ? fedRate - fed3mAgo : null;
  const delta6m = fedRate !== null && fed6mAgo !== null ? fedRate - fed6mAgo : null;
  const fedScore = fedAvailable ? scoreFedMomentum(delta3m, delta6m) : 0;
  const cpiYoy = cpiAvailable ? ((cpi / cpi12mAgo - 1) * 100) : null;
  const cpiScore = cpiYoy !== null ? scoreCpiYoy(cpiYoy) : 0;

  let weightedScore = 0;
  let weightSum = 0;

  if (vixAvailable) {
    weightedScore += SIGNAL_WEIGHTS.vix * vixScore;
    weightSum += SIGNAL_WEIGHTS.vix;
  }
  if (yieldAvailable) {
    weightedScore += SIGNAL_WEIGHTS.yield_curve * yieldScore;
    weightSum += SIGNAL_WEIGHTS.yield_curve;
  }
  if (fedAvailable) {
    weightedScore += SIGNAL_WEIGHTS.fed_rate * fedScore;
    weightSum += SIGNAL_WEIGHTS.fed_rate;
  }
  if (cpiAvailable) {
    weightedScore += SIGNAL_WEIGHTS.cpi * cpiScore;
    weightSum += SIGNAL_WEIGHTS.cpi;
  }

  const compositeScore = clamp(weightSum > 0 ? weightedScore / weightSum : 0, -1, 1);
  const label = mapRegimeLabel(compositeScore, vixOverride);

  const availableSignals = [vixAvailable, yieldAvailable, fedAvailable, cpiAvailable].filter(Boolean).length;
  const confidence = availableSignals / 4;

  const dataGaps: string[] = [];
  if (!vixAvailable) {
    dataGaps.push('VIXCLS');
  }
  if (!yieldAvailable) {
    dataGaps.push('T10Y2Y');
  }
  if (!fedAvailable) {
    dataGaps.push('FEDFUNDS');
  }
  if (!cpiAvailable) {
    dataGaps.push('CPIAUCSL');
  }

  return {
    label,
    composite_score: compositeScore,
    confidence,
    signals: {
      vix: { value: vix, score: vixAvailable ? vixScore : 0 },
      yield_curve: { value: yieldCurve, score: yieldAvailable ? yieldScore : 0 },
      fed_rate: { value: fedRate, score: fedScore, delta_3m: delta3m },
      cpi: { value: cpi, score: cpiScore, yoy: cpiYoy },
    },
    as_of_date: date,
    data_gaps: dataGaps,
  };
}

export function shiftDateByMonths(date: string, deltaMonths: number): string {
  const [year, month, day] = date.split('-').map((part) => parseInt(part, 10));

  const shiftedBase = new Date(Date.UTC(year, month - 1, 1));
  shiftedBase.setUTCMonth(shiftedBase.getUTCMonth() + deltaMonths);

  const shiftedYear = shiftedBase.getUTCFullYear();
  const shiftedMonth = shiftedBase.getUTCMonth();
  const lastDay = new Date(Date.UTC(shiftedYear, shiftedMonth + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);

  return formatUtcDate(new Date(Date.UTC(shiftedYear, shiftedMonth, safeDay)));
}

function scoreVix(vix: number | null): number {
  if (vix === null) {
    return 0;
  }
  if (vix < 15) {
    return 1.0;
  }
  if (vix < 20) {
    return 0.5;
  }
  if (vix < 25) {
    return 0.0;
  }
  if (vix <= 30) {
    return -0.5;
  }
  return -1.0;
}

function scoreYieldCurve(spread: number | null): number {
  if (spread === null) {
    return 0;
  }
  if (spread > 1.5) {
    return 1.0;
  }
  if (spread >= 0.5) {
    return 0.5;
  }
  if (spread >= 0.0) {
    return 0.0;
  }
  if (spread >= -0.5) {
    return -0.5;
  }
  return -1.0;
}

function scoreFedMomentum(delta3m: number | null, delta6m: number | null): number {
  if (delta3m === null) {
    return 0;
  }
  if (delta6m !== null && delta6m > 1.0) {
    return -1.0;
  }
  if (delta3m < -0.25) {
    return 0.5;
  }
  if (Math.abs(delta3m) < 0.25) {
    return 0.0;
  }
  if (delta3m > 0.25) {
    return -0.5;
  }
  return 0.0;
}

function scoreCpiYoy(yoy: number): number {
  if (yoy < 2) {
    return 0.3;
  }
  if (yoy <= 3) {
    return 0.5;
  }
  if (yoy <= 5) {
    return -0.3;
  }
  return -0.5;
}

function mapRegimeLabel(compositeScore: number, vixOverride: boolean): RegimeLabel {
  if (vixOverride || compositeScore < -0.6) {
    return 'CRISIS';
  }
  if (compositeScore < -0.2) {
    return 'RISK_OFF';
  }
  if (compositeScore <= 0.4) {
    return 'NEUTRAL';
  }
  return 'RISK_ON';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLatestNonNullValueOnOrBefore(
  series: Array<{ date: string; value: number | null }>,
  targetDate: string
): number | null {
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
