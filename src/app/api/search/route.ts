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

interface SymbolMetadata {
  [symbol: string]: string;
}

let symbolCache: Map<string, { name: string; type: 'equity' | 'etf' }> | null = null;

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
        const data = JSON.parse(content);
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
        const data = JSON.parse(content);
        
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
    return NextResponse.json({ results: [] });
  }
  
  const results: SearchResult[] = [];
  
  const fundamentalsMetadata = loadSymbolMetadata();
  const universeSymbols = loadUniverseSymbols();
  
  const allSymbols = new Map<string, { name: string; type: 'equity' | 'etf' }>();
  for (const [symbol, data] of universeSymbols) {
    allSymbols.set(symbol, data);
  }
  for (const [symbol, data] of fundamentalsMetadata) {
    allSymbols.set(symbol, data);
  }
  
  for (const [symbol, data] of allSymbols) {
    const symbolLower = symbol.toLowerCase();
    const nameLower = data.name.toLowerCase();
    
    if (symbolLower.includes(query) || nameLower.includes(query)) {
      results.push({
        symbol,
        name: data.name,
        type: data.type,
      });
    }
    
    if (results.length >= 10) break;
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
      if (!results.find(r => r.symbol === metal.symbol)) {
        results.push(metal);
      }
    }
    
    for (const [key, keywords] of Object.entries(metalKeywords)) {
      if (metalsQuery.includes(key) || keywords.some(k => metalsQuery.includes(k))) {
        if (metalName.includes(key) || keywords.some(k => metalName.includes(k))) {
          if (!results.find(r => r.symbol === metal.symbol)) {
            results.push(metal);
          }
        }
      }
    }
  }
  
  const sortedResults = results.sort((a, b) => {
    if (a.type === 'commodity' && b.type !== 'commodity') return 1;
    if (a.type !== 'commodity' && b.type === 'commodity') return -1;
    
    const aStartsWith = a.symbol.toLowerCase().startsWith(query);
    const bStartsWith = b.symbol.toLowerCase().startsWith(query);
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    
    return a.symbol.localeCompare(b.symbol);
  });
  
  return NextResponse.json({ results: sortedResults.slice(0, 12) });
}
