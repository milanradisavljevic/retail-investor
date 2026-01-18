/**
 * Test script to verify company name loading
 */

import fs from 'fs';
import path from 'path';

interface NameEntry {
  name?: string;
  industry?: string;
}

function loadNameMap(universeName: string): Map<string, NameEntry> {
  const map = new Map<string, NameEntry>();
  const universeKey = process.env.UNIVERSE_CONFIG || process.env.UNIVERSE || '';
  const namesDir = path.join(process.cwd(), 'data', 'universe_metadata');
  const candidates = [];

  if (universeKey) {
    candidates.push(path.join(namesDir, `${universeKey}_names.json`));
  }
  const slug = universeName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_');
  candidates.push(path.join(namesDir, `${slug}_names.json`));

  console.log(`Universe name: "${universeName}"`);
  console.log(`Slug: "${slug}"`);
  console.log(`Candidates: ${candidates.join(', ')}`);

  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    console.log('No name file found!');
    return map;
  }

  console.log(`Found: ${filePath}`);

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    for (const entry of raw) {
      if (entry?.symbol) {
        map.set(String(entry.symbol).toUpperCase(), {
          name: entry.shortName || entry.longName || entry.name,
          industry: entry.industry,
        });
      }
    }
  } catch (err) {
    console.error('Failed to load name map', err);
  }

  return map;
}

// Test
const namesMap = loadNameMap('Russell 2000 Full');
console.log(`\nLoaded ${namesMap.size} company names`);

// Test some specific symbols
const testSymbols = ['LUMN', 'AAPL', 'CELH', 'NVDA', 'BE'];
console.log('\nTest lookups:');
for (const symbol of testSymbols) {
  const entry = namesMap.get(symbol);
  if (entry) {
    console.log(`  ${symbol}: ${entry.name} (${entry.industry || 'N/A'})`);
  } else {
    console.log(`  ${symbol}: NOT FOUND`);
  }
}
