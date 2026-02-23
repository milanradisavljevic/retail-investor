/**
 * Daily Run Script
 * Executes the full scoring pipeline and generates run.json
 *
 * Usage: npx tsx scripts/run_daily.ts
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

// Load .env.local first, then fall back to .env
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config(); // Also load .env for any missing variables
import { initializeDatabase, closeDatabase } from '../src/data/db';
import { scoreUniverse } from '../src/scoring/engine';
import { buildRunRecord } from '../src/run/builder';
import { writeRunRecord } from '../src/run/writer';
import { validateAndThrow, checkRunConsistency } from '../src/run/validator';
import { generateLlmOutput } from '../src/llm/adapter';
import { createChildLogger } from '../src/utils/logger';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { LiveRunFilterConfig } from '../src/scoring/filters';
import { updateCompanyNames } from './data-maintenance/fetch-company-names';
import { resolvePythonExecutable } from '../src/utils/python';
import {
  buildQualityObservatory,
  persistQualityObservatorySnapshot,
} from '../src/lib/quality/observatory';

const logger = createChildLogger('run_daily');

interface DailyRunCliArgs {
  filters: Partial<LiveRunFilterConfig> | undefined;
  secSyncEnabled: boolean;
  secCompanyfactsDir: string;
  secCompanyTickersPath: string;
  secDbPath: string;
  secUniverseOverride?: string;
  qualityObservatoryEnabled: boolean;
  qualityObservatoryUniverses: string[];
}

function parseBooleanLike(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return null;
}

function parseFlagOrEnvBoolean(flagName: string, envName: string): boolean {
  const directFlag = process.argv.includes(flagName);
  const equalsArg = process.argv.find((arg) => arg.startsWith(`${flagName}=`));
  if (directFlag) return true;
  if (equalsArg) {
    const raw = equalsArg.split('=')[1] ?? '';
    const parsed = parseBooleanLike(raw);
    if (parsed !== null) return parsed;
  }

  const envRaw = process.env[envName];
  if (!envRaw) return false;
  const envParsed = parseBooleanLike(envRaw);
  return envParsed === true;
}

function applyCliArgs(): DailyRunCliArgs {
  const universeEqArg = process.argv.find((arg) => arg.startsWith('--universe='));
  const universePosArgIndex = process.argv.findIndex((arg) => arg === '--universe');
  const universePosArg = universePosArgIndex >= 0 ? process.argv[universePosArgIndex + 1] : undefined;
  const universeValue = universeEqArg?.split('=')[1] ?? universePosArg;
  if (universeValue) {
    process.env.UNIVERSE = universeValue;
    process.env.UNIVERSE_CONFIG = universeValue;
    logger.info({ universe: universeValue }, 'Using universe from CLI flag');
  }

  const presetEqArg = process.argv.find((arg) => arg.startsWith('--preset='));
  const presetPosArgIndex = process.argv.findIndex((arg) => arg === '--preset');
  const presetPosArg = presetPosArgIndex >= 0 ? process.argv[presetPosArgIndex + 1] : undefined;
  const presetValue = presetEqArg?.split('=')[1] ?? presetPosArg;
  if (presetValue) {
    process.env.SCORING_PRESET = presetValue;
    logger.info({ preset: presetValue }, 'Using scoring preset from CLI flag');
  }

  const filtersArg = process.argv.find((arg) => arg.startsWith('--filters='));
  let filters: Partial<LiveRunFilterConfig> | undefined = undefined;
  if (filtersArg) {
    try {
      const value = filtersArg.split('=')[1];
      if (value) {
        filters = JSON.parse(value) as Partial<LiveRunFilterConfig>;
        logger.info({ filters }, 'Using filters from CLI flag');
      }
    } catch (err) {
      logger.warn({ error: err }, 'Failed to parse filters arg, ignoring');
    }
  }

  const secSyncEnabled = parseFlagOrEnvBoolean('--sec-sync', 'SEC_SYNC_BEFORE_RUN');
  const secCompanyfactsDirArg = process.argv.find((arg) =>
    arg.startsWith('--sec-companyfacts-dir=')
  );
  const secCompanyTickersArg = process.argv.find((arg) =>
    arg.startsWith('--sec-company-tickers=')
  );
  const secDbPathArg = process.argv.find((arg) => arg.startsWith('--sec-db-path='));
  const secUniverseArg = process.argv.find((arg) => arg.startsWith('--sec-universe='));
  const observatoryEnabled = parseFlagOrEnvBoolean(
    '--quality-observatory',
    'QUALITY_OBSERVATORY_AFTER_RUN'
  );
  const observatoryUniversesArg = process.argv.find((arg) =>
    arg.startsWith('--quality-observatory-universes=')
  );
  const observatoryUniverseRaw =
    observatoryUniversesArg?.split('=')[1] ??
    process.env.QUALITY_OBSERVATORY_UNIVERSES ??
    'nasdaq100,sp500-full,russell2000_full';

  return {
    filters,
    secSyncEnabled,
    secCompanyfactsDir:
      secCompanyfactsDirArg?.split('=')[1] ??
      process.env.SEC_COMPANYFACTS_DIR ??
      'data/sec/companyfacts',
    secCompanyTickersPath:
      secCompanyTickersArg?.split('=')[1] ??
      process.env.SEC_COMPANY_TICKERS_PATH ??
      'data/sec/company_tickers.json',
    secDbPath:
      secDbPathArg?.split('=')[1] ?? process.env.SEC_SYNC_DB_PATH ?? 'data/privatinvestor.db',
    secUniverseOverride: secUniverseArg?.split('=')[1],
    qualityObservatoryEnabled: observatoryEnabled,
    qualityObservatoryUniverses: observatoryUniverseRaw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  };
}

function resolveSecUniverseName(inputUniverse?: string): string | null {
  const raw = (inputUniverse ?? process.env.UNIVERSE_CONFIG ?? process.env.UNIVERSE ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return null;

  const aliases: Record<string, string> = {
    nasdaq100: 'nasdaq100',
    'nasdaq100-full': 'nasdaq100-full',
    sp500: 'sp500-full',
    'sp500-full': 'sp500-full',
    russell2000: 'russell2000_full',
    russell2000_full: 'russell2000_full',
    russell2000full: 'russell2000_full',
  };

  const candidates = [
    aliases[raw],
    raw,
    raw.replace(/_/g, '-'),
    raw.replace(/-/g, '_'),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(resolve(process.cwd(), 'config', 'universes', `${candidate}.json`))) {
      return candidate;
    }
  }

  return null;
}

function runSecSyncBeforeScoring(args: DailyRunCliArgs): void {
  if (!args.secSyncEnabled) return;

  const secUniverse = resolveSecUniverseName(args.secUniverseOverride);
  if (!secUniverse) {
    logger.info(
      {
        universe: args.secUniverseOverride ?? process.env.UNIVERSE_CONFIG ?? process.env.UNIVERSE,
      },
      'SEC sync requested but no matching universe config found; skipping'
    );
    return;
  }

  if (!existsSync(args.secCompanyfactsDir)) {
    throw new Error(`SEC sync enabled but companyfacts dir missing: ${args.secCompanyfactsDir}`);
  }
  if (!existsSync(args.secCompanyTickersPath)) {
    throw new Error(`SEC sync enabled but company_tickers path missing: ${args.secCompanyTickersPath}`);
  }

  const python = resolvePythonExecutable();
  const cmdArgs = [
    'scripts/etl/sec_edgar_bulk_audit.py',
    '--companyfacts-dir',
    args.secCompanyfactsDir,
    '--company-tickers',
    args.secCompanyTickersPath,
    '--universe',
    secUniverse,
    '--db-path',
    args.secDbPath,
    '--write-db',
  ];

  logger.info(
    {
      python,
      universe: secUniverse,
      companyfactsDir: args.secCompanyfactsDir,
      companyTickers: args.secCompanyTickersPath,
      dbPath: args.secDbPath,
    },
    'Running SEC sync preflight'
  );

  const result = spawnSync(python, cmdArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    throw new Error(
      `SEC sync failed (exit ${result.status ?? 'unknown'}): ${result.stderr?.trim() || result.stdout?.trim() || 'no output'}`
    );
  }

  const outputPreview = (result.stdout ?? '').trim().split('\n').slice(-10).join('\n');
  logger.info({ universe: secUniverse, outputPreview }, 'SEC sync preflight complete');
}

async function main() {
  const startTime = Date.now();
  logger.info('Starting daily run');

  try {
    const cliArgs = applyCliArgs();
    const { filters } = cliArgs;

    // Refresh company names so new symbols always render readable names
    try {
      await updateCompanyNames();
    } catch (error) {
      logger.warn({ error }, 'Company name update failed, continuing with existing map');
    }

    runSecSyncBeforeScoring(cliArgs);

    // Initialize database
    initializeDatabase();

    // Score the universe
    logger.info('Scoring universe...');
    const scoringResult = await scoreUniverse(filters);

    logger.info(
      {
        symbolCount: scoringResult.metadata.symbolCount,
        requestsMade: scoringResult.metadata.requestsMade,
        errors: scoringResult.metadata.errors.length,
      },
      'Scoring complete'
    );

    // Build run record
    logger.info('Building run record...');
    const runRecord = buildRunRecord(scoringResult);

    // Validate against schema
    logger.info('Validating run record...');
    validateAndThrow(runRecord);

    // Check consistency
    const consistency = checkRunConsistency(runRecord);
    if (!consistency.passed) {
      logger.warn({ issues: consistency.issues }, 'Run consistency issues detected');
    }

    // Write run record
    const writeResult = writeRunRecord(runRecord);
    logger.info(
      { runId: writeResult.runId, filePath: writeResult.filePath },
      'Run record written'
    );

    // Generate LLM output (if enabled)
    logger.info('Generating LLM output...');
    const llmOutput = await generateLlmOutput(runRecord);

    // Write LLM output
    const llmPath = join(
      process.cwd(),
      'data',
      'runs',
      `${runRecord.run_id}_llm.json`
    );
    writeFileSync(llmPath, JSON.stringify(llmOutput, null, 2));
    logger.info({ llmPath }, 'LLM output written');

    if (cliArgs.qualityObservatoryEnabled) {
      logger.info(
        { universes: cliArgs.qualityObservatoryUniverses },
        'Building quality observatory snapshot'
      );
      const observatory = buildQualityObservatory(cliArgs.qualityObservatoryUniverses);
      const persisted = persistQualityObservatorySnapshot(observatory);
      logger.info(
        { observatoryDir: persisted.dir, latestFile: persisted.latestFile },
        'Quality observatory snapshot written'
      );
      console.log(`Quality Observatory: ${persisted.latestFile}`);
    }

    // Summary
    const duration = (Date.now() - startTime) / 1000;
    console.log('\n' + '='.repeat(50));
    console.log('DAILY RUN COMPLETE');
    console.log('='.repeat(50));
    console.log(`Run ID:        ${runRecord.run_id}`);
    console.log(`As of Date:    ${runRecord.as_of_date}`);
    console.log(`Symbols:       ${runRecord.scores.length}`);
    console.log(`Requests:      ${scoringResult.metadata.requestsMade}`);
    console.log(`Duration:      ${duration.toFixed(1)}s`);
    console.log(`Pick of Day:   ${runRecord.selections.pick_of_the_day}`);

    if (scoringResult.metadata.filtersApplied) {
      const fa = scoringResult.metadata.filtersApplied;
      console.log(`\nFilters Applied:`);
      if (fa.config.excludeCryptoMining) console.log(`  - Crypto Mining: ${fa.removedByReason.crypto_mining.length} excluded`);
      if (fa.config.excludeDefense) console.log(`  - Defense: ${fa.removedByReason.defense.length} excluded`);
      if (fa.config.excludeFossilFuels) console.log(`  - Fossil Fuels: ${fa.removedByReason.fossil_fuel.length} excluded`);
      console.log(`  - Total Filtered: ${fa.removedCount} symbols`);
    }

    console.log('\nTop 5:');
    runRecord.selections.top5.forEach((symbol, i) => {
      const score = runRecord.scores.find((s) => s.symbol === symbol);
      console.log(`  ${i + 1}. ${symbol} - ${score?.total_score.toFixed(1)}/100`);
    });

    if (runRecord.flags.user_documents_missing.length > 0) {
      console.log('\nDocuments Requested:');
      runRecord.flags.user_documents_missing.forEach((symbol) => {
        console.log(`  - ${symbol}`);
      });
    }

    console.log('\nOutput Files:');
    console.log(`  - ${writeResult.filePath}`);
    console.log(`  - ${llmPath}`);
    console.log('='.repeat(50) + '\n');

  } catch (error) {
    logger.error({ error }, 'Daily run failed');
    console.error('Daily run failed:', error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

main().catch(console.error);
