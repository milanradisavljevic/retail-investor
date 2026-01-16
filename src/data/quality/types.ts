export interface MetricQuality {
  value: number | null;
  source: string;
  confidence: number;
  isImputed: boolean;
  isMissing: boolean;
  notes?: string;
}

export interface DataQuality {
  dataQualityScore: number;
  dataQualityConfidence: number;
  completenessRatio: number;
  imputedRatio: number;
  missingCritical: string[];
  metrics: Record<string, MetricQuality>;
  missingFields?: string[];
  assumptions?: string[];
  adjustedPriceMode?: 'adjusted' | 'raw' | 'mixed';
}
