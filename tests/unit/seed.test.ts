import { describe, it, expect } from 'vitest';
import {
  deterministicHash,
  deterministicSeed,
  pickDeterministic,
  contentHash,
} from '@/core/seed';

describe('seed', () => {
  describe('deterministicHash', () => {
    it('produces consistent hash for same input', () => {
      const hash1 = deterministicHash('test-input');
      const hash2 = deterministicHash('test-input');
      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different input', () => {
      const hash1 = deterministicHash('input-a');
      const hash2 = deterministicHash('input-b');
      expect(hash1).not.toBe(hash2);
    });

    it('returns 64-character hex string', () => {
      const hash = deterministicHash('any-input');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('deterministicSeed', () => {
    it('produces consistent seed for same date', () => {
      const seed1 = deterministicSeed('2026-01-10');
      const seed2 = deterministicSeed('2026-01-10');
      expect(seed1).toBe(seed2);
    });

    it('produces different seeds for different dates', () => {
      const seed1 = deterministicSeed('2026-01-10');
      const seed2 = deterministicSeed('2026-01-11');
      expect(seed1).not.toBe(seed2);
    });

    it('includes salt in seed calculation', () => {
      const seed1 = deterministicSeed('2026-01-10', 'SALT_A');
      const seed2 = deterministicSeed('2026-01-10', 'SALT_B');
      expect(seed1).not.toBe(seed2);
    });
  });

  describe('pickDeterministic', () => {
    it('picks consistently from array', () => {
      const items = ['A', 'B', 'C', 'D', 'E'];
      const seed = 12345;
      const pick1 = pickDeterministic(items, seed);
      const pick2 = pickDeterministic(items, seed);
      expect(pick1).toBe(pick2);
    });

    it('picks different items for different seeds', () => {
      const items = ['A', 'B', 'C', 'D', 'E'];
      const picks = new Set([
        pickDeterministic(items, 1),
        pickDeterministic(items, 2),
        pickDeterministic(items, 3),
        pickDeterministic(items, 4),
        pickDeterministic(items, 5),
      ]);
      // With 5 different seeds and 5 items, we should get multiple different picks
      expect(picks.size).toBeGreaterThan(1);
    });

    it('throws for empty array', () => {
      expect(() => pickDeterministic([], 123)).toThrow();
    });

    it('returns only element for single-item array', () => {
      expect(pickDeterministic(['ONLY'], 999)).toBe('ONLY');
    });
  });

  describe('contentHash', () => {
    it('produces consistent hash for same content', () => {
      const obj = { a: 1, b: 2 };
      const hash1 = contentHash(obj);
      const hash2 = contentHash(obj);
      expect(hash1).toBe(hash2);
    });

    it('produces same hash regardless of key order', () => {
      const hash1 = contentHash({ a: 1, b: 2 });
      const hash2 = contentHash({ b: 2, a: 1 });
      expect(hash1).toBe(hash2);
    });
  });
});
