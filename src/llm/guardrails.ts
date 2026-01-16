/**
 * LLM Guardrails
 * Ensures LLM outputs are constrained and validated
 */

import { validateLlmOutput, type ValidationResult } from '@/validation/ajv_instance';
import { createChildLogger } from '@/utils/logger';
import type { LlmOutputV1SchemaJson } from '@/types/generated/llm_output_v1';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

const logger = createChildLogger('llm_guardrails');

export interface GuardrailCheck {
  passed: boolean;
  violations: string[];
}

export function validateLlmResponse(
  data: unknown
): ValidationResult<LlmOutputV1SchemaJson> {
  const result = validateLlmOutput(data);

  if (!result.valid) {
    logger.warn({ errors: result.errors }, 'LLM output validation failed');
  }

  return result;
}

export function checkConstraints(
  output: LlmOutputV1SchemaJson,
  run: RunV1SchemaJson
): GuardrailCheck {
  const violations: string[] = [];

  // Check required constraints are true
  if (!output.constraints.no_web_scraping) {
    violations.push('no_web_scraping constraint not set');
  }
  if (!output.constraints.no_new_symbols) {
    violations.push('no_new_symbols constraint not set');
  }
  if (!output.constraints.no_new_numbers) {
    violations.push('no_new_numbers constraint not set');
  }

  // Check temperature is 0
  if (output.meta.temperature !== 0) {
    violations.push(`Temperature must be 0, got ${output.meta.temperature}`);
  }

  // Check all narrative symbols match top5
  const top5Set = new Set(run.selections.top5);
  for (const narrative of output.top5_narrative) {
    if (!top5Set.has(narrative.symbol)) {
      violations.push(`Narrative symbol ${narrative.symbol} not in top5`);
    }
  }

  // Check recommendation symbols are valid
  const allSymbols = new Set(run.universe.symbols);
  for (const rec of output.recommendations) {
    if (!allSymbols.has(rec.symbol)) {
      violations.push(`Recommendation symbol ${rec.symbol} not in universe`);
    }
  }

  // Check document requests don't exceed limit
  if (output.document_requests.length > 2) {
    violations.push(`Too many document requests: ${output.document_requests.length} (max 2)`);
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

export function checkForHallucinations(
  output: LlmOutputV1SchemaJson,
  run: RunV1SchemaJson
): string[] {
  const issues: string[] = [];

  // Check that confidence values don't exceed 95 (reasonable max)
  for (const rec of output.recommendations) {
    if (rec.confidence > 95) {
      issues.push(`Unreasonably high confidence for ${rec.symbol}: ${rec.confidence}`);
    }
  }

  // Check that expected insight scores are reasonable
  for (const docReq of output.document_requests) {
    if (docReq.expected_insight_score > 90) {
      issues.push(
        `Unreasonably high expected insight for ${docReq.symbol}: ${docReq.expected_insight_score}`
      );
    }
  }

  // Check narrative lengths (whyNow max 240 chars per schema)
  for (const narrative of output.top5_narrative) {
    if (narrative.why_now.length > 240) {
      issues.push(`why_now too long for ${narrative.symbol}: ${narrative.why_now.length} chars`);
    }
  }

  return issues;
}

export function sanitizeLlmOutput(output: LlmOutputV1SchemaJson): LlmOutputV1SchemaJson {
  // Ensure constraints are set correctly
  // Since the schema types are complex tuples, we need to cast carefully
  return {
    ...output,
    constraints: {
      no_web_scraping: true,
      no_new_symbols: true,
      no_new_numbers: true,
    },
    // Clamp confidence values
    recommendations: output.recommendations.map((r) => ({
      ...r,
      confidence: Math.min(Math.max(r.confidence, 0), 100),
    })),
    // Truncate why_now if too long - preserve the tuple structure
    top5_narrative: output.top5_narrative.map((n) => ({
      ...n,
      why_now: n.why_now.substring(0, 240),
    })) as LlmOutputV1SchemaJson['top5_narrative'],
    // Keep document requests as-is (already validated)
    document_requests: output.document_requests,
  };
}
