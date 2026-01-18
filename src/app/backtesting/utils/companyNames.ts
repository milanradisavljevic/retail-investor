/**
 * Company Name Utilities
 *
 * Load and format company names for ticker symbols
 */

import fs from 'fs';
import path from 'path';

interface CompanyMetadata {
  symbol: string;
  shortName?: string;
  longName?: string;
  industry?: string;
  source?: string;
  error?: string;
}

type CompanyNameMap = Map<string, string>;

let cachedNames: CompanyNameMap | null = null;

/**
 * Load company names from metadata file
 */
export function loadCompanyNames(): CompanyNameMap {
  if (cachedNames) {
    return cachedNames;
  }

  const namesMap = new Map<string, string>();

  try {
    const metadataPath = path.join(process.cwd(), 'data/universe_metadata/russell2000_full_names.json');

    if (!fs.existsSync(metadataPath)) {
      console.warn(`Company metadata file not found: ${metadataPath}`);
      return namesMap;
    }

    const content = fs.readFileSync(metadataPath, 'utf-8');
    const metadata: CompanyMetadata[] = JSON.parse(content);

    for (const entry of metadata) {
      if (entry.error) {
        // Skip entries with errors
        continue;
      }

      // Prefer shortName, fallback to longName
      const name = entry.shortName || entry.longName;
      if (name && name.trim()) {
        namesMap.set(entry.symbol.toUpperCase(), name.trim());
      }
    }

    cachedNames = namesMap;
    console.log(`Loaded ${namesMap.size} company names from metadata`);
  } catch (error) {
    console.error('Error loading company names:', error);
  }

  return namesMap;
}

/**
 * Format ticker symbol with company name
 * @param ticker - Ticker symbol (e.g., "AAPL")
 * @param namesMap - Optional preloaded names map
 * @returns Formatted string (e.g., "AAPL (Apple Inc.)" or just "AAPL")
 */
export function formatTickerWithName(ticker: string, namesMap?: CompanyNameMap): string {
  if (!ticker) return '';

  const upperTicker = ticker.toUpperCase();
  const names = namesMap || loadCompanyNames();
  const companyName = names.get(upperTicker);

  if (companyName) {
    return `${upperTicker} (${companyName})`;
  }

  return upperTicker;
}

/**
 * Get company name for a ticker
 * @param ticker - Ticker symbol
 * @param namesMap - Optional preloaded names map
 * @returns Company name or empty string
 */
export function getCompanyName(ticker: string, namesMap?: CompanyNameMap): string {
  if (!ticker) return '';

  const upperTicker = ticker.toUpperCase();
  const names = namesMap || loadCompanyNames();
  return names.get(upperTicker) || '';
}

/**
 * Format multiple tickers with names
 * @param tickers - Array of ticker symbols
 * @param namesMap - Optional preloaded names map
 * @returns Array of formatted strings
 */
export function formatTickersWithNames(tickers: string[], namesMap?: CompanyNameMap): string[] {
  const names = namesMap || loadCompanyNames();
  return tickers.map(ticker => formatTickerWithName(ticker, names));
}
