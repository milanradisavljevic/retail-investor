/**
 * EU Fundamentals Coverage Test
 * Tests yfinance fundamentals coverage for 100 EU symbols (25 per universe)
 */

import { YFinanceProvider } from '../src/providers/yfinance_provider';
import { YFinanceBatchProvider } from '../src/providers/yfinance_batch_provider';
import { initializeDatabase, closeDatabase } from '../src/data/db';

// Sample symbols from each EU universe (25 each = 100 total)
const SAMPLE_SYMBOLS: Record<string, string[]> = {
  "DAX 40": [
    "SAP.DE", "SIE.DE", "ALV.DE", "DTE.DE", "MBG.DE",
    "MUV2.DE", "ADS.DE", "BAS.DE", "BAYN.DE", "BMW.DE",
    "DBK.DE", "VNA.DE", "IFX.DE", "HEI.DE", "RWE.DE",
    "BEI.DE", "FRE.DE", "HEN3.DE", "MRK.DE", "SHL.DE",
    "DHL.DE", "EON.DE", "FME.DE", "MTX.DE", "SY1.DE"
  ],
  "CAC 40": [
    "AC.PA", "AIR.PA", "AI.PA", "MT.PA", "ATO.PA",
    "CS.PA", "BNP.PA", "BOL.PA", "BVI.PA", "CAP.PA",
    "CA.PA", "CHD.PA", "SGO.PA", "CSA.PA", "BN.PA",
    "DAST.PA", "ENGI.PA", "EL.PA", "EPA.PA", "RMS.PA",
    "ICO.PA", "KER.PA", "LR.PA", "ORA.PA", "MC.PA"
  ],
  "FTSE 100": [
    "SHEL.L", "AZN.L", "HSBA.L", "ULVR.L", "BP.L",
    "BHP.L", "GSK.L", "RIO.L", "AAL.L", "BARC.L",
    "BLND.L", "BT.A.L", "BA.L", "BATS.L", "CPG.L",
    "CNA.L", "CRH.L", "CCH.L", "DCC.L", "DGE.L",
    "ENT.L", "EXPN.L", "FERG.L", "FLTR.L", "FRAS.L"
  ],
  "EURO STOXX 50": [
    "SAN.MC", "TEF.MC", "REP.MC", "BBVA.MC", "ACS.MC",
    "AIR.PA", "BNP.PA", "CS.PA", "MC.PA", "OR.PA",
    "ALV.DE", "BAS.DE", "BAYN.DE", "BMW.DE", "DTE.DE",
    "ADS.DE", "SAP.DE", "SIE.DE", "NESN.SW", "NOVN.SW",
    "ROG.SW", "UBSG.SW", "ZURN.SW", "ABBN.SW", "TTE.PA"
  ]
};

// Key fundamental metrics to check
const KEY_METRICS = [
  // Valuation
  "trailingPE", "forwardPE", "priceToBook", "pegRatio", "enterpriseToEbitda",
  "enterpriseToRevenue", "priceToSalesTrailing12Months",
  // Profitability
  "profitMargins", "operatingMargins", "grossMargins",
  "returnOnAssets", "returnOnEquity",
  // Financial Health
  "debtToEquity", "currentRatio", "quickRatio",
  // Growth
  "revenueGrowth", "earningsGrowth",
  // Per Share
  "earningsPerShare", "bookValue", "revenuePerShare",
  // Cash Flow
  "freeCashflow", "operatingCashflow",
  // Dividends
  "dividendYield", "payoutRatio",
  // Other
  "beta", "marketCap", "enterpriseValue"
] as const;

type MetricKey = typeof KEY_METRICS[number];

interface SymbolCoverageResult {
  symbol: string;
  error: string | null;
  available: string[];
  missing: string[];
  coverageRate: number;
}

interface UniverseSummary {
  symbolCount: number;
  avgCoverage: number;
  symbolsWithErrors: number;
  symbolsHighCoverage: number;
  symbolsLowCoverage: number;
  mostMissingMetrics: [string, number][];
}

function checkCoverage(info: Record<string, any>): SymbolCoverageResult {
  const available: string[] = [];
  const missing: string[] = [];
  
  for (const metric of KEY_METRICS) {
    const value = info[metric];
    if (value !== null && value !== undefined && value !== "") {
      available.push(metric);
    } else {
      missing.push(metric);
    }
  }
  
  const coverageRate = (available.length / KEY_METRICS.length) * 100;
  
  return {
    symbol: info.symbol || "unknown",
    error: null,
    available,
    missing,
    coverageRate
  };
}

async function fetchSymbolData(symbol: string, provider: YFinanceProvider): Promise<SymbolCoverageResult> {
  try {
    const fundamentals = await provider.getFundamentals(symbol);
    const technicals = await provider.getTechnicalMetrics(symbol);
    
    // Combine fundamentals and technicals for coverage check
    const combinedInfo: Record<string, any> = {
      symbol,
      ...fundamentals,
      ...technicals
    };
    
    return checkCoverage(combinedInfo);
  } catch (error) {
    return {
      symbol,
      error: error instanceof Error ? error.message : "Unknown error",
      available: [],
      missing: [...KEY_METRICS],
      coverageRate: 0
    };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("EU FUNDAMENTALS COVERAGE TEST");
  console.log("=".repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Total symbols: ${Object.values(SAMPLE_SYMBOLS).reduce((a, b) => a + b.length, 0)}`);
  console.log(`Metrics checked: ${KEY_METRICS.length}`);
  console.log("=".repeat(60));
  
  await initializeDatabase();
  
  const provider = new YFinanceProvider();
  const allResults: SymbolCoverageResult[] = [];
  const universeSummaries: Record<string, UniverseSummary> = {};
  
  for (const [universeName, symbols] of Object.entries(SAMPLE_SYMBOLS)) {
    console.log(`\n📊 Testing ${universeName} (${symbols.length} symbols)...`);
    const universeResults: SymbolCoverageResult[] = [];
    
    for (const symbol of symbols) {
      process.stdout.write(`  Fetching ${symbol}... `);
      const coverage = await fetchSymbolData(symbol, provider);
      universeResults.push(coverage);
      allResults.push(coverage);
      console.log(`✓ ${coverage.coverageRate.toFixed(1)}%`);
    }
    
    // Calculate universe summary
    const avgCoverage = universeResults.reduce((sum, r) => sum + r.coverageRate, 0) / universeResults.length;
    const symbolsWithErrors = universeResults.filter(r => r.error).length;
    const symbolsHighCoverage = universeResults.filter(r => r.coverageRate >= 80).length;
    const symbolsLowCoverage = universeResults.filter(r => r.coverageRate < 50).length;
    
    // Find most missing metrics
    const allMissing: string[] = [];
    for (const r of universeResults) {
      allMissing.push(...r.missing);
    }
    
    const missingCounts = new Map<string, number>();
    for (const m of allMissing) {
      missingCounts.set(m, (missingCounts.get(m) || 0) + 1);
    }
    const mostMissing = Array.from(missingCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    universeSummaries[universeName] = {
      symbolCount: symbols.length,
      avgCoverage,
      symbolsWithErrors,
      symbolsHighCoverage,
      symbolsLowCoverage,
      mostMissingMetrics: mostMissing
    };
    
    console.log(`\n  📈 ${universeName} Summary:`);
    console.log(`     Avg Coverage: ${avgCoverage.toFixed(1)}%`);
    console.log(`     High Coverage (≥80%): ${symbolsHighCoverage}/${symbols.length}`);
    console.log(`     Low Coverage (<50%): ${symbolsLowCoverage}/${symbols.length}`);
    console.log(`     Errors: ${symbolsWithErrors}`);
    console.log(`     Most Missing: ${mostMissing.slice(0, 5).map(m => m[0]).join(", ")}`);
  }
  
  // Overall summary
  console.log("\n" + "=".repeat(60));
  console.log("OVERALL SUMMARY");
  console.log("=".repeat(60));
  
  const totalSymbols = allResults.length;
  const overallAvgCoverage = allResults.reduce((sum, r) => sum + r.coverageRate, 0) / totalSymbols;
  const totalErrors = allResults.filter(r => r.error).length;
  const symbolsVeryHigh = allResults.filter(r => r.coverageRate >= 90).length;
  const symbolsHigh = allResults.filter(r => r.coverageRate >= 80 && r.coverageRate < 90).length;
  const symbolsMedium = allResults.filter(r => r.coverageRate >= 50 && r.coverageRate < 80).length;
  const symbolsLow = allResults.filter(r => r.coverageRate < 50).length;
  
  console.log(`Total Symbols Tested: ${totalSymbols}`);
  console.log(`Overall Avg Coverage: ${overallAvgCoverage.toFixed(1)}%`);
  console.log(`Coverage ≥90%: ${symbolsVeryHigh} (${(symbolsVeryHigh/totalSymbols*100).toFixed(1)}%)`);
  console.log(`Coverage 80-89%: ${symbolsHigh} (${(symbolsHigh/totalSymbols*100).toFixed(1)}%)`);
  console.log(`Coverage 50-79%: ${symbolsMedium} (${(symbolsMedium/totalSymbols*100).toFixed(1)}%)`);
  console.log(`Coverage <50%: ${symbolsLow} (${(symbolsLow/totalSymbols*100).toFixed(1)}%)`);
  console.log(`Fetch Errors: ${totalErrors}`);
  
  // Most missing metrics overall
  const allMissing: string[] = [];
  for (const r of allResults) {
    allMissing.push(...r.missing);
  }
  
  const missingCounts = new Map<string, number>();
  for (const m of allMissing) {
    missingCounts.set(m, (missingCounts.get(m) || 0) + 1);
  }
  const mostMissingOverall = Array.from(missingCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  console.log("\nMost Missing Metrics (across all EU symbols):");
  for (const [metric, count] of mostMissingOverall) {
    const pct = (count / totalSymbols * 100).toFixed(1);
    console.log(`  - ${metric}: ${count}/${totalSymbols} (${pct}%)`);
  }
  
  // Problematic symbols
  console.log("\nProblematic Symbols (Coverage <50%):");
  const problematic = allResults.filter(r => r.coverageRate < 50 || r.error);
  for (const r of problematic.sort((a, b) => a.coverageRate - b.coverageRate)) {
    const errorStr = r.error ? ` (ERROR: ${r.error})` : "";
    console.log(`  - ${r.symbol}: ${r.coverageRate.toFixed(1)}%${errorStr}`);
  }
  
  // Save results to JSON
  const outputDir = "data/coverage_tests";
  const fs = await import("fs");
  const path = await import("path");
  
  fs.mkdirSync(outputDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const outputFile = path.join(outputDir, `eu_coverage_${timestamp}.json`);
  
  const outputData = {
    timestamp: new Date().toISOString(),
    totalSymbols,
    overallAvgCoverage,
    universeSummaries,
    symbolResults: allResults,
    mostMissingMetrics: mostMissingOverall,
    problematicSymbols: problematic.map(r => r.symbol)
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
  
  console.log(`\n💾 Results saved to: ${outputFile}`);
  console.log("=".repeat(60));
  
  await closeDatabase();
}

main().catch(console.error);
