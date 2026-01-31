/**
 * Historical Data Quality Audit
 *
 * Comprehensive audit of historical data availability across all universes.
 * Validates:
 * - Data availability (2015-2025)
 * - Data completeness (trading days coverage)
 * - Symbol-level coverage
 * - Identifies missing or incomplete data
 *
 * Usage: tsx scripts/audit/historical-data-audit.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface UniverseConfig {
  id: string;
  name: string;
  symbols: string[];
  benchmark?: string;
}

interface SymbolDataQuality {
  symbol: string;
  exists: boolean;
  startDate: string | null;
  endDate: string | null;
  tradingDays: number;
  coverage2015_2025: number; // Percentage
  issues: string[];
}

interface UniverseAuditResult {
  universe: string;
  universeName: string;
  totalSymbols: number;
  symbolsWithData: number;
  symbolsWithCompleteData: number;
  coveragePercentage: number;
  missingSymbols: string[];
  incompleteSymbols: string[];
  symbolDetails: SymbolDataQuality[];
  recommendation: string;
}

const HISTORICAL_DIR = path.join(process.cwd(), 'data', 'backtesting', 'historical');
const UNIVERSES_DIR = path.join(process.cwd(), 'config', 'universes');
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'audits');

const REQUIRED_START = '2015-01-01';
const REQUIRED_END = '2025-12-31';
const MIN_TRADING_DAYS_10Y = 2500; // ~250 trading days/year * 10 years

function loadUniverse(universeFile: string): UniverseConfig {
  const content = fs.readFileSync(path.join(UNIVERSES_DIR, universeFile), 'utf-8');
  const data = JSON.parse(content);
  return {
    id: universeFile.replace('.json', ''),
    name: data.name || universeFile.replace('.json', ''),
    symbols: data.symbols || [],
    benchmark: data.benchmark,
  };
}

function analyzeSymbolData(symbol: string): SymbolDataQuality {
  const csvPath = path.join(HISTORICAL_DIR, `${symbol}.csv`);
  const result: SymbolDataQuality = {
    symbol,
    exists: false,
    startDate: null,
    endDate: null,
    tradingDays: 0,
    coverage2015_2025: 0,
    issues: [],
  };

  if (!fs.existsSync(csvPath)) {
    result.issues.push('CSV file missing');
    return result;
  }

  result.exists = true;

  try {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length <= 1) {
      result.issues.push('Empty CSV file');
      return result;
    }

    // Skip header, get dates
    const dataLines = lines.slice(1);
    const dates: string[] = [];

    for (const line of dataLines) {
      const parts = line.split(',');
      if (parts.length >= 1 && parts[0]) {
        dates.push(parts[0]);
      }
    }

    if (dates.length === 0) {
      result.issues.push('No valid dates found');
      return result;
    }

    dates.sort();
    result.startDate = dates[0];
    result.endDate = dates[dates.length - 1];
    result.tradingDays = dates.length;

    // Calculate coverage for 2015-2025 period
    const start2015 = new Date('2015-01-01');
    const end2025 = new Date('2025-12-31');
    const dataStart = new Date(result.startDate);
    const dataEnd = new Date(result.endDate);

    if (dataStart > start2015) {
      result.issues.push(`Data starts late: ${result.startDate} (required: ${REQUIRED_START})`);
    }

    if (dataEnd < end2025) {
      result.issues.push(`Data ends early: ${result.endDate} (required: ${REQUIRED_END})`);
    }

    if (result.tradingDays < MIN_TRADING_DAYS_10Y) {
      result.issues.push(`Insufficient data: ${result.tradingDays} days (required: ${MIN_TRADING_DAYS_10Y})`);
    }

    // Calculate percentage coverage
    const daysInPeriod = (end2025.getTime() - start2015.getTime()) / (1000 * 60 * 60 * 24);
    const expectedTradingDays = Math.floor(daysInPeriod * (252 / 365)); // ~252 trading days per year
    result.coverage2015_2025 = Math.min(100, (result.tradingDays / expectedTradingDays) * 100);

  } catch (error) {
    result.issues.push(`Error reading file: ${error}`);
  }

  return result;
}

function auditUniverse(universe: UniverseConfig): UniverseAuditResult {
  console.log(`\nAuditing ${universe.name} (${universe.symbols.length} symbols)...`);

  const symbolDetails: SymbolDataQuality[] = [];
  let symbolsWithData = 0;
  let symbolsWithCompleteData = 0;

  for (const symbol of universe.symbols) {
    const quality = analyzeSymbolData(symbol);
    symbolDetails.push(quality);

    if (quality.exists) {
      symbolsWithData++;
      if (quality.issues.length === 0) {
        symbolsWithCompleteData++;
      }
    }

    // Progress indicator
    if (symbolDetails.length % 100 === 0) {
      process.stdout.write(`  Processed ${symbolDetails.length}/${universe.symbols.length}...\r`);
    }
  }

  const coveragePercentage = universe.symbols.length > 0 ? (symbolsWithData / universe.symbols.length) * 100 : 0;
  const missingSymbols = symbolDetails.filter(s => !s.exists).map(s => s.symbol);
  const incompleteSymbols = symbolDetails.filter(s => s.exists && s.issues.length > 0).map(s => s.symbol);

  let recommendation: string;
  if (coveragePercentage >= 95) {
    recommendation = '✅ EXCELLENT - Universe ready for production backtesting';
  } else if (coveragePercentage >= 85) {
    recommendation = '⚠️  GOOD - Minor data gaps, investigate missing symbols';
  } else if (coveragePercentage >= 70) {
    recommendation = '⚠️  FAIR - Significant gaps, fetch missing data before production use';
  } else {
    recommendation = '❌ POOR - Too many missing symbols, run fetch-historical.py immediately';
  }

  return {
    universe: universe.id,
    universeName: universe.name,
    totalSymbols: universe.symbols.length,
    symbolsWithData,
    symbolsWithCompleteData,
    coveragePercentage,
    missingSymbols,
    incompleteSymbols,
    symbolDetails,
    recommendation,
  };
}

function generateReport(results: UniverseAuditResult[]): string {
  let report = '# Historical Data Quality Audit Report\n\n';
  report += `**Date**: ${new Date().toISOString()}\n`;
  report += `**Required Period**: ${REQUIRED_START} to ${REQUIRED_END}\n`;
  report += `**Min Trading Days**: ${MIN_TRADING_DAYS_10Y}\n\n`;

  report += '## Summary\n\n';
  report += '| Universe | Total | With Data | Complete | Coverage | Status |\n';
  report += '|----------|-------|-----------|----------|----------|--------|\n';

  for (const result of results) {
    const status = result.coveragePercentage >= 95 ? '✅' : result.coveragePercentage >= 85 ? '⚠️' : '❌';
    report += `| ${result.universeName} | ${result.totalSymbols} | ${result.symbolsWithData} | ${result.symbolsWithCompleteData} | ${result.coveragePercentage.toFixed(1)}% | ${status} |\n`;
  }

  report += '\n## Detailed Results\n\n';

  for (const result of results) {
    report += `### ${result.universeName}\n\n`;
    report += `**Coverage**: ${result.symbolsWithData}/${result.totalSymbols} (${result.coveragePercentage.toFixed(1)}%)\n\n`;
    report += `**Complete Data**: ${result.symbolsWithCompleteData} symbols\n\n`;
    report += `**Recommendation**: ${result.recommendation}\n\n`;

    if (result.missingSymbols.length > 0) {
      report += `**Missing Files** (${result.missingSymbols.length}):\n`;
      report += `\`\`\`\n${result.missingSymbols.join(', ')}\n\`\`\`\n\n`;
    }

    if (result.incompleteSymbols.length > 0) {
      report += `**Incomplete Data** (${result.incompleteSymbols.length}):\n`;
      for (const symbol of result.incompleteSymbols.slice(0, 10)) {
        const detail = result.symbolDetails.find(s => s.symbol === symbol);
        if (detail) {
          report += `- ${symbol}: ${detail.issues.join('; ')}\n`;
        }
      }
      if (result.incompleteSymbols.length > 10) {
        report += `- ... and ${result.incompleteSymbols.length - 10} more\n`;
      }
      report += '\n';
    }

    report += '---\n\n';
  }

  report += '## Action Items\n\n';

  const criticalUniverses = results.filter(r => r.coveragePercentage < 85);
  if (criticalUniverses.length > 0) {
    report += '### Critical: Fetch Missing Data\n\n';
    for (const result of criticalUniverses) {
      report += `- **${result.universeName}**: ${result.missingSymbols.length} missing symbols\n`;
      report += `  \`\`\`bash\n`;
      report += `  python scripts/backtesting/fetch-historical.py ${result.universe}\n`;
      report += `  \`\`\`\n\n`;
    }
  }

  const incompleteUniverses = results.filter(r => r.incompleteSymbols.length > 0);
  if (incompleteUniverses.length > 0) {
    report += '### Warning: Verify Incomplete Data\n\n';
    for (const result of incompleteUniverses) {
      report += `- **${result.universeName}**: ${result.incompleteSymbols.length} symbols with issues\n`;
    }
  }

  return report;
}

async function main() {
  console.log('═'.repeat(60));
  console.log('Historical Data Quality Audit');
  console.log('═'.repeat(60));

  if (!fs.existsSync(HISTORICAL_DIR)) {
    console.error(`\n❌ Historical data directory not found: ${HISTORICAL_DIR}`);
    console.error('Run: python scripts/backtesting/fetch-historical.py <universe>');
    process.exit(1);
  }

  if (!fs.existsSync(UNIVERSES_DIR)) {
    console.error(`\n❌ Universes directory not found: ${UNIVERSES_DIR}`);
    process.exit(1);
  }

  // Load all universe configs
  const universeFiles = fs.readdirSync(UNIVERSES_DIR).filter(f => f.endsWith('.json'));
  console.log(`\nFound ${universeFiles.length} universe configurations\n`);

  const results: UniverseAuditResult[] = [];

  for (const file of universeFiles) {
    try {
      const universe = loadUniverse(file);
      const result = auditUniverse(universe);
      results.push(result);
    } catch (error) {
      console.error(`\n❌ Failed to audit ${file}:`, error);
    }
  }

  // Generate report
  const report = generateReport(results);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Save report
  const reportPath = path.join(OUTPUT_DIR, 'historical-data-audit.md');
  fs.writeFileSync(reportPath, report);

  // Save detailed JSON
  const jsonPath = path.join(OUTPUT_DIR, 'historical-data-audit.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  console.log(`\n${'═'.repeat(60)}`);
  console.log('Audit Complete');
  console.log(`${'═'.repeat(60)}`);
  console.log(`\nReport saved to: ${reportPath}`);
  console.log(`Detailed JSON: ${jsonPath}\n`);

  // Print summary to console
  console.log('\nSummary:');
  for (const result of results) {
    const status = result.coveragePercentage >= 95 ? '✅' : result.coveragePercentage >= 85 ? '⚠️' : '❌';
    console.log(`${status} ${result.universeName}: ${result.coveragePercentage.toFixed(1)}% coverage (${result.symbolsWithData}/${result.totalSymbols})`);
  }

  const overallCoverage = results.reduce((sum, r) => sum + r.symbolsWithData, 0) / results.reduce((sum, r) => sum + r.totalSymbols, 0) * 100;
  console.log(`\n📊 Overall Coverage: ${overallCoverage.toFixed(1)}%`);
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
