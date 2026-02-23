import { describe, expect, it } from 'vitest';
import { calculateDistribution } from '@/lib/quality/observatory';

describe('quality observatory math helpers', () => {
  it('ignores null/undefined values in distribution calculations', () => {
    const stats = calculateDistribution([null, 10, undefined, 20, 30, null]);
    expect(stats.avg).toBe(20);
    expect(stats.p25).toBe(10);
    expect(stats.p50).toBe(20);
    expect(stats.p75).toBe(20);
  });

  it('returns null stats when no finite values are provided', () => {
    const stats = calculateDistribution([null, undefined, Number.NaN]);
    expect(stats).toEqual({
      avg: null,
      p25: null,
      p50: null,
      p75: null,
    });
  });
});
