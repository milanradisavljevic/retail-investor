import { upsertGroupMedians, GroupMedianRow, GroupType } from '@/data/repositories/group_medians_repo';
import { computeMedian } from './median';

export interface MedianInputRow {
  symbol: string;
  industry?: string | null;
  sector?: string | null;
  metrics: Record<string, number | null>;
}

export type GroupMedianMap = Record<
  GroupType,
  Record<string, Record<string, { median: number | null; sampleCount: number }>>
>;

export function calculateAndStoreGroupMedians(
  asOfDate: string,
  rows: MedianInputRow[]
): GroupMedianMap {
  const map: GroupMedianMap = { industry: {}, sector: {} };
  const values: Record<GroupType, Record<string, Record<string, number[]>>> = {
    industry: {},
    sector: {},
  };

  const pushValue = (
    groupType: GroupType,
    groupName: string,
    metric: string,
    value: number | null
  ) => {
    if (!values[groupType][groupName]) {
      values[groupType][groupName] = {};
    }
    if (!values[groupType][groupName][metric]) {
      values[groupType][groupName][metric] = [];
    }
    const entry = values[groupType][groupName][metric];
    if (value !== null && value !== undefined && Number.isFinite(value)) {
      entry.push(value as number);
    }
  };

  for (const row of rows) {
    const industry = row.industry || 'UNKNOWN';
    const sector = row.sector || 'UNKNOWN';
    for (const [metric, value] of Object.entries(row.metrics)) {
      pushValue('industry', industry, metric, value);
      pushValue('sector', sector, metric, value);
    }
  }

  const persistenceRows: GroupMedianRow[] = [];

  (['industry', 'sector'] as GroupType[]).forEach((groupType) => {
    Object.entries(values[groupType]).forEach(([groupName, metrics]) => {
      Object.entries(metrics).forEach(([metric, metricValues]) => {
        const median = computeMedian(metricValues);
        const sampleCount = metricValues.length;
        if (!map[groupType][groupName]) {
          map[groupType][groupName] = {};
        }
        map[groupType][groupName][metric] = { median, sampleCount };
        persistenceRows.push({
          asOfDate,
          groupType,
          groupName,
          metric,
          median,
          sampleCount,
        });
      });
    });
  });

  upsertGroupMedians(persistenceRows);
  return map;
}
