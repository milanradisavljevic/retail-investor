import { getDatabase } from '../db';

export type GroupType = 'industry' | 'sector';

export interface GroupMedianRow {
  asOfDate: string;
  groupType: GroupType;
  groupName: string;
  metric: string;
  median: number | null;
  sampleCount: number;
}

export function upsertGroupMedians(rows: GroupMedianRow[]): void {
  if (rows.length === 0) return;
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO group_medians (as_of_date, group_type, group_name, metric, median, sample_count)
    VALUES (@asOfDate, @groupType, @groupName, @metric, @median, @sampleCount)
    ON CONFLICT(as_of_date, group_type, group_name, metric)
    DO UPDATE SET median = excluded.median, sample_count = excluded.sample_count
  `);

  const insertMany = db.transaction((batch: GroupMedianRow[]) => {
    for (const row of batch) {
      stmt.run(row);
    }
  });

  insertMany(rows);
}

export function getGroupMedian(
  asOfDate: string,
  groupType: GroupType,
  groupName: string,
  metric: string
): GroupMedianRow | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT as_of_date as asOfDate,
           group_type as groupType,
           group_name as groupName,
           metric,
           median,
           sample_count as sampleCount
    FROM group_medians
    WHERE as_of_date = ? AND group_type = ? AND group_name = ? AND metric = ?
    LIMIT 1
  `);

  const row = stmt.get(asOfDate, groupType, groupName, metric) as
    | GroupMedianRow
    | undefined;
  return row ?? null;
}
