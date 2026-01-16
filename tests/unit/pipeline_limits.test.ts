import { describe, expect, it } from 'vitest';
import { applySymbolLimit } from '@/scoring/engine';

describe('pipeline limits', () => {
  it('truncates deterministically to the first N symbols', () => {
    const symbols = ['BBB', 'AAA', 'CCC', 'DDD'];
    const { symbolsToScore, truncated } = applySymbolLimit(symbols, 2);

    expect(truncated).toBe(true);
    expect(symbolsToScore).toEqual(['BBB', 'AAA']);
  });

  it('keeps full list when max is not set or larger', () => {
    const symbols = ['AAA', 'BBB'];
    expect(applySymbolLimit(symbols, undefined).truncated).toBe(false);
    expect(applySymbolLimit(symbols, 5).symbolsToScore).toEqual(symbols);
  });
});
