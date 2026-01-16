/**
 * Ajv validation instance with schema validators
 * Schemas are the Source of Truth - all outputs must validate
 */

import Ajv2020, { ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { loadSchema } from './schema_loader';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';
import type { FinancialPacketV1SchemaJson } from '@/types/generated/financial_packet_v1';
import type { LlmOutputV1SchemaJson } from '@/types/generated/llm_output_v1';

// Create Ajv instance with Draft 2020-12 support
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictTypes: true,
  strictTuples: true,
  allowUnionTypes: true,
});

// Add format validators (date, email, uri, etc.)
addFormats(ajv);

// Lazy-loaded validators
let runValidator: ValidateFunction<RunV1SchemaJson> | null = null;
let financialPacketValidator: ValidateFunction<FinancialPacketV1SchemaJson> | null = null;
let llmOutputValidator: ValidateFunction<LlmOutputV1SchemaJson> | null = null;

export function getRunValidator(): ValidateFunction<RunV1SchemaJson> {
  if (!runValidator) {
    const schema = loadSchema('run.v1');
    runValidator = ajv.compile<RunV1SchemaJson>(schema);
  }
  return runValidator;
}

export function getFinancialPacketValidator(): ValidateFunction<FinancialPacketV1SchemaJson> {
  if (!financialPacketValidator) {
    const schema = loadSchema('financial_packet.v1');
    financialPacketValidator = ajv.compile<FinancialPacketV1SchemaJson>(schema);
  }
  return financialPacketValidator;
}

export function getLlmOutputValidator(): ValidateFunction<LlmOutputV1SchemaJson> {
  if (!llmOutputValidator) {
    const schema = loadSchema('llm_output.v1');
    llmOutputValidator = ajv.compile<LlmOutputV1SchemaJson>(schema);
  }
  return llmOutputValidator;
}

export interface ValidationResult<T> {
  valid: boolean;
  data: T | null;
  errors: string[] | null;
}

export function validateRun(data: unknown): ValidationResult<RunV1SchemaJson> {
  const validate = getRunValidator();
  const valid = validate(data);

  if (valid) {
    return { valid: true, data: data as RunV1SchemaJson, errors: null };
  }

  const errors = validate.errors?.map(
    (e) => `${e.instancePath || 'root'}: ${e.message}`
  ) ?? ['Unknown validation error'];

  return { valid: false, data: null, errors };
}

export function validateFinancialPacket(
  data: unknown
): ValidationResult<FinancialPacketV1SchemaJson> {
  const validate = getFinancialPacketValidator();
  const valid = validate(data);

  if (valid) {
    return { valid: true, data: data as FinancialPacketV1SchemaJson, errors: null };
  }

  const errors = validate.errors?.map(
    (e) => `${e.instancePath || 'root'}: ${e.message}`
  ) ?? ['Unknown validation error'];

  return { valid: false, data: null, errors };
}

export function validateLlmOutput(
  data: unknown
): ValidationResult<LlmOutputV1SchemaJson> {
  const validate = getLlmOutputValidator();
  const valid = validate(data);

  if (valid) {
    return { valid: true, data: data as LlmOutputV1SchemaJson, errors: null };
  }

  const errors = validate.errors?.map(
    (e) => `${e.instancePath || 'root'}: ${e.message}`
  ) ?? ['Unknown validation error'];

  return { valid: false, data: null, errors };
}
