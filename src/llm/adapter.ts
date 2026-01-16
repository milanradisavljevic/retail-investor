/**
 * LLM Adapter
 * Feature-flagged LLM integration with fallback to templates
 */

import { createChildLogger } from '@/utils/logger';
import { contentHash } from '@/core/seed';
import {
  generateMarketSummaryBullets,
  generateSymbolNarrative,
  generateRecommendationLabel,
  getConfidenceFromScore,
} from './templates';
import { validateLlmResponse, checkConstraints, sanitizeLlmOutput } from './guardrails';
import type { LlmOutputV1SchemaJson } from '@/types/generated/llm_output_v1';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

const logger = createChildLogger('llm_adapter');

const PROMPT_VERSION = '0.1.0';

export interface LlmConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | null;
  apiKey: string | null;
}

export function isLlmEnabled(): boolean {
  return process.env.ENABLE_LLM === 'true';
}

export function getLlmConfig(): LlmConfig {
  const enabled = isLlmEnabled();
  const provider = process.env.LLM_PROVIDER as 'openai' | 'anthropic' | null;

  let apiKey: string | null = null;
  if (enabled && provider === 'openai') {
    apiKey = process.env.OPENAI_API_KEY ?? null;
  } else if (enabled && provider === 'anthropic') {
    apiKey = process.env.ANTHROPIC_API_KEY ?? null;
  }

  return { enabled, provider, apiKey };
}

export async function generateLlmOutput(
  run: RunV1SchemaJson
): Promise<LlmOutputV1SchemaJson> {
  const config = getLlmConfig();

  if (!config.enabled || !config.apiKey) {
    logger.info('LLM disabled, using template fallback');
    return generateTemplateFallback(run);
  }

  try {
    logger.info({ provider: config.provider }, 'Generating LLM output');

    // In production, this would call the actual LLM API
    // For MVP, we use the template fallback
    // TODO: Implement actual OpenAI/Anthropic integration
    const output = await callLlmApi(config, run);

    // Validate and sanitize
    const validation = validateLlmResponse(output);
    if (!validation.valid) {
      logger.warn({ errors: validation.errors }, 'LLM output invalid, using fallback');
      return generateTemplateFallback(run);
    }

    const constraints = checkConstraints(validation.data!, run);
    if (!constraints.passed) {
      logger.warn(
        { violations: constraints.violations },
        'LLM output violates constraints, sanitizing'
      );
      return sanitizeLlmOutput(validation.data!);
    }

    return validation.data!;
  } catch (error) {
    logger.error({ error }, 'LLM API call failed, using fallback');
    return generateTemplateFallback(run);
  }
}

async function callLlmApi(
  config: LlmConfig,
  run: RunV1SchemaJson
): Promise<LlmOutputV1SchemaJson> {
  // TODO: Implement actual LLM API calls
  // For now, return template fallback
  // This would use the OpenAI or Anthropic SDK

  // Placeholder for actual implementation:
  // if (config.provider === 'openai') {
  //   return callOpenAI(config.apiKey!, run);
  // } else if (config.provider === 'anthropic') {
  //   return callAnthropic(config.apiKey!, run);
  // }

  return generateTemplateFallback(run);
}

export function generateTemplateFallback(
  run: RunV1SchemaJson
): LlmOutputV1SchemaJson {
  const inputHash = contentHash({
    runId: run.run_id,
    top5: run.selections.top5,
    scores: run.scores.map((s) => ({
      symbol: s.symbol,
      total: s.total_score,
    })),
  });

  // Generate narratives for top 5
  const top5Narratives = run.selections.top5.map((symbol) => {
    const narrative = generateSymbolNarrative(symbol, run);
    return {
      symbol: narrative.symbol,
      why_now: narrative.whyNow,
      thesis_bullets: narrative.thesisBullets,
      risk_bullets: narrative.riskBullets,
    };
  });

  // Generate recommendations for top 5
  const recommendations = run.selections.top5.map((symbol) => {
    const score = run.scores.find((s) => s.symbol === symbol);
    const totalScore = score?.total_score ?? 50;
    const dataIssues = score?.data_quality?.missing_fields?.length ?? 0;

    return {
      symbol,
      label: generateRecommendationLabel(totalScore),
      confidence: getConfidenceFromScore(totalScore, dataIssues),
    };
  });

  // Generate document requests from flags
  type DocRequestItem = {
    symbol: string;
    reason: string;
    requested_docs: ['balance_sheet' | 'income_statement' | 'cash_flow' | 'notes' | 'segment_reporting', ...('balance_sheet' | 'income_statement' | 'cash_flow' | 'notes' | 'segment_reporting')[]];
    questions: [string, string];
    priority: 'high' | 'medium';
    expected_insight_score: number;
  };

  const docRequestItems: DocRequestItem[] = run.flags.user_documents_missing.slice(0, 2).map((symbol) => {
    const score = run.scores.find((s) => s.symbol === symbol);
    const lowPillars: string[] = [];

    if (score) {
      const { valuation, quality, technical, risk } = score.evidence;
      if (valuation < 40) lowPillars.push('valuation');
      if (quality < 40) lowPillars.push('quality');
      if (technical < 40) lowPillars.push('technical');
      if (risk < 40) lowPillars.push('risk');
    }

    return {
      symbol,
      reason: `Incomplete data affecting ${lowPillars.join(', ') || 'analysis'}`,
      requested_docs: ['balance_sheet', 'income_statement'] as ['balance_sheet', 'income_statement'],
      questions: [
        'What are the latest reported financial figures?',
        'Are there any significant one-time items affecting results?',
      ] as [string, string],
      priority: 'medium' as const,
      expected_insight_score: 65,
    };
  });

  // Type the document_requests properly for the schema
  const documentRequests: LlmOutputV1SchemaJson['document_requests'] =
    docRequestItems.length === 0
      ? []
      : docRequestItems.length === 1
      ? [docRequestItems[0]]
      : [docRequestItems[0], docRequestItems[1]];

  const output: LlmOutputV1SchemaJson = {
    meta: {
      model: 'template-fallback',
      temperature: 0,
      prompt_version: PROMPT_VERSION,
      input_hash: inputHash,
    },
    market_summary: {
      bullets: generateMarketSummaryBullets(run),
    },
    top5_narrative: top5Narratives as LlmOutputV1SchemaJson['top5_narrative'],
    recommendations,
    document_requests: documentRequests,
    constraints: {
      no_web_scraping: true,
      no_new_symbols: true,
      no_new_numbers: true,
    },
  };

  return output;
}
