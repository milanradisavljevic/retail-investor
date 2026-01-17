// src/lib/scoring/advanced-signals.ts

/** Clamp to [min,max]. */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Soft-cap momentum score calibrated for Small-Cap quarterly returns.
 *
 * Based on Russell 2000 empirical distribution:
 * - 50th percentile: ~0% → Score 50
 * - 75th percentile: ~+25% → Score ~85
 * - 90th percentile: ~+45% → Score ~95
 * - Saturation: +75% → Score 100
 *
 * Prevents discrimination of extreme winners while avoiding
 * unrealistic saturation points (+150% is 3.5x quarterly return).
 *
 * Constraints:
 * f(-1)=0, f(0)=50, f(0.5)=75, f(0.75)=100, and f(x)=100 for x>=0.75
 */
export function momentumSoftCapScore(x: number): number {
  if (!isFinite(x)) return 50; // neutral fallback

  if (x <= -1.0) return 0;

  // Linear section bis x=0.5
  if (x <= 0.5) {
    return 50 * (x + 1);
  }

  // Fade section 0.5 < x < 0.75
  if (x < 0.75) {
    const d = x - 0.5;
    const fadeRange = 0.25; // von 0.5 bis 0.75
    // Quadratische Interpolation: Score steigt von 75 auf 100
    const progress = d / fadeRange;
    return 75 + 25 * (2 * progress - progress * progress);
  }

  // Saturation ab +75%
  return 100;
}

/** Technical score Option A: SMA cross, no overbought penalty. */
export function technicalScoreSMA_Min(sma42: number, sma252: number): number {
  if (!isFinite(sma42) || !isFinite(sma252)) return 50; // neutral fallback (optional)
  return sma42 > sma252 ? 100 : 0;
}

/**
 * Technical score Option B: SMA cross + trend strength.
 * Formula:
 * 50 + 50 * sign(SMA42-SMA252) * min(|SMA42/SMA252 - 1| / 0.05, 1)
 *
 * Adds epsilon for numerical stability.
 */
export function technicalScoreSMA_Strength(
  sma42: number,
  sma252: number,
  tau: number = 0.05,
  eps: number = 1e-12
): number {
  if (!isFinite(sma42) || !isFinite(sma252) || !isFinite(tau) || tau <= 0) return 50;
  if (Math.abs(sma252) < eps) return 50; // avoid division blowups

  const diff = sma42 - sma252;
  const trendSign = diff > eps ? 1 : diff < -eps ? -1 : 0;

  const strength = Math.abs(sma42 / sma252 - 1);
  const scaled = Math.min(strength / tau, 1);

  const v = 50 + 50 * trendSign * scaled;
  return clamp(v, 0, 100);
}
