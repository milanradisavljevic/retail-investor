/**
 * Field-Level Coverage Audit
 * Measures coverage of specific fields needed for 4-Pillar scoring
 */

import fs from 'fs';
import path from 'path';
import { YFinanceProvider } from '@/providers/yfinance_provider';

type UniversePack = {
  name: string;
  benchmark?: string;
  symbols: string[];
};

// Required fields grouped by pillar
const REQUIRED_FIELDS = {
  valuation: ['peRatio', 'pbRatio', 'psRatio'],
  quality: ['roe', 'debtToEquity'],
  technical: [
    'currentPrice',
    'high52Week',
    'low52Week',
    'priceReturn13Week',
    'priceReturn52Week',
  ],
  risk: ['beta', 'volatility3Month'],
};

interface FieldCoverage {
  okCount: number;
  okPct: number;
  missingSymbols: string[];
}

interface PillarHealth {
  score: number; // 0-100
  avgFieldCoverage: number;
  fieldCoverage: Record<string, FieldCoverage>;
  viable: boolean; // Can this pillar be used?
}

interface AuditResult {
  universe_id: string;
  name: string;
  symbol_count: number;
  price_coverage: { ok: number; pct: number };
  pillar_health: {
    valuation: PillarHealth;
    quality: PillarHealth;
    technical: PillarHealth;
    risk: PillarHealth;
  };
  universe_health_score: number;
  production_class: 'PRODUCTION' | 'LIMITED' | 'NOT_RECOMMENDED';
  recommendation: string;
  sampled_at: string;
}

const DEFAULT_CONCURRENCY = Number(process.env.AUDIT_CONCURRENCY || 3);
const DEFAULT_THROTTLE_MS = Number(process.env.AUDIT_THROTTLE_MS || 300);
const DEFAULT_DAYS_BACK = 504;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSymbols(symbols: string[]): string[] {
  const set = new Set<string>();
  for (const raw of symbols) {
    if (typeof raw !== 'string') continue;
    const norm = raw.trim().toUpperCase();
    if (norm) set.add(norm);
  }
  return Array.from(set);
}

function loadUniverse(file: string): UniversePack {
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return {
    name: raw.name ?? path.basename(file),
    benchmark: raw.benchmark ?? 'SPY',
    symbols: normalizeSymbols(Array.isArray(raw.symbols) ? raw.symbols : []),
  };
}

function ensureAuditDir(): string {
  const dir = path.join(process.cwd(), 'data', 'audits', 'field-coverage');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function withThrottle<T>(fn: () => Promise<T>, throttleMs: number): Promise<T> {
  const result = await fn();
  if (throttleMs > 0) {
    await sleep(throttleMs);
  }
  return result;
}

function isValidValue(val: any): boolean {
  return val !== null && val !== undefined && !isNaN(Number(val));
}

async function analyzeSymbol(
  yf: YFinanceProvider,
  symbol: string,
  throttleMs: number
): Promise<{
  symbol: string;
  hasPrice: boolean;
  fundamentals: Record<string, boolean>;
  technical: Record<string, boolean>;
}> {
  const result = {
    symbol,
    hasPrice: false,
    fundamentals: {} as Record<string, boolean>,
    technical: {} as Record<string, boolean>,
  };

  try {
    // Check price data
    const candles = await withThrottle(
      () => yf.getCandles(symbol, DEFAULT_DAYS_BACK),
      throttleMs
    );
    result.hasPrice = candles?.s === 'ok' && (candles?.c?.length || 0) >= 252;

    // Check fundamentals
    const fund = await yf.getFundamentals(symbol);
    for (const field of [...REQUIRED_FIELDS.valuation, ...REQUIRED_FIELDS.quality]) {
      result.fundamentals[field] = isValidValue((fund as any)?.[field]);
    }

    // Check technical
    const tech = await yf.getTechnicalMetrics(symbol);
    for (const field of [...REQUIRED_FIELDS.technical, ...REQUIRED_FIELDS.risk]) {
      result.technical[field] = isValidValue((tech as any)?.[field]);
    }
  } catch (error) {
    // Symbol failed - all fields false
  }

  return result;
}

function calculatePillarHealth(
  symbolResults: Array<{
    symbol: string;
    fundamentals: Record<string, boolean>;
    technical: Record<string, boolean>;
  }>,
  pillar: 'valuation' | 'quality' | 'technical' | 'risk'
): PillarHealth {
  const fields =
    pillar === 'valuation'
      ? REQUIRED_FIELDS.valuation
      : pillar === 'quality'
      ? REQUIRED_FIELDS.quality
      : pillar === 'technical'
      ? REQUIRED_FIELDS.technical
      : REQUIRED_FIELDS.risk;

  const dataSource = pillar === 'valuation' || pillar === 'quality' ? 'fundamentals' : 'technical';

  const fieldCoverage: Record<string, FieldCoverage> = {};

  for (const field of fields) {
    const okSymbols = symbolResults.filter((r) => r[dataSource][field]);
    const missingSymbols = symbolResults
      .filter((r) => !r[dataSource][field])
      .map((r) => r.symbol);

    fieldCoverage[field] = {
      okCount: okSymbols.length,
      okPct: Math.round((okSymbols.length / symbolResults.length) * 1000) / 10,
      missingSymbols: missingSymbols.slice(0, 10),
    };
  }

  // Calculate average field coverage
  const avgFieldCoverage =
    fields.reduce((sum, f) => sum + fieldCoverage[f].okPct, 0) / fields.length;

  // Pillar is viable if average coverage >= 70%
  const viable = avgFieldCoverage >= 70;

  // Score: 0-100 based on coverage
  const score = Math.round(avgFieldCoverage);

  return { score, avgFieldCoverage, fieldCoverage, viable };
}

function calculateUniverseHealthScore(
  priceOkPct: number,
  pillarHealth: {
    valuation: PillarHealth;
    quality: PillarHealth;
    technical: PillarHealth;
    risk: PillarHealth;
  }
): number {
  // Price history is must-have
  if (priceOkPct < 90) return 40; // Max 40 if price coverage is poor

  // Calculate fundamental coverage (valuation + quality)
  const fundamentalScore = (pillarHealth.valuation.score + pillarHealth.quality.score) / 2;

  // Calculate technical/risk coverage
  const technicalScore = (pillarHealth.technical.score + pillarHealth.risk.score) / 2;

  // Overall health: 30% price, 40% fundamental, 30% technical
  const health = Math.round(priceOkPct * 0.3 + fundamentalScore * 0.4 + technicalScore * 0.3);

  return Math.min(100, health);
}

function classifyUniverse(
  priceOkPct: number,
  pillarHealth: {
    valuation: PillarHealth;
    quality: PillarHealth;
    technical: PillarHealth;
    risk: PillarHealth;
  }
): { class: 'PRODUCTION' | 'LIMITED' | 'NOT_RECOMMENDED'; recommendation: string } {
  // NOT_RECOMMENDED: Price coverage < 90%
  if (priceOkPct < 90) {
    return {
      class: 'NOT_RECOMMENDED',
      recommendation: `Poor price coverage (${priceOkPct}%) - insufficient for backtesting`,
    };
  }

  // PRODUCTION: Price >= 95%, Valuation >= 70%, Quality >= 70%
  if (
    priceOkPct >= 95 &&
    pillarHealth.valuation.avgFieldCoverage >= 70 &&
    pillarHealth.quality.avgFieldCoverage >= 70
  ) {
    return {
      class: 'PRODUCTION',
      recommendation: 'Full 4-pillar scoring supported with high confidence',
    };
  }

  // LIMITED: Price >= 90% but fundamentals insufficient
  const missingPillars = [];
  if (pillarHealth.valuation.avgFieldCoverage < 70) missingPillars.push('valuation');
  if (pillarHealth.quality.avgFieldCoverage < 70) missingPillars.push('quality');

  return {
    class: 'LIMITED',
    recommendation: `Technical-only or partial scoring recommended. Weak pillars: ${missingPillars.join(', ')}`,
  };
}

async function runFieldCoverageAudit(
  universeId: string,
  file: string,
  opts: { throttleMs: number; concurrency: number; sampleSize?: number }
): Promise<AuditResult> {
  const pack = loadUniverse(file);
  let symbols = pack.symbols;

  // Sample if too large (for faster testing)
  if (opts.sampleSize && symbols.length > opts.sampleSize) {
    console.log(`  Sampling ${opts.sampleSize} of ${symbols.length} symbols for speed...`);
    symbols = symbols.slice(0, opts.sampleSize);
  }

  const yf = new YFinanceProvider();

  const symbolResults: Array<{
    symbol: string;
    hasPrice: boolean;
    fundamentals: Record<string, boolean>;
    technical: Record<string, boolean>;
  }> = [];

  // Process symbols with concurrency control
  const queue = [...symbols];
  let active = 0;
  let index = 0;

  async function worker(symbol: string) {
    active += 1;
    try {
      const result = await analyzeSymbol(yf, symbol, opts.throttleMs);
      symbolResults.push(result);
    } catch (err) {
      symbolResults.push({
        symbol,
        hasPrice: false,
        fundamentals: {},
        technical: {},
      });
    } finally {
      active -= 1;
    }
  }

  const pending: Promise<void>[] = [];
  while (index < queue.length || active > 0) {
    while (active < opts.concurrency && index < queue.length) {
      const sym = queue[index++];
      pending.push(worker(sym));
    }
    await Promise.race([Promise.all(pending), sleep(50)]);
  }

  // Calculate pillar health
  const pillarHealth = {
    valuation: calculatePillarHealth(symbolResults, 'valuation'),
    quality: calculatePillarHealth(symbolResults, 'quality'),
    technical: calculatePillarHealth(symbolResults, 'technical'),
    risk: calculatePillarHealth(symbolResults, 'risk'),
  };

  // Price coverage
  const priceOk = symbolResults.filter((r) => r.hasPrice).length;
  const priceOkPct = Math.round((priceOk / symbols.length) * 1000) / 10;

  // Universe health score
  const universeHealthScore = calculateUniverseHealthScore(priceOkPct, pillarHealth);

  // Classification
  const { class: productionClass, recommendation } = classifyUniverse(
    priceOkPct,
    pillarHealth
  );

  const result: AuditResult = {
    universe_id: universeId,
    name: pack.name,
    symbol_count: symbols.length,
    price_coverage: { ok: priceOk, pct: priceOkPct },
    pillar_health: pillarHealth,
    universe_health_score: universeHealthScore,
    production_class: productionClass,
    recommendation,
    sampled_at: new Date().toISOString(),
  };

  // Save to file
  const auditDir = ensureAuditDir();
  fs.writeFileSync(
    path.join(auditDir, `${universeId}.json`),
    JSON.stringify(result, null, 2)
  );

  return result;
}

function printFieldCoverageTable(result: AuditResult) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Universe: ${result.name} (${result.universe_id})`);
  console.log(`Symbols: ${result.symbol_count} | Health Score: ${result.universe_health_score}/100`);
  console.log(`Classification: ${result.production_class}`);
  console.log(`Recommendation: ${result.recommendation}`);
  console.log(`${'='.repeat(80)}\n`);

  console.log('Price Coverage:');
  console.log(
    `  ✓ ${result.price_coverage.ok}/${result.symbol_count} (${result.price_coverage.pct}%)\n`
  );

  for (const [pillar, health] of Object.entries(result.pillar_health)) {
    const statusIcon = health.viable ? '✅' : '❌';
    console.log(
      `${statusIcon} ${pillar.toUpperCase()} Pillar: ${health.score}/100 (avg ${health.avgFieldCoverage.toFixed(1)}%)`
    );

    for (const [field, coverage] of Object.entries(health.fieldCoverage)) {
      const fieldIcon = coverage.okPct >= 70 ? '  ✓' : '  ✗';
      console.log(
        `${fieldIcon} ${field.padEnd(20)}: ${coverage.okCount}/${result.symbol_count} (${coverage.okPct}%)`
      );
    }
    console.log();
  }

  // Top 5 worst fields
  const allFields = Object.entries(result.pillar_health).flatMap(([pillar, health]) =>
    Object.entries(health.fieldCoverage).map(([field, coverage]) => ({
      pillar,
      field,
      pct: coverage.okPct,
    }))
  );
  allFields.sort((a, b) => a.pct - b.pct);

  console.log('Top 5 Weakest Fields:');
  for (const f of allFields.slice(0, 5)) {
    console.log(`  - ${f.pillar}.${f.field}: ${f.pct}%`);
  }
  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  const universeArg = args.find((a) => a.startsWith('--universe='));
  const sampleArg = args.find((a) => a.startsWith('--sample='));
  const all = args.includes('--all');

  const sampleSize = sampleArg ? parseInt(sampleArg.split('=')[1]) : undefined;

  if (!universeArg && !all) {
    console.error('Usage: tsx field_coverage_audit.ts --universe=<id> [--sample=N]');
    console.error('   or: tsx field_coverage_audit.ts --all [--sample=N]');
    process.exit(1);
  }

  const universesDir = path.join(process.cwd(), 'config/universes');
  const files = fs.readdirSync(universesDir).filter((f) => f.endsWith('.json'));

  let targets: string[];
  if (all) {
    targets = files.filter((f) => f.endsWith('_full.json')).map((f) => f.replace('.json', ''));
  } else {
    const selectedId = universeArg!.split('=')[1];
    targets = [selectedId];
  }

  for (const universeId of targets) {
    const file = path.join(universesDir, `${universeId}.json`);
    if (!fs.existsSync(file)) {
      console.error(`Universe file not found: ${file}`);
      continue;
    }

    console.log(`\nProcessing ${universeId}...`);
    const result = await runFieldCoverageAudit(universeId, file, {
      throttleMs: DEFAULT_THROTTLE_MS,
      concurrency: DEFAULT_CONCURRENCY,
      sampleSize,
    });

    printFieldCoverageTable(result);
  }
}

main().catch((err) => {
  console.error('Field coverage audit failed:', err);
  process.exit(1);
});
