/**
 * Universe Audit Script
 * Validates all universe configurations and their supporting data
 */

import fs from 'fs';
import path from 'path';

interface UniverseAuditResult {
  id: string;
  name: string;
  configFile: string;

  // Symbol Counts
  declaredCount: number; // What's in name/description
  actualSymbolCount: number; // Actually in symbols[]
  snapshotCount: number; // In snapshot file (if available)

  // Data Quality
  symbolsWithNames: number;
  symbolsWithoutNames: number;
  missingNames: string[]; // First 10

  // Backtest Data
  hasHistoricalData: boolean;
  historicalDataCount: number;
  missingHistoricalData: string[]; // First 10

  // Issues
  issues: string[];
  status: 'OK' | 'WARNING' | 'ERROR';
}

async function auditUniverse(configPath: string): Promise<UniverseAuditResult> {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const issues: string[] = [];
  const universeId = path.basename(configPath, '.json');

  // 1. Symbol Count Check
  const actualCount = config.symbols?.length || 0;
  const declaredMatch = config.name?.match(/(\d+)/);
  const declaredCount = declaredMatch ? parseInt(declaredMatch[1]) : actualCount;

  if (actualCount < declaredCount * 0.9) {
    issues.push(
      `Symbol count mismatch: declared ${declaredCount}, actual ${actualCount}`
    );
  }

  // 2. Snapshot Check
  const snapshotDir = path.join(
    process.cwd(),
    'data/universes/snapshots',
    universeId
  );
  let snapshotCount = 0;
  if (fs.existsSync(snapshotDir)) {
    const snapshots = fs.readdirSync(snapshotDir).filter((f) => f.endsWith('.json'));
    if (snapshots.length > 0) {
      const latestSnapshotPath = path.join(
        snapshotDir,
        snapshots[snapshots.length - 1]
      );
      try {
        const latestSnapshot = JSON.parse(
          fs.readFileSync(latestSnapshotPath, 'utf-8')
        );
        snapshotCount = latestSnapshot.symbols?.length || 0;
      } catch (e) {
        issues.push('Snapshot file exists but is invalid JSON');
      }
    }
  }

  // 3. Names Check (from universe_metadata)
  const namesFile = path.join(
    process.cwd(),
    'data/universe_metadata',
    `${universeId}_names.json`
  );
  let symbolsWithNames = 0;
  let missingNames: string[] = [];

  if (fs.existsSync(namesFile)) {
    try {
      const names = JSON.parse(fs.readFileSync(namesFile, 'utf-8'));
      const nameMap = new Map(
        names.map((n: any) => [n.symbol, n.name || n.shortName || n.longName])
      );

      for (const symbol of config.symbols || []) {
        const name = nameMap.get(symbol);
        if (name && name !== '' && name !== symbol) {
          symbolsWithNames++;
        } else {
          missingNames.push(symbol);
        }
      }
    } catch (e) {
      issues.push('Names file exists but is invalid JSON');
      missingNames = (config.symbols || []).slice(0, 10);
    }
  } else {
    issues.push('No names file found');
    missingNames = (config.symbols || []).slice(0, 10);
  }

  // 4. Historical Data Check
  const historicalDir = path.join(process.cwd(), 'data/backtesting/historical');
  let historicalDataCount = 0;
  let missingHistoricalData: string[] = [];

  if (fs.existsSync(historicalDir)) {
    for (const symbol of config.symbols || []) {
      const csvPath = path.join(historicalDir, `${symbol}.csv`);
      if (fs.existsSync(csvPath)) {
        const stats = fs.statSync(csvPath);
        // Check if file is not empty (> 100 bytes to account for headers)
        if (stats.size > 100) {
          historicalDataCount++;
        } else {
          missingHistoricalData.push(symbol);
        }
      } else {
        missingHistoricalData.push(symbol);
      }
    }

    if (missingHistoricalData.length > actualCount * 0.1) {
      issues.push(
        `Missing historical data for ${missingHistoricalData.length}/${actualCount} symbols (${((missingHistoricalData.length / actualCount) * 100).toFixed(1)}%)`
      );
    }
  } else {
    issues.push('Historical data directory does not exist');
    missingHistoricalData = (config.symbols || []).slice(0, 10);
  }

  // Status Determination
  let status: 'OK' | 'WARNING' | 'ERROR' = 'OK';
  if (issues.length > 0) status = 'WARNING';
  if (actualCount < declaredCount * 0.5 || actualCount === 0) status = 'ERROR';
  if (symbolsWithNames < actualCount * 0.5) status = 'WARNING';

  return {
    id: universeId,
    name: config.name || 'Unknown',
    configFile: configPath,
    declaredCount,
    actualSymbolCount: actualCount,
    snapshotCount,
    symbolsWithNames,
    symbolsWithoutNames: actualCount - symbolsWithNames,
    missingNames: missingNames.slice(0, 10),
    hasHistoricalData: historicalDataCount > 0,
    historicalDataCount,
    missingHistoricalData: missingHistoricalData.slice(0, 10),
    issues,
    status,
  };
}

async function main() {
  const universesDir = path.join(process.cwd(), 'config/universes');

  if (!fs.existsSync(universesDir)) {
    console.error('ERROR: config/universes directory not found');
    process.exit(1);
  }

  const files = fs.readdirSync(universesDir).filter((f) => f.endsWith('.json'));

  console.log('='.repeat(80));
  console.log('UNIVERSE AUDIT REPORT');
  console.log('='.repeat(80));
  console.log('');

  const results: UniverseAuditResult[] = [];

  for (const file of files) {
    const result = await auditUniverse(path.join(universesDir, file));
    results.push(result);

    const statusIcon =
      result.status === 'OK' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';

    console.log(`${statusIcon} ${result.name}`);
    console.log(
      `   File: ${result.id}.json | Symbols: ${result.actualSymbolCount}/${result.declaredCount}`
    );
    console.log(
      `   Names: ${result.symbolsWithNames}/${result.actualSymbolCount} (${((result.symbolsWithNames / result.actualSymbolCount) * 100).toFixed(1)}%) | Historical: ${result.historicalDataCount}/${result.actualSymbolCount} (${((result.historicalDataCount / result.actualSymbolCount) * 100).toFixed(1)}%)`
    );

    if (result.issues.length > 0) {
      for (const issue of result.issues) {
        console.log(`   ⚠️  ${issue}`);
      }
    }

    if (result.missingNames.length > 0 && result.symbolsWithoutNames > 0) {
      console.log(
        `   Missing names (first 10): ${result.missingNames.slice(0, 10).join(', ')}`
      );
    }

    if (
      result.missingHistoricalData.length > 0 &&
      result.missingHistoricalData.length < result.actualSymbolCount
    ) {
      console.log(
        `   Missing historical (first 10): ${result.missingHistoricalData.slice(0, 10).join(', ')}`
      );
    }

    console.log('');
  }

  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Universes: ${results.length}`);
  console.log(`✅ OK: ${results.filter((r) => r.status === 'OK').length}`);
  console.log(`⚠️  WARNING: ${results.filter((r) => r.status === 'WARNING').length}`);
  console.log(`❌ ERROR: ${results.filter((r) => r.status === 'ERROR').length}`);
  console.log('');

  // Detailed stats
  const totalSymbols = results.reduce((sum, r) => sum + r.actualSymbolCount, 0);
  const totalWithNames = results.reduce((sum, r) => sum + r.symbolsWithNames, 0);
  const totalHistorical = results.reduce(
    (sum, r) => sum + r.historicalDataCount,
    0
  );

  console.log(`Total Symbols: ${totalSymbols}`);
  console.log(
    `Total with Names: ${totalWithNames} (${((totalWithNames / totalSymbols) * 100).toFixed(1)}%)`
  );
  console.log(
    `Total with Historical Data: ${totalHistorical} (${((totalHistorical / totalSymbols) * 100).toFixed(1)}%)`
  );
  console.log('');

  // Critical issues
  const criticalIssues = results.filter((r) => r.status === 'ERROR');
  if (criticalIssues.length > 0) {
    console.log('CRITICAL ISSUES:');
    for (const result of criticalIssues) {
      console.log(`  ❌ ${result.name}: ${result.issues.join(', ')}`);
    }
    console.log('');
  }

  // Write detailed JSON report
  const auditDir = path.join(process.cwd(), 'data/audits');
  if (!fs.existsSync(auditDir)) {
    fs.mkdirSync(auditDir, { recursive: true });
  }

  const reportPath = path.join(auditDir, 'universe-audit.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        summary: {
          totalUniverses: results.length,
          ok: results.filter((r) => r.status === 'OK').length,
          warning: results.filter((r) => r.status === 'WARNING').length,
          error: results.filter((r) => r.status === 'ERROR').length,
          totalSymbols,
          totalWithNames,
          totalHistorical,
        },
        universes: results,
      },
      null,
      2
    )
  );

  console.log(`Detailed report written to: ${reportPath}`);
}

main().catch((error) => {
  console.error('Audit failed:', error);
  process.exit(1);
});
