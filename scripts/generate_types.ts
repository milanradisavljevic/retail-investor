/**
 * Type generation from JSON schemas
 * Run with: npx tsx scripts/generate_types.ts
 */

import { compileFromFile } from 'json-schema-to-typescript';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const schemas = ['run.v1', 'financial_packet.v1', 'llm_output.v1'];
const projectRoot = process.cwd();
const outDir = join(projectRoot, 'src/types/generated');

async function generateTypes() {
  mkdirSync(outDir, { recursive: true });

  for (const schema of schemas) {
    const schemaPath = join(projectRoot, `schemas/${schema}.schema.json`);
    console.log(`Generating types from ${schema}...`);

    try {
      const ts = await compileFromFile(schemaPath, {
        bannerComment: `/* eslint-disable */\n/**\n * AUTO-GENERATED from ${schema}.schema.json\n * DO NOT EDIT MANUALLY\n */`,
        additionalProperties: false,
        style: {
          singleQuote: true,
          semi: true,
        },
      });

      const outPath = join(outDir, `${schema.replace('.', '_')}.ts`);
      writeFileSync(outPath, ts);
      console.log(`  -> ${outPath}`);
    } catch (error) {
      console.error(`Error generating types for ${schema}:`, error);
      process.exit(1);
    }
  }

  // Generate index file
  const indexContent = schemas
    .map((s) => `export * from './${s.replace('.', '_')}';`)
    .join('\n');
  writeFileSync(join(outDir, 'index.ts'), indexContent + '\n');
  console.log('Type generation complete!');
}

generateTypes().catch(console.error);
