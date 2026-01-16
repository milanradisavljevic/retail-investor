import { getDatabase } from '../db';
import type { CompanyProfile } from '@/providers/types';

export interface CompanyProfileSnapshot {
  symbol: string;
  fetchedAt: number;
  profile: CompanyProfile;
}

export function saveCompanyProfile(
  symbol: string,
  profile: CompanyProfile,
  fetchedAt: number = Date.now()
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO company_profile (symbol, name, sector, industry, market_cap, data_json, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name,
      sector = excluded.sector,
      industry = excluded.industry,
      market_cap = excluded.market_cap,
      data_json = excluded.data_json,
      fetched_at = excluded.fetched_at
  `);

  stmt.run(
    symbol,
    profile.name ?? null,
    profile.sector ?? null,
    profile.industry ?? null,
    (profile as any).marketCapitalization ?? null,
    JSON.stringify(profile),
    fetchedAt
  );
}

export function getCompanyProfileIfFresh(symbol: string, maxAgeMs: number): CompanyProfileSnapshot | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT symbol, fetched_at as fetchedAt, data_json
       FROM company_profile
       WHERE symbol = ?`
    )
    .get(symbol) as { symbol: string; fetchedAt: number; data_json: string } | undefined;

  if (!row) return null;
  const age = Date.now() - row.fetchedAt;
  if (age > maxAgeMs) return null;

  return {
    symbol: row.symbol,
    fetchedAt: row.fetchedAt,
    profile: JSON.parse(row.data_json) as CompanyProfile,
  };
}
