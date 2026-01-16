import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getUniverse, getUniverseInfo } from '@/core/universe';
import { resetConfig } from '@/core/config';

let originalCwd: string;
let tempDir: string;
const originalUniverseEnv = process.env.UNIVERSE;

describe('universe loader packs', () => {
  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), 'universe-pack-'));
    process.chdir(tempDir);
    mkdirSync(join('config', 'universes'), { recursive: true });
    writeFileSync(
      join('config', 'cache_ttl.json'),
      JSON.stringify({
        prices_ttl_hours: 1,
        fundamentals_ttl_days: 1,
        news_ttl_minutes: 1,
        profile_ttl_days: 1,
      })
    );
    writeFileSync(
      join('config', 'universes', 'sample.json'),
      JSON.stringify({
        name: 'Sample Pack',
        provider: 'finnhub',
        benchmark: 'SPY',
        symbols: ['abc', 'def'],
      })
    );
    process.env.UNIVERSE = 'sample';
  });

  afterEach(() => {
    resetConfig();
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    if (originalUniverseEnv === undefined) {
      delete process.env.UNIVERSE;
    } else {
      process.env.UNIVERSE = originalUniverseEnv;
    }
  });

  it('loads universe packs by name and normalizes symbols', () => {
    const universe = getUniverse();
    const info = getUniverseInfo();

    expect(universe).toEqual(['ABC', 'DEF']);
    expect(info.name).toBe('Sample Pack');
    expect(info.symbolCount).toBe(2);
  });
});
