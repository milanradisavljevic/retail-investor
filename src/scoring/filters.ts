/**
 * Live Run Filter Configuration
 * Filters symbols before scoring to save API calls and apply ethical/risk constraints
 */

export interface LiveRunFilterConfig {
  excludeCryptoMining: boolean;
  excludeDefense: boolean;
  excludeFossilFuels: boolean;
  minMarketCap: number | null;      // in USD
  minLiquidity: number | null;       // avg volume
  maxVolatility: number | null;      // optional, not implemented yet
}

export interface FilteredSymbolsResult {
  passedSymbols: string[];
  removedCount: number;
  removedByReason: {
    crypto_mining: string[];
    defense: string[];
    fossil_fuel: string[];
    market_cap: string[];
    liquidity: string[];
  };
}

export const DEFAULT_LIVE_RUN_FILTER_CONFIG: LiveRunFilterConfig = {
  excludeCryptoMining: false,
  excludeDefense: false,
  excludeFossilFuels: false,
  minMarketCap: null,
  minLiquidity: null,
  maxVolatility: null,
};

const CRYPTO_MINING_BLACKLIST = new Set([
  'MARA', 'RIOT', 'HUT', 'CLSK', 'BITF', 'HIVE', 'COIN', 'MSTR'
]);

const DEFENSE_BLACKLIST = new Set([
  'LMT', 'RTX', 'NOC', 'GD', 'BA', 'LHX', 'HII', 'TDG', 'TXT', 'LDOS'
]);

const FOSSIL_FUEL_BLACKLIST = new Set([
  'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'VLO', 'PSX', 'OXY', 'HAL',
  'DVN', 'FANG', 'HES', 'MRO', 'APA', 'CTRA', 'EQT', 'AR', 'RRC', 'CLR'
]);

/**
 * Filter symbols before scoring
 * Note: Market cap and liquidity filtering requires pre-fetched data,
 * so we only apply symbol-based blacklist filters here.
 * Market cap/liquidity filters should be applied after fetching basic data.
 */
export function filterSymbolsBeforeScoring(
  symbols: string[],
  config: Partial<LiveRunFilterConfig> = {}
): FilteredSymbolsResult {
  const cfg: LiveRunFilterConfig = {
    ...DEFAULT_LIVE_RUN_FILTER_CONFIG,
    ...config,
  };

  const removedByReason = {
    crypto_mining: [] as string[],
    defense: [] as string[],
    fossil_fuel: [] as string[],
    market_cap: [] as string[],
    liquidity: [] as string[],
  };

  const passedSymbols = symbols.filter((symbol) => {
    const symbolUpper = symbol.toUpperCase();

    if (cfg.excludeCryptoMining && CRYPTO_MINING_BLACKLIST.has(symbolUpper)) {
      removedByReason.crypto_mining.push(symbol);
      return false;
    }

    if (cfg.excludeDefense && DEFENSE_BLACKLIST.has(symbolUpper)) {
      removedByReason.defense.push(symbol);
      return false;
    }

    if (cfg.excludeFossilFuels && FOSSIL_FUEL_BLACKLIST.has(symbolUpper)) {
      removedByReason.fossil_fuel.push(symbol);
      return false;
    }

    return true;
  });

  const removedCount =
    removedByReason.crypto_mining.length +
    removedByReason.defense.length +
    removedByReason.fossil_fuel.length;

  return {
    passedSymbols,
    removedCount,
    removedByReason,
  };
}
