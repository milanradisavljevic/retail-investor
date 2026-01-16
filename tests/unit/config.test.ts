import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getConfig, resetConfig } from '@/core/config';

let originalCwd: string;
let tempDir: string;
const originalEnv: Record<string, string | undefined> = {};

function setupConfig(dir: string, universeFile: string, universeName: string) {
  const configDir = join(dir, 'config');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, universeFile),
    JSON.stringify({
      name: universeName,
      description: 'test',
      version: '1',
      selection_rule: 'test',
      survivorship_bias_note: 'test',
      symbols: ['AAA'],
    })
  );
  writeFileSync(
    join(configDir, 'cache_ttl.json'),
    JSON.stringify({
      prices_ttl_hours: 1,
      fundamentals_ttl_days: 1,
      news_ttl_minutes: 1,
      profile_ttl_days: 1,
    })
  );
}

describe('config loader with universe override', () => {
  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), 'config-test-'));
    process.chdir(tempDir);
    ['UNIVERSE_CONFIG', 'UNIVERSE_FILE', 'UNIVERSE'].forEach((key) => {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    resetConfig();
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    ['UNIVERSE_CONFIG', 'UNIVERSE_FILE', 'UNIVERSE'].forEach((key) => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  });

  it('loads default universe when no override is set', () => {
    setupConfig(tempDir, 'universe.json', 'Default');
    resetConfig();

    const config = getConfig();
    expect(config.universe.name).toBe('Default');
  });

  it('loads alternative universe when override is set (relative path)', () => {
    setupConfig(tempDir, 'universe.json', 'Default');
    setupConfig(tempDir, 'alt.json', 'Alt');
    process.env.UNIVERSE_CONFIG = 'alt.json';
    resetConfig();

    const config = getConfig();
    expect(config.universe.name).toBe('Alt');
  });

  it('loads alternative universe when override is absolute path', () => {
    setupConfig(tempDir, 'universe.json', 'Default');
    const absPath = join(tempDir, 'custom.json');
    writeFileSync(
      absPath,
      JSON.stringify({
        name: 'Absolute',
        description: 'test',
        version: '1',
        selection_rule: 'test',
        survivorship_bias_note: 'test',
        symbols: ['ZZZ'],
      })
    );
    process.env.UNIVERSE_FILE = absPath;
    resetConfig();

    const config = getConfig();
    expect(config.universe.name).toBe('Absolute');
  });
});
