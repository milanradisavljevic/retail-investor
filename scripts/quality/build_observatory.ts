#!/usr/bin/env tsx
/**
 * Build and persist quality observatory snapshots.
 *
 * Example:
 * node --import tsx scripts/quality/build_observatory.ts --universes nasdaq100,sp500-full,russell2000_full
 */

import { buildQualityObservatory, persistQualityObservatorySnapshot } from '@/lib/quality/observatory';

interface CliOptions {
  universes: string[];
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    universes: ['nasdaq100', 'sp500-full', 'russell2000_full'],
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    if (arg === '--universes') {
      const value = argv[i + 1];
      if (value) {
        opts.universes = value
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }
      i += 1;
      continue;
    }
    if (arg.startsWith('--universes=')) {
      const value = arg.split('=')[1] ?? '';
      opts.universes = value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
  }

  return opts;
}

function main(): void {
  const { universes } = parseArgs(process.argv);
  const snapshot = buildQualityObservatory(universes);
  const persisted = persistQualityObservatorySnapshot(snapshot);

  console.log('Quality observatory snapshot generated');
  console.log(`Universes: ${snapshot.universe_ids.join(', ')}`);
  console.log(`Generated at: ${snapshot.generated_at}`);
  console.log(`Snapshot dir: ${persisted.dir}`);
  console.log(`Latest file: ${persisted.latestFile}`);

  for (const universe of snapshot.universes) {
    const gate = universe.quality_gate?.status ?? 'n/a';
    console.log(
      [
        `- ${universe.universe_id}`,
        `snapshot=${universe.snapshot_coverage_pct.toFixed(1)}%`,
        `quality4=${universe.quality4_coverage_pct.toFixed(1)}%`,
        `valuation3=${universe.valuation3_coverage_pct.toFixed(1)}%`,
        `avgDQ=${universe.data_quality.avg ?? 'n/a'}`,
        `pctLow=${universe.data_quality.pct_low ?? 'n/a'}%`,
        `gate=${gate}`,
      ].join(' | ')
    );
  }
}

main();
