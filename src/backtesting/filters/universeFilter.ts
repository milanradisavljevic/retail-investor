export interface BacktestStock {
  symbol: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  avgVolume3Month: number | null;
  currentPrice: number | null;
  name: string | null;
}

export interface FilterConfig {
  minMarketCap: number;
  minPrice: number;
  minAvgVolume: number;
  excludeCrypto: boolean;
  excludeMemeStocks: boolean;
  excludeDefense: boolean;
  excludeFossilFuels: boolean;
  customBlacklist: string[];
}

export interface FilterResult {
  passed: BacktestStock[];
  filtered: Array<{
    stock: BacktestStock;
    reason: string;
  }>;
  summary: {
    totalInput: number;
    totalPassed: number;
    filteredByCrypto: number;
    filteredByMarketCap: number;
    filteredByPrice: number;
    filteredByVolume: number;
    filteredByBlacklist: number;
    filteredByDefense: number;
    filteredByFossilFuels: number;
  };
}

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  minMarketCap: 500_000_000,
  minPrice: 5,
  minAvgVolume: 100_000,
  excludeCrypto: true,
  excludeMemeStocks: true,
  excludeDefense: false,
  excludeFossilFuels: false,
  customBlacklist: [],
};

const CRYPTO_SYMBOLS = new Set(['MARA', 'RIOT', 'HUT', 'CLSK', 'BITF', 'HIVE', 'COIN', 'MSTR', 'GBTC']);
const MEME_SYMBOLS = new Set(['GME', 'AMC', 'BBBY', 'BB', 'NOK', 'WISH', 'CLOV', 'SPCE']);
const DEFENSE_SYMBOLS = new Set(['LMT', 'RTX', 'NOC', 'GD', 'BA', 'LHX', 'HII', 'TDG', 'TXT', 'LDOS']);
const FOSSIL_FUEL_SYMBOLS = new Set([
  'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'VLO', 'PSX', 'OXY', 'HAL',
  'DVN', 'FANG', 'HES', 'MRO', 'APA', 'CTRA', 'EQT', 'AR', 'RRC', 'CLR'
]);

function textMatches(value: string | null, keywords: string[]): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function shouldExcludeCrypto(stock: BacktestStock): boolean {
  const { symbol, industry, name } = stock;
  const symbolUpper = symbol.toUpperCase();
  if (CRYPTO_SYMBOLS.has(symbolUpper)) return true;

  const keywords = ['bitcoin', 'crypto', 'blockchain', 'mining'];
  if (textMatches(industry, keywords)) return true;
  if (textMatches(name, ['bitcoin', 'crypto', 'blockchain'])) return true;

  return false;
}

function shouldExcludeMeme(stock: BacktestStock): boolean {
  return MEME_SYMBOLS.has(stock.symbol.toUpperCase());
}

function shouldExcludeDefense(stock: BacktestStock): boolean {
  const { symbol, industry, sector } = stock;
  const symbolUpper = symbol.toUpperCase();
  if (DEFENSE_SYMBOLS.has(symbolUpper)) return true;

  const keywords = ['defense', 'aerospace & defense', 'weapons', 'military'];
  if (textMatches(industry, keywords)) return true;
  if (textMatches(sector, keywords)) return true;

  return false;
}

function shouldExcludeFossilFuels(stock: BacktestStock): boolean {
  const { symbol, industry, sector } = stock;
  const symbolUpper = symbol.toUpperCase();
  if (FOSSIL_FUEL_SYMBOLS.has(symbolUpper)) return true;

  const keywords = ['oil', 'gas', 'petroleum', 'energy equipment', 'oil & gas'];
  if (textMatches(industry, keywords)) return true;
  if (textMatches(sector, keywords)) return true;

  return false;
}

export function filterBacktestUniverse(
  stocks: BacktestStock[],
  config: Partial<FilterConfig> = {}
): FilterResult {
  const cfg: FilterConfig = {
    ...DEFAULT_FILTER_CONFIG,
    ...config,
    customBlacklist: config.customBlacklist ?? DEFAULT_FILTER_CONFIG.customBlacklist,
  };

  const blacklist = new Set(cfg.customBlacklist.map((s) => s.toUpperCase()));

  const passed: BacktestStock[] = [];
  const filtered: Array<{ stock: BacktestStock; reason: string }> = [];

  let filteredByCrypto = 0;
  let filteredByMarketCap = 0;
  let filteredByPrice = 0;
  let filteredByVolume = 0;
  let filteredByBlacklist = 0;
  let filteredByDefense = 0;
  let filteredByFossilFuels = 0;

  for (const stock of stocks) {
    const symbolUpper = stock.symbol.toUpperCase();

    let reason: string | null = null;

    if (blacklist.has(symbolUpper)) {
      reason = 'custom_blacklist';
      filteredByBlacklist += 1;
    } else if (cfg.excludeCrypto && shouldExcludeCrypto(stock)) {
      reason = 'crypto_exposure';
      filteredByCrypto += 1;
    } else if (cfg.excludeMemeStocks && shouldExcludeMeme(stock)) {
      reason = 'meme_stock';
      filteredByBlacklist += 1;
    } else if (cfg.excludeDefense && shouldExcludeDefense(stock)) {
      reason = 'defense_industry';
      filteredByDefense += 1;
    } else if (cfg.excludeFossilFuels && shouldExcludeFossilFuels(stock)) {
      reason = 'fossil_fuels';
      filteredByFossilFuels += 1;
    } else if (stock.marketCap === null || stock.marketCap < cfg.minMarketCap) {
      reason = stock.marketCap === null ? 'market_cap_missing' : 'market_cap_below_min';
      filteredByMarketCap += 1;
    } else if (stock.currentPrice !== null && stock.currentPrice < cfg.minPrice) {
      reason = 'price_below_min';
      filteredByPrice += 1;
    } else if (
      stock.avgVolume3Month !== null &&
      stock.avgVolume3Month < cfg.minAvgVolume
    ) {
      reason = 'avg_volume_below_min';
      filteredByVolume += 1;
    }

    if (reason) {
      filtered.push({ stock, reason });
    } else {
      passed.push(stock);
    }
  }

  return {
    passed,
    filtered,
    summary: {
      totalInput: stocks.length,
      totalPassed: passed.length,
      filteredByCrypto,
      filteredByMarketCap,
      filteredByPrice,
      filteredByVolume,
      filteredByBlacklist,
      filteredByDefense,
      filteredByFossilFuels,
    },
  };
}
