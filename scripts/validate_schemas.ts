/**
 * Schema Validation Script
 * Validates that all JSON schemas are valid and can compile validators
 *
 * Usage: npx tsx scripts/validate_schemas.ts
 */

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const schemasDir = join(process.cwd(), 'schemas');

console.log('Validating schemas...\n');

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
});
addFormats(ajv);

let hasErrors = false;

const files = readdirSync(schemasDir).filter((f) => f.endsWith('.json'));

for (const file of files) {
  const schemaPath = join(schemasDir, file);
  const schemaContent = readFileSync(schemaPath, 'utf-8');

  try {
    const schema = JSON.parse(schemaContent);

    // Try to compile the schema
    const validate = ajv.compile(schema);

    console.log(`✓ ${file}`);
    console.log(`  ID: ${schema.$id}`);
    console.log(`  Required: ${schema.required?.join(', ') || 'none'}`);
    console.log('');
  } catch (error) {
    hasErrors = true;
    console.log(`✗ ${file}`);
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
    console.log('');
  }
}

if (hasErrors) {
  console.log('\nSchema validation FAILED');
  process.exit(1);
} else {
  console.log(`All ${files.length} schemas validated successfully`);
}
