/**
 * Daily Run Script
 * Executes the full scoring pipeline and generates run.json
 *
 * Usage: npx tsx scripts/run_daily.ts
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

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
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { LiveRunFilterConfig } from '../src/scoring/filters';
import { updateCompanyNames } from './data-maintenance/fetch-company-names';

const logger = createChildLogger('run_daily');

function applyCliArgs(): { filters: Partial<LiveRunFilterConfig> | undefined } {
  const universeArg = process.argv.find((arg) => arg.startsWith('--universe='));
  if (universeArg) {
    const value = universeArg.split('=')[1];
    if (value) {
      process.env.UNIVERSE = value;
      process.env.UNIVERSE_CONFIG = value;
      logger.info({ universe: value }, 'Using universe from CLI flag');
    }
  }

  const presetArg = process.argv.find((arg) => arg.startsWith('--preset='));
  if (presetArg) {
    const value = presetArg.split('=')[1];
    if (value) {
      process.env.SCORING_PRESET = value;
      logger.info({ preset: value }, 'Using scoring preset from CLI flag');
    }
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

  return { filters };
}

async function main() {
  const startTime = Date.now();
  logger.info('Starting daily run');

  try {
    const { filters } = applyCliArgs();

    // Refresh company names so new symbols always render readable names
    try {
      await updateCompanyNames();
    } catch (error) {
      logger.warn({ error }, 'Company name update failed, continuing with existing map');
    }

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
