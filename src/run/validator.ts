/**
 * Run Validator
 * Validates run records against the schema
 */

import { validateRun, type ValidationResult } from '@/validation/ajv_instance';
import { createChildLogger } from '@/utils/logger';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

const logger = createChildLogger('run_validator');

export function validateRunRecord(data: unknown): ValidationResult<RunV1SchemaJson> {
  const result = validateRun(data);

  if (!result.valid) {
    logger.error({ errors: result.errors }, 'Run validation failed');
  } else {
    logger.debug('Run validation passed');
  }

  return result;
}

export function isValidRun(data: unknown): data is RunV1SchemaJson {
  return validateRun(data).valid;
}

export function validateAndThrow(data: unknown): RunV1SchemaJson {
  const result = validateRun(data);

  if (!result.valid) {
    throw new Error(
      `Run validation failed: ${result.errors?.join('; ') ?? 'Unknown error'}`
    );
  }

  return result.data!;
}

export interface ConsistencyCheck {
  passed: boolean;
  issues: string[];
}

export function checkRunConsistency(run: RunV1SchemaJson): ConsistencyCheck {
  const issues: string[] = [];

  // Check top5 is subset of top10
  const top10Set = new Set(run.selections.top10);
  for (const symbol of run.selections.top5) {
    if (!top10Set.has(symbol)) {
      issues.push(`Top5 symbol ${symbol} not in Top10`);
    }
  }

  // Check pick of day is in top5
  if (!run.selections.top5.includes(run.selections.pick_of_the_day)) {
    issues.push(`Pick of day ${run.selections.pick_of_the_day} not in Top5`);
  }

  // Check all scores are in valid range
  for (const score of run.scores) {
    if (score.total_score < 0 || score.total_score > 100) {
      issues.push(`Invalid total score for ${score.symbol}: ${score.total_score}`);
    }

    const { valuation, quality, technical, risk } = score.evidence;
    if (
      [valuation, quality, technical, risk].some((v) => v < 0 || v > 100)
    ) {
      issues.push(`Invalid evidence scores for ${score.symbol}`);
    }
  }

  // Check symbol count matches universe
  if (run.scores.length !== run.universe.symbols.length) {
    issues.push(
      `Score count (${run.scores.length}) doesn't match universe count (${run.universe.symbols.length})`
    );
  }

  // Check all universe symbols have scores
  const scoredSymbols = new Set(run.scores.map((s) => s.symbol));
  for (const symbol of run.universe.symbols) {
    if (!scoredSymbols.has(symbol)) {
      issues.push(`Missing score for universe symbol: ${symbol}`);
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}
