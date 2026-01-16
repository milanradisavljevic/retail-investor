/**
 * Schema loading utility
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export interface Schema {
  $schema: string;
  $id: string;
  type: string;
  required?: string[];
  properties?: Record<string, unknown>;
}

const schemaCache = new Map<string, Schema>();

export function loadSchema(schemaName: string): Schema {
  if (schemaCache.has(schemaName)) {
    return schemaCache.get(schemaName)!;
  }

  const projectRoot = process.cwd();
  const schemaPath = join(projectRoot, 'schemas', `${schemaName}.schema.json`);
  const schemaJson = readFileSync(schemaPath, 'utf-8');
  const schema = JSON.parse(schemaJson) as Schema;

  schemaCache.set(schemaName, schema);
  return schema;
}

export function getRunSchema(): Schema {
  return loadSchema('run.v1');
}

export function getFinancialPacketSchema(): Schema {
  return loadSchema('financial_packet.v1');
}

export function getLlmOutputSchema(): Schema {
  return loadSchema('llm_output.v1');
}
