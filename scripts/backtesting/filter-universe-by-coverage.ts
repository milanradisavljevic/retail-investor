import fs from 'fs';
import path from 'path';

type CoverageRow = {
  symbol: string;
  daysAvailable: number;
  hasSufficientData: boolean;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = 'true';
      }
    }
  }
  return out;
}

function loadUniverse(universe: string): string[] {
  const file = path.join(process.cwd(), 'config', 'universes', `${universe}.json`);
  if (!fs.existsSync(file)) throw new Error(`Universe file not found: ${file}`);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return (parsed.symbols || []).map((s: string) => String(s).toUpperCase());
}

function countPricesBefore(symbol: string, start: Date): number {
  const csvPath = path.join(process.cwd(), 'data', 'backtesting', 'historical', `${symbol}.csv`);
  if (!fs.existsSync(csvPath)) return 0;
  const raw = fs.readFileSync(csvPath, 'utf-8').trim();
  const lines = raw.split(/\r?\n/);
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const [date] = lines[i].split(',');
    if (!date) continue;
    const d = new Date(date);
    if (!isNaN(d.getTime()) && d < start) count++;
  }
  return count;
}

async function main() {
  const args = parseArgs();
  const universe = args.universe || 'russell2000_full';
  const required = Number(args.requiredDays || args['required-days'] || 252);
  const startDateStr = args.start || args['start-date'] || '2020-01-01';
  const startDate = new Date(startDateStr);

  const symbols = loadUniverse(universe);
  console.log(`Filtering ${symbols.length} symbols for data coverage...`);
  console.log(`Required: ${required} trading days before ${startDateStr}`);

  const rows: CoverageRow[] = [];
  const valid: string[] = [];

  for (const sym of symbols) {
    const days = countPricesBefore(sym, startDate);
    const ok = days >= required;
    rows.push({ symbol: sym, daysAvailable: days, hasSufficientData: ok });
    if (ok) valid.push(sym);
    else console.log(`  ⚠️  ${sym}: only ${days} days`);
  }

  const sufficient = rows.filter((r) => r.hasSufficientData).length;
  const insufficient = rows.length - sufficient;
  const coverage = symbols.length ? (sufficient / symbols.length) * 100 : 0;

  console.log('\n📊 Coverage Summary:');
  console.log(`  ✅ Sufficient data: ${sufficient} (${coverage.toFixed(1)}%)`);
  console.log(`  ❌ Insufficient data: ${insufficient} (${(100 - coverage).toFixed(1)}%)`);
  console.log(`  Valid universe: ${valid.length} symbols`);

  const report = {
    date: new Date().toISOString(),
    universe,
    totalSymbols: symbols.length,
    requiredDays: required,
    sufficientData: sufficient,
    insufficientData: insufficient,
    coverageRate: `${coverage.toFixed(1)}%`,
    details: rows,
  };
  const reportPath = path.join(process.cwd(), 'data', 'backtesting', 'coverage-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report saved: ${reportPath}`);

  // Write filtered list for chaining
  const filteredPath = path.join(process.cwd(), 'data', 'backtesting', 'coverage-filtered-symbols.json');
  fs.writeFileSync(filteredPath, JSON.stringify({ symbols: valid }, null, 2));
  console.log(`Filtered symbols saved: ${filteredPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
