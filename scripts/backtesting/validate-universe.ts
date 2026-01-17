/**
 * Universe Data Availability Validator
 *
 * Tests if Yahoo Finance provides data for all symbols in a universe.
 * Checks historical data availability from 2020-2024.
 *
 * Usage: npx tsx scripts/backtesting/validate-universe.ts [universe-name]
 * Example: npx tsx scripts/backtesting/validate-universe.ts russell2000
 *
 * Output: data/backtesting/universe-validation-[name].json
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Configuration
const START_DATE = '2020-01-01';
const END_DATE = '2024-12-31';
const MIN_DATA_POINTS = 1000; // ~4 years of trading days
const MIN_COMPLETENESS_THRESHOLD = 0.90; // 90%

interface UniverseConfig {
  name: string;
  provider: string;
  benchmark: string;
  symbols: string[];
}

interface SymbolValidation {
  symbol: string;
  status: 'available' | 'missing' | 'incomplete' | 'error';
  dataPoints: number;
  firstDate: string | null;
  lastDate: string | null;
  completeness: number;
  error?: string;
}

interface ValidationResult {
  universe: string;
  testDate: string;
  period: string;
  totalSymbols: number;
  availableSymbols: number;
  missingSymbols: string[];
  incompleteSymbols: string[];
  errorSymbols: string[];
  dataCompleteness: number;
  recommendation: 'GO' | 'NO-GO' | 'CONDITIONAL';
  recommendationReason: string;
  details: SymbolValidation[];
}

/**
 * Load universe configuration
 */
function loadUniverse(universeName: string): UniverseConfig {
  const universePath = path.join(process.cwd(), 'config/universes', `${universeName}.json`);

  if (!fs.existsSync(universePath)) {
    throw new Error(`Universe not found: ${universePath}`);
  }

  const content = fs.readFileSync(universePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Fetch historical data for a symbol using yfinance
 */
function fetchSymbolData(symbol: string): SymbolValidation {
  const pythonScript = `
import yfinance as yf
import json
import sys

try:
    ticker = yf.Ticker("${symbol}")
    hist = ticker.history(start="${START_DATE}", end="${END_DATE}", auto_adjust=True)

    if hist.empty:
        print(json.dumps({
            "status": "missing",
            "dataPoints": 0,
            "firstDate": None,
            "lastDate": None,
            "completeness": 0
        }))
    else:
        result = {
            "status": "available",
            "dataPoints": len(hist),
            "firstDate": str(hist.index[0].date()),
            "lastDate": str(hist.index[-1].date()),
            "completeness": len(hist) / ${MIN_DATA_POINTS}
        }

        if result["completeness"] < 0.5:
            result["status"] = "incomplete"

        print(json.dumps(result))

except Exception as e:
    print(json.dumps({
        "status": "error",
        "dataPoints": 0,
        "firstDate": None,
        "lastDate": None,
        "completeness": 0,
        "error": str(e)
    }))
`;

  try {
    const output = execSync(`python3 -c '${pythonScript}'`, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const result = JSON.parse(output.trim());
    return {
      symbol,
      ...result,
      completeness: Math.min(1, result.completeness)
    };
  } catch (error: any) {
    return {
      symbol,
      status: 'error',
      dataPoints: 0,
      firstDate: null,
      lastDate: null,
      completeness: 0,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Validate all symbols in a universe
 */
async function validateUniverse(universeName: string): Promise<ValidationResult> {
  console.log('='.repeat(60));
  console.log(`UNIVERSE DATA VALIDATION: ${universeName.toUpperCase()}`);
  console.log('='.repeat(60));

  const universe = loadUniverse(universeName);
  console.log(`\nUniverse: ${universe.name}`);
  console.log(`Symbols: ${universe.symbols.length}`);
  console.log(`Period: ${START_DATE} to ${END_DATE}`);
  console.log(`Provider: Yahoo Finance (yfinance)\n`);

  const details: SymbolValidation[] = [];
  const missingSymbols: string[] = [];
  const incompleteSymbols: string[] = [];
  const errorSymbols: string[] = [];
  let availableCount = 0;
  let totalCompleteness = 0;

  // Also validate benchmark
  const allSymbols = [...universe.symbols, universe.benchmark];

  for (let i = 0; i < allSymbols.length; i++) {
    const symbol = allSymbols[i];
    const isBenchmark = symbol === universe.benchmark;

    process.stdout.write(`[${i + 1}/${allSymbols.length}] ${symbol}${isBenchmark ? ' (benchmark)' : ''}... `);

    const validation = fetchSymbolData(symbol);
    details.push(validation);

    if (validation.status === 'available') {
      availableCount++;
      totalCompleteness += validation.completeness;
      console.log(`✓ ${validation.dataPoints} pts (${(validation.completeness * 100).toFixed(1)}%)`);
    } else if (validation.status === 'incomplete') {
      incompleteSymbols.push(symbol);
      totalCompleteness += validation.completeness;
      console.log(`⚠ ${validation.dataPoints} pts (${(validation.completeness * 100).toFixed(1)}%) - incomplete`);
    } else if (validation.status === 'missing') {
      missingSymbols.push(symbol);
      console.log(`✗ NO DATA`);
    } else {
      errorSymbols.push(symbol);
      console.log(`✗ ERROR: ${validation.error}`);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Calculate overall completeness
  const dataCompleteness = allSymbols.length > 0
    ? (availableCount + incompleteSymbols.length) / allSymbols.length
    : 0;

  const avgCompleteness = (availableCount + incompleteSymbols.length) > 0
    ? totalCompleteness / (availableCount + incompleteSymbols.length)
    : 0;

  // Determine recommendation
  let recommendation: 'GO' | 'NO-GO' | 'CONDITIONAL';
  let recommendationReason: string;

  if (dataCompleteness >= MIN_COMPLETENESS_THRESHOLD && avgCompleteness >= 0.8) {
    recommendation = 'GO';
    recommendationReason = `${(dataCompleteness * 100).toFixed(1)}% symbols available with ${(avgCompleteness * 100).toFixed(1)}% avg completeness`;
  } else if (dataCompleteness >= 0.7) {
    recommendation = 'CONDITIONAL';
    recommendationReason = `${(dataCompleteness * 100).toFixed(1)}% symbols available - review missing symbols before proceeding`;
  } else {
    recommendation = 'NO-GO';
    recommendationReason = `Only ${(dataCompleteness * 100).toFixed(1)}% symbols available - insufficient data coverage`;
  }

  return {
    universe: universe.name,
    testDate: new Date().toISOString(),
    period: `${START_DATE} to ${END_DATE}`,
    totalSymbols: allSymbols.length,
    availableSymbols: availableCount,
    missingSymbols,
    incompleteSymbols,
    errorSymbols,
    dataCompleteness: Math.round(dataCompleteness * 1000) / 10,
    recommendation,
    recommendationReason,
    details
  };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const universeName = process.argv[2] || 'russell2000';

  try {
    const result = await validateUniverse(universeName);

    // Write results
    const outputDir = path.join(process.cwd(), 'data/backtesting');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `universe-validation-${universeName}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`\nUniverse: ${result.universe}`);
    console.log(`Total Symbols: ${result.totalSymbols}`);
    console.log(`Available: ${result.availableSymbols}`);
    console.log(`Missing: ${result.missingSymbols.length}`);
    console.log(`Incomplete: ${result.incompleteSymbols.length}`);
    console.log(`Errors: ${result.errorSymbols.length}`);
    console.log(`\nData Completeness: ${result.dataCompleteness}%`);

    const recColor = result.recommendation === 'GO' ? '✓' :
                     result.recommendation === 'CONDITIONAL' ? '⚠' : '✗';
    console.log(`\n${recColor} RECOMMENDATION: ${result.recommendation}`);
    console.log(`   ${result.recommendationReason}`);

    if (result.missingSymbols.length > 0) {
      console.log(`\nMissing Symbols: ${result.missingSymbols.join(', ')}`);
    }

    if (result.incompleteSymbols.length > 0) {
      console.log(`Incomplete Symbols: ${result.incompleteSymbols.join(', ')}`);
    }

    console.log(`\nResults saved to: ${outputPath}`);
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error(`\nValidation failed: ${error.message}`);
    process.exit(1);
  }
}

main();
