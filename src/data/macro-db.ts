import { getDatabase } from './db';
import type { Database } from 'better-sqlite3';

/**
 * Interface for macro indicator data
 */
export interface MacroIndicator {
  series_id: string;
  date: string;
  value: number | null;
  fetched_at: number;
}

/**
 * Get macro series data for a specific series ID with optional date range
 * @param seriesId The FRED series ID (e.g. 'DGS10', 'VIXCLS')
 * @param startDate Optional start date in 'YYYY-MM-DD' format
 * @param endDate Optional end date in 'YYYY-MM-DD' format
 * @returns Array of macro indicators sorted by date
 */
export function getMacroSeries(
  seriesId: string,
  startDate?: string,
  endDate?: string
): Array<{ date: string; value: number | null }> {
  const db: Database = getDatabase();
  
  let sql = `SELECT date, value FROM macro_indicators WHERE series_id = ?`;
  const params: (string | number)[] = [seriesId];
  
  if (startDate) {
    sql += ` AND date >= ?`;
    params.push(startDate);
  }
  
  if (endDate) {
    sql += ` AND date <= ?`;
    params.push(endDate);
  }
  
  sql += ` ORDER BY date ASC`;
  
  const rows = db.prepare(sql).all(...params) as Array<{
    date: string;
    value: number | null;
  }>;
  
  return rows;
}

/**
 * Get the latest value for a specific macro series
 * @param seriesId The FRED series ID (e.g. 'DGS10', 'VIXCLS')
 * @returns Latest date and value, or null if not found
 */
export function getLatestMacroValue(seriesId: string): { date: string; value: number | null } | null {
  const db: Database = getDatabase();
  
  const row = db
    .prepare(
      `SELECT date, value FROM macro_indicators 
       WHERE series_id = ? AND value IS NOT NULL
       ORDER BY date DESC LIMIT 1`
    )
    .get(seriesId) as { date: string; value: number | null } | undefined;
  
  return row ? { date: row.date, value: row.value } : null;
}

/**
 * Get a snapshot of all 5 macro series for a specific date
 * For monthly series (CPI, FEDFUNDS), this will return the most recent value
 * prior to or equal to the specified date
 * @param date The target date in 'YYYY-MM-DD' format
 * @returns Record mapping series IDs to their values (or null if not available)
 */
export function getMacroSnapshot(date: string): Record<string, number | null> {
  const db: Database = getDatabase();
  
  // Get all series IDs we're tracking
  const allSeries = ['DGS10', 'T10Y2Y', 'VIXCLS', 'CPIAUCSL', 'FEDFUNDS'];
  
  const result: Record<string, number | null> = {};
  
  for (const seriesId of allSeries) {
    // Find the most recent value on or before the target date
    const row = db
      .prepare(
        `SELECT value FROM macro_indicators 
         WHERE series_id = ? AND date <= ?
         ORDER BY date DESC LIMIT 1`
      )
      .get(seriesId, date) as { value: number | null } | undefined;
      
    result[seriesId] = row ? row.value : null;
  }
  
  return result;
}