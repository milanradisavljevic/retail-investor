export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface SearchResult {
  symbol: string;
  name: string;
  type: 'equity' | 'etf' | 'commodity';
  exchange?: string;
}

interface FundamentalFile {
  company_name?: string;
  name?: string;
}

interface UniverseFile {
  symbols?: string[];
}

interface ETFMetadataFile {
  etfs: Record<string, { name: string; ticker: string; exchange?: string }>;
}

let symbolCache: Map<string, { name: string; type: 'equity' | 'etf' }> | null = null;
let etfCache: Map<string, { name: string; type: 'etf'; exchange?: string }> | null = null;
const SEARCH_CACHE_HEADERS = { 'Cache-Control': 'public, max-age=300' } as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseFundamentalFile(content: string): FundamentalFile | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isObject(parsed)) return null;
    const companyName = typeof parsed.company_name === 'string' ? parsed.company_name : undefined;
    const name = typeof parsed.name === 'string' ? parsed.name : undefined;
    return { company_name: companyName, name };
  } catch {
    return null;
  }
}

function parseUniverseFile(content: string): UniverseFile | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isObject(parsed)) return null;
    const symbols = Array.isArray(parsed.symbols)
      ? parsed.symbols.filter((symbol): symbol is string => typeof symbol === 'string')
      : undefined;
    return { symbols };
  } catch {
    return null;
  }
}

function loadSymbolMetadata(): Map<string, { name: string; type: 'equity' | 'etf' }> {
  if (symbolCache) {
    return symbolCache;
  }
  
  symbolCache = new Map();
  
  const metadataDir = join(process.cwd(), 'data', 'fundamentals');
  
  if (!existsSync(metadataDir)) {
    return symbolCache;
  }
  
  try {
    const files = readdirSync(metadataDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const filePath = join(metadataDir, file);
        const content = readFileSync(filePath, 'utf-8');
        const data = parseFundamentalFile(content);
        if (!data) continue;
        const symbol = file.replace('.json', '');
        
        if (data.company_name || data.name) {
          symbolCache!.set(symbol, {
            name: data.company_name || data.name || symbol,
            type: 'equity',
          });
        }
      } catch {
        continue;
      }
    }
  } catch {
    return symbolCache;
  }
  
  return symbolCache;
}

function loadUniverseSymbols(): Map<string, { name: string; type: 'equity' | 'etf' }> {
  const symbols = new Map<string, { name: string; type: 'equity' | 'etf' }>();
  
  const universesDir = join(process.cwd(), 'config', 'universes');
  
  if (!existsSync(universesDir)) {
    return symbols;
  }
  
  try {
    const files = readdirSync(universesDir).filter(f => f.endsWith('.json') && f !== 'index.json');
    
    for (const file of files) {
      try {
        const filePath = join(universesDir, file);
        const content = readFileSync(filePath, 'utf-8');
        const data = parseUniverseFile(content);
        if (!data) continue;
        
        if (data.symbols && Array.isArray(data.symbols)) {
          for (const symbol of data.symbols) {
            if (!symbols.has(symbol)) {
              symbols.set(symbol, { name: symbol, type: 'equity' });
            }
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    return symbols;
  }
  
  return symbols;
}

function loadETFMetadata(): Map<string, { name: string; type: 'etf'; exchange?: string }> {
  if (etfCache) {
    return etfCache;
  }
  
  etfCache = new Map();
  
  const etfPath = join(process.cwd(), 'data', 'etf', 'metadata.json');
  
  if (!existsSync(etfPath)) {
    return etfCache;
  }
  
  try {
    const content = readFileSync(etfPath, 'utf-8');
    const data: unknown = JSON.parse(content);
    
    if (!isObject(data) || !isObject(data.etfs)) {
      return etfCache;
    }
    
    for (const [ticker, etfData] of Object.entries(data.etfs)) {
      if (!isObject(etfData)) continue;
      const name = typeof etfData.name === 'string' ? etfData.name : ticker;
      const exchange = typeof etfData.exchange === 'string' ? etfData.exchange : undefined;
      
      etfCache.set(ticker, { name, type: 'etf', exchange });
    }
  } catch {
    return etfCache;
  }
  
  return etfCache;
}

const PHYSICAL_METALS = [
  { symbol: 'PHYS:XAU', name: 'Gold (physisch)', type: 'commodity' as const },
  { symbol: 'PHYS:XAG', name: 'Silber (physisch)', type: 'commodity' as const },
  { symbol: 'PHYS:XPT', name: 'Platin (physisch)', type: 'commodity' as const },
  { symbol: 'PHYS:XPD', name: 'Palladium (physisch)', type: 'commodity' as const },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.toLowerCase().trim() || '';
  
  if (!query || query.length < 1) {
    return NextResponse.json({ results: [] }, { headers: SEARCH_CACHE_HEADERS });
  }
  
  const equityResults: SearchResult[] = [];
  const etfResults: SearchResult[] = [];
  const commodityResults: SearchResult[] = [];
  
  const fundamentalsMetadata = loadSymbolMetadata();
  const universeSymbols = loadUniverseSymbols();
  const etfMetadata = loadETFMetadata();
  
  const etfTickers = new Set(etfMetadata.keys());
  
  const allSymbols = new Map<string, { name: string; type: 'equity' | 'etf' }>();
  for (const [symbol, data] of universeSymbols) {
    if (!etfTickers.has(symbol)) {
      allSymbols.set(symbol, data);
    }
  }
  for (const [symbol, data] of fundamentalsMetadata) {
    if (!etfTickers.has(symbol)) {
      allSymbols.set(symbol, data);
    }
  }
  
  for (const [symbol, data] of allSymbols) {
    if (equityResults.length >= 8) break;
    
    const symbolLower = symbol.toLowerCase();
    const nameLower = data.name.toLowerCase();
    
    if (symbolLower.includes(query) || nameLower.includes(query)) {
      equityResults.push({
        symbol,
        name: data.name,
        type: data.type,
      });
    }
  }
  
  for (const [symbol, data] of etfMetadata) {
    if (etfResults.length >= 8) break;
    
    const symbolLower = symbol.toLowerCase();
    const nameLower = data.name.toLowerCase();
    
    if (symbolLower.includes(query) || nameLower.includes(query)) {
      etfResults.push({
        symbol,
        name: data.name,
        type: 'etf',
        exchange: data.exchange,
      });
    }
  }
  
  const metalsQuery = query.replace(/[^a-z]/g, '');
  const metalKeywords: Record<string, string[]> = {
    'gold': ['gold', 'xau'],
    'silber': ['silber', 'silver', 'xag'],
    'silver': ['silver', 'silber', 'xag'],
    'platin': ['platin', 'platinum', 'xpt'],
    'platinum': ['platinum', 'platin', 'xpt'],
    'palladium': ['palladium', 'xpd'],
  };
  
  for (const metal of PHYSICAL_METALS) {
    const metalName = metal.name.toLowerCase();
    const metalSymbol = metal.symbol.toLowerCase();
    
    if (metalName.includes(query) || metalSymbol.includes(query)) {
      if (!commodityResults.find(r => r.symbol === metal.symbol)) {
        commodityResults.push(metal);
      }
    }
    
    for (const [key, keywords] of Object.entries(metalKeywords)) {
      if (metalsQuery.includes(key) || keywords.some(k => metalsQuery.includes(k))) {
        if (metalName.includes(key) || keywords.some(k => metalName.includes(k))) {
          if (!commodityResults.find(r => r.symbol === metal.symbol)) {
            commodityResults.push(metal);
          }
        }
      }
    }
  }
  
  const results: SearchResult[] = [];
  
  const sortByMatch = (a: SearchResult, b: SearchResult) => {
    const aStartsWith = a.symbol.toLowerCase().startsWith(query);
    const bStartsWith = b.symbol.toLowerCase().startsWith(query);
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    return a.symbol.localeCompare(b.symbol);
  };
  
  results.push(...equityResults.sort(sortByMatch));
  results.push(...etfResults.sort(sortByMatch));
  results.push(...commodityResults);
  
  return NextResponse.json({ results: results.slice(0, 15) }, { headers: SEARCH_CACHE_HEADERS });
}
