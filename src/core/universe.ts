/**
 * Universe management - handles the list of symbols to analyze
 */

import { getConfig } from './config';

export interface UniverseInfo {
  name: string;
  version: string;
  selectionRule: string;
  symbolCount: number;
}

export function getUniverse(): string[] {
  const config = getConfig();
  return config.universe.symbols;
}

export function getUniverseInfo(): UniverseInfo {
  const config = getConfig();
  return {
    name: config.universe.name,
    version: config.universe.version ?? '1',
    selectionRule: config.universe.selection_rule ?? '',
    symbolCount: config.universe.symbols.length,
  };
}

export function isInUniverse(symbol: string): boolean {
  const symbols = getUniverse();
  return symbols.includes(symbol.toUpperCase());
}

export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}
