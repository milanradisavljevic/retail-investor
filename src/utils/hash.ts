/**
 * Hashing utilities for cache keys and content verification
 */

import { createHash } from 'crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function sha256Short(input: string, length: number = 12): string {
  return sha256(input).substring(0, length);
}

export function hashObject(obj: unknown): string {
  const normalized = JSON.stringify(obj, Object.keys(obj as object).sort());
  return sha256(normalized);
}

export function hashObjectShort(obj: unknown, length: number = 12): string {
  return hashObject(obj).substring(0, length);
}
