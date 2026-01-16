import { describe, it, expect } from 'vitest';
import { selectPickOfDay, verifyPickOfDay } from '@/selection/pick_of_day';
import { deterministicSeed, contentHash } from '@/core/seed';

describe('determinism', () => {
  describe('Pick of Day', () => {
    it('produces identical pick for same date and top5', () => {
      const top5 = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];
      const runDate = '2026-01-10';

      const pick1 = selectPickOfDay(top5, runDate);
      const pick2 = selectPickOfDay(top5, runDate);

      expect(pick1).toBe(pick2);
    });

    it('produces different picks for different dates', () => {
      const top5 = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];

      const picks = new Set<string>();
      for (let day = 1; day <= 30; day++) {
        const runDate = `2026-01-${day.toString().padStart(2, '0')}`;
        picks.add(selectPickOfDay(top5, runDate));
      }

      // Over 30 days, we should see multiple different picks
      expect(picks.size).toBeGreaterThan(1);
    });

    it('verifies pick correctly', () => {
      const top5 = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];
      const runDate = '2026-01-10';
      const pick = selectPickOfDay(top5, runDate);

      expect(verifyPickOfDay(top5, runDate, pick)).toBe(true);
      expect(verifyPickOfDay(top5, runDate, 'WRONG')).toBe(false);
    });
  });

  describe('Content Hash', () => {
    it('produces identical hash for same content', () => {
      const content = {
        scores: [
          { symbol: 'AAPL', total: 75.5 },
          { symbol: 'MSFT', total: 72.3 },
        ],
        runDate: '2026-01-10',
      };

      const hash1 = contentHash(content);
      const hash2 = contentHash(content);

      expect(hash1).toBe(hash2);
    });

    it('produces identical hash regardless of key order', () => {
      const content1 = { a: 1, b: 2, c: 3 };
      const content2 = { c: 3, a: 1, b: 2 };

      expect(contentHash(content1)).toBe(contentHash(content2));
    });

    it('produces different hash for different content', () => {
      const content1 = { scores: [{ symbol: 'AAPL', total: 75.5 }] };
      const content2 = { scores: [{ symbol: 'AAPL', total: 75.6 }] };

      expect(contentHash(content1)).not.toBe(contentHash(content2));
    });
  });

  describe('Seed Generation', () => {
    it('produces consistent seeds', () => {
      const date = '2026-01-10';
      const salt = 'POTD';

      const seed1 = deterministicSeed(date, salt);
      const seed2 = deterministicSeed(date, salt);

      expect(seed1).toBe(seed2);
    });

    it('produces finite positive integers', () => {
      const seed = deterministicSeed('2026-01-10', 'TEST');
      expect(Number.isFinite(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(seed)).toBe(true);
    });
  });
});
