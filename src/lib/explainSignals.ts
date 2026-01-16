import type { RunV1SchemaJson } from '@/types/generated/run_v1';

export type Signal = {
  label: string;
  metric?: string;
  value?: number | string;
  severity: 'info' | 'good' | 'bad' | 'warn';
};

type SignalBuckets = {
  positives: Signal[];
  negatives: Signal[];
  warnings: Signal[];
};

const PERCENT = (value: number) => Number((value * 100).toFixed(1));

function pushBySeverity(signal: Signal, buckets: SignalBuckets) {
  if (signal.severity === 'warn') {
    buckets.warnings.push(signal);
  } else if (signal.severity === 'bad') {
    buckets.negatives.push(signal);
  } else {
    buckets.positives.push(signal);
  }
}

function cappedWarnings(buckets: SignalBuckets): Signal[] {
  // Prioritize structural issues first
  const priorities = [
    'Negative equity detected (D/E scored 0)',
    'Negative upside vs model fair value (potential value trap)',
    'Value computed with partial inputs',
    'Value fallback: insufficient valuation inputs',
    'Low confidence due to data quality / inconsistent pillars',
    'Missing fundamentals',
  ];
  const ordered = [...buckets.warnings].sort((a, b) => {
    const aIdx = priorities.findIndex((p) => a.label.startsWith(p));
    const bIdx = priorities.findIndex((p) => b.label.startsWith(p));
    return (aIdx === -1 ? priorities.length : aIdx) - (bIdx === -1 ? priorities.length : bIdx);
  });
  return ordered.slice(0, 3);
}

function ensureCount<T extends Signal>(signals: T[], minimum: number, fillerFactory: () => T) {
  while (signals.length < minimum) {
    signals.push(fillerFactory());
  }
}

export function buildExplainSignals(
  scoreEntry: RunV1SchemaJson['scores'][number],
  _run: RunV1SchemaJson
): SignalBuckets {
  const buckets: SignalBuckets = { positives: [], negatives: [], warnings: [] };
  const { breakdown, evidence, price_target: priceTarget, data_quality: dq } = scoreEntry;
  const coverage = scoreEntry.valuation_input_coverage ?? scoreEntry.value_input_coverage;

  const valuationSignals: Signal[] = [];
  const qualitySignals: Signal[] = [];
  const technicalSignals: Signal[] = [];

  // Valuation
  if (priceTarget && typeof priceTarget.upside_pct === 'number') {
    const upside = PERCENT(priceTarget.upside_pct);
    let severity: Signal['severity'] = 'info';
    if (priceTarget.upside_pct >= 0.05) severity = 'good';
    else if (priceTarget.upside_pct < 0) severity = 'bad';

    valuationSignals.push({
      label: severity === 'bad' ? 'Negative model upside' : 'Upside vs model fair value',
      metric: 'Upside',
      value: `${upside}%`,
      severity,
    });

    if (priceTarget.confidence === 'high') {
      valuationSignals.push({
        label: 'Price target confidence high',
        metric: 'PT confidence',
        value: 'High',
        severity: 'good',
      });
    } else if (priceTarget.confidence === 'medium') {
      valuationSignals.push({
        label: 'Price target confidence moderate',
        metric: 'PT confidence',
        value: 'Medium',
        severity: 'info',
      });
    }
  }

  if (typeof evidence?.valuation === 'number') {
    const severity = evidence.valuation >= 70 ? 'good' : evidence.valuation <= 40 ? 'bad' : 'info';
    valuationSignals.push({
      label: severity === 'good' ? 'Valuation pillar strong' : severity === 'bad' ? 'Valuation pillar weak' : 'Valuation neutral',
      metric: 'Valuation',
      value: evidence.valuation.toFixed(1),
      severity,
    });
  }

  if (typeof breakdown?.fundamental === 'number') {
    const severity = breakdown.fundamental >= 70 ? 'good' : breakdown.fundamental <= 40 ? 'bad' : 'info';
    valuationSignals.push({
      label: 'Fundamental composite',
      metric: 'Fundamental',
      value: breakdown.fundamental.toFixed(1),
      severity,
    });
  }

  // Quality
  if (typeof evidence?.quality === 'number') {
    const severity = evidence.quality >= 70 ? 'good' : evidence.quality <= 40 ? 'bad' : 'info';
    qualitySignals.push({
      label: severity === 'good' ? 'Quality pillar strong' : severity === 'bad' ? 'Quality pillar weak' : 'Quality neutral',
      metric: 'Quality',
      value: evidence.quality.toFixed(1),
      severity,
    });
  }

  if (typeof dq?.data_quality_score === 'number') {
    const severity = dq.data_quality_score >= 80 ? 'good' : dq.data_quality_score <= 60 ? 'bad' : 'info';
    qualitySignals.push({
      label: severity === 'good' ? 'Data quality robust' : severity === 'bad' ? 'Data quality concerns' : 'Data quality moderate',
      metric: 'DQ score',
      value: dq.data_quality_score.toFixed(1),
      severity,
    });
  }

  if (typeof dq?.completeness_ratio === 'number') {
    qualitySignals.push({
      label: dq.completeness_ratio >= 0.9 ? 'Fundamentals mostly complete' : 'Fundamentals partially complete',
      metric: 'Completeness',
      value: dq.completeness_ratio,
      severity: dq.completeness_ratio >= 0.9 ? 'good' : 'info',
    });
  }

  // Technical / Risk
  if (typeof evidence?.technical === 'number') {
    const severity = evidence.technical >= 70 ? 'good' : evidence.technical <= 40 ? 'bad' : 'info';
    technicalSignals.push({
      label: severity === 'good' ? 'Technical momentum strong' : severity === 'bad' ? 'Technical momentum weak' : 'Technical setup neutral',
      metric: 'Technical',
      value: evidence.technical.toFixed(1),
      severity,
    });
  }

  if (typeof breakdown?.technical === 'number') {
    technicalSignals.push({
      label: 'Technical composite',
      metric: 'Composite',
      value: breakdown.technical.toFixed(1),
      severity: 'info',
    });
  }

  if (typeof evidence?.risk === 'number') {
    const severity = evidence.risk <= 40 ? 'bad' : evidence.risk >= 70 ? 'good' : 'info';
    technicalSignals.push({
      label: severity === 'bad' ? 'Risk profile elevated' : 'Risk balanced',
      metric: 'Risk',
      value: evidence.risk.toFixed(1),
      severity,
    });
  }

  // Warnings
  const assumptions = dq?.assumptions?.map((a) => a.toLowerCase()) ?? [];
  if (assumptions.some((a) => a.includes('negative equity'))) {
    buckets.warnings.push({
      label: 'Negative equity detected (D/E scored 0)',
      severity: 'warn',
    });
  }

  if (priceTarget?.confidence === 'low') {
    buckets.warnings.push({
      label: 'Low confidence due to data quality / inconsistent pillars',
      severity: 'warn',
    });
  }

  if (priceTarget && typeof priceTarget.upside_pct === 'number' && priceTarget.upside_pct < 0) {
    buckets.warnings.push({
      label: 'Negative upside vs model fair value (potential value trap)',
      severity: 'warn',
      metric: 'Upside',
      value: `${PERCENT(priceTarget.upside_pct)}%`,
    });
  }

  if (coverage?.strategy_used === 'partial') {
    const missingList = coverage.missing?.map((m) => m.toUpperCase()).join(', ');
    buckets.warnings.push({
      label: `Value computed with partial inputs${missingList ? ` (missing ${missingList})` : ''}`,
      severity: 'warn',
    });
  }

  if (coverage?.strategy_used === 'fallback_neutral') {
    buckets.warnings.push({
      label: 'Value fallback: insufficient valuation inputs',
      severity: 'warn',
    });
  }

  const missingFields = dq?.missing_fields ?? [];
  if (missingFields.length > 0) {
    buckets.warnings.push({
      label: `Missing fundamentals: ${missingFields.slice(0, 3).join(', ')}`,
      severity: 'warn',
    });
  }

  // Fill in default informational signals to meet minimum counts (2 per pillar)
  ensureCount(valuationSignals, 2, () => ({
    label: 'Valuation inputs stable',
    severity: 'info',
  }));

  ensureCount(qualitySignals, 2, () => ({
    label: 'Quality inputs stable',
    severity: 'info',
  }));

  ensureCount(technicalSignals, 2, () => ({
    label: 'Technical inputs stable',
    severity: 'info',
  }));

  valuationSignals.slice(0, 3).forEach((signal) => pushBySeverity(signal, buckets));
  qualitySignals.slice(0, 3).forEach((signal) => pushBySeverity(signal, buckets));
  technicalSignals.slice(0, 3).forEach((signal) => pushBySeverity(signal, buckets));

  // Keep warnings to a manageable set
  buckets.warnings = cappedWarnings(buckets);

  // Cap total to 10 by trimming lowest-priority info signals
  const maxTotal = 10;
  const totalCount = () => buckets.positives.length + buckets.negatives.length + buckets.warnings.length;
  while (totalCount() > maxTotal) {
    const infoIndex = buckets.positives.findIndex((s) => s.severity === 'info');
    if (infoIndex !== -1) {
      buckets.positives.splice(infoIndex, 1);
      continue;
    }
    const negInfoIndex = buckets.negatives.findIndex((s) => s.severity === 'info');
    if (negInfoIndex !== -1) {
      buckets.negatives.splice(negInfoIndex, 1);
      continue;
    }
    break;
  }

  return buckets;
}
