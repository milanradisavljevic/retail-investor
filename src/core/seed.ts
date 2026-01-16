/**
 * Deterministic seed generation for reproducible selection
 */

import { createHash } from 'crypto';

export function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function deterministicSeed(runDate: string, salt: string = ''): number {
  const hashInput = `${runDate}${salt}`;
  const hash = deterministicHash(hashInput);
  // Use first 8 hex characters as a number
  return parseInt(hash.substring(0, 8), 16);
}

export function pickDeterministic<T>(items: T[], seed: number): T {
  if (items.length === 0) {
    throw new Error('Cannot pick from empty array');
  }
  const index = seed % items.length;
  return items[index];
}

export function contentHash(content: unknown): string {
  const normalized = stableStringify(content);
  return deterministicHash(normalized);
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }

  const keys = Object.keys(obj).sort();
  const pairs = keys.map(
    (key) => JSON.stringify(key) + ':' + stableStringify((obj as Record<string, unknown>)[key])
  );
  return '{' + pairs.join(',') + '}';
}
