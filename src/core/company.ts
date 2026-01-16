/**
 * Company name resolution with optional per-universe overrides.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getConfig } from './config';

type NameMap = Record<string, string>;

interface CompanyNamesFile {
  default: NameMap;
  overrides?: Record<string, NameMap>;
}

function loadCompanyNames(): CompanyNamesFile {
  const projectRoot = process.cwd();
  const path = join(projectRoot, 'config', 'company_names.json');
  if (!existsSync(path)) {
    return { default: {} };
  }

  try {
    const json = readFileSync(path, 'utf-8');
    return JSON.parse(json) as CompanyNamesFile;
  } catch {
    return { default: {} };
  }
}

const COMPANY_NAMES = loadCompanyNames();

export function getCompanyName(symbol: string): string {
  const universeName = getConfig().universe.name;
  const overrides = COMPANY_NAMES.overrides?.[universeName] ?? {};
  return (
    overrides[symbol] ||
    COMPANY_NAMES.default[symbol] ||
    // Some DAX tickers carry a .DE suffix in data; normalize fallback
    COMPANY_NAMES.default[symbol.replace('.DE', '')] ||
    symbol
  );
}
