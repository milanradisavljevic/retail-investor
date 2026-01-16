/**
 * Pick of the Day
 * Deterministic seeded selection from Top 5
 */

import { deterministicSeed, pickDeterministic } from '@/core/seed';

const POTD_SALT = 'POTD';

export function selectPickOfDay(top5: string[], runDate: string): string {
  if (top5.length === 0) {
    throw new Error('Cannot select Pick of Day from empty list');
  }

  if (top5.length === 1) {
    return top5[0];
  }

  // Generate deterministic seed from date
  const seed = deterministicSeed(runDate, POTD_SALT);

  // Pick deterministically
  return pickDeterministic(top5, seed);
}

export function verifyPickOfDay(
  top5: string[],
  runDate: string,
  expectedPick: string
): boolean {
  const actualPick = selectPickOfDay(top5, runDate);
  return actualPick === expectedPick;
}
