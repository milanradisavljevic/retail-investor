// tests/unit/advanced-signals.test.ts
import {
  momentumSoftCapScore,
  technicalScoreSMA_Min,
  technicalScoreSMA_Strength
} from "../../src/lib/scoring/advanced-signals";

describe("momentumSoftCapScore", () => {
  it("hits anchor points exactly", () => {
    expect(momentumSoftCapScore(-1.0)).toBe(0);
    expect(momentumSoftCapScore(0.0)).toBe(50);
    expect(momentumSoftCapScore(0.5)).toBe(75);
    expect(momentumSoftCapScore(0.75)).toBe(100);
  });

  it("saturates at 100 for x >= 0.75", () => {
    expect(momentumSoftCapScore(0.75)).toBe(100);
    expect(momentumSoftCapScore(1.0)).toBe(100);
    expect(momentumSoftCapScore(10.0)).toBe(100);
  });

  it("is monotone increasing across key points in fade region", () => {
    const a = momentumSoftCapScore(0.5);
    const b = momentumSoftCapScore(0.6);
    const c = momentumSoftCapScore(0.7);
    const d = momentumSoftCapScore(0.75);

    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(d);
  });

  it("clamps below -1 to 0", () => {
    expect(momentumSoftCapScore(-2.0)).toBe(0);
    expect(momentumSoftCapScore(-1.0001)).toBe(0);
  });

  it("stays within [0, 100] for a range of samples", () => {
    const xs = [-1, -0.5, 0, 0.25, 0.5, 0.6, 0.7, 0.75, 1.0, 3.0];
    for (const x of xs) {
      const v = momentumSoftCapScore(x);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("technicalScoreSMA_Min (Option A)", () => {
  it("returns 100 if SMA42 > SMA252 else 0", () => {
    expect(technicalScoreSMA_Min(101, 100)).toBe(100);
    expect(technicalScoreSMA_Min(100, 100)).toBe(0);
    expect(technicalScoreSMA_Min(99, 100)).toBe(0);
  });
});

describe("technicalScoreSMA_Strength (Option B)", () => {
  it("returns 100 for bullish with >= tau separation", () => {
    // sma42/sma252 - 1 = 0.05 => scaled = 1
    expect(technicalScoreSMA_Strength(105, 100, 0.05)).toBe(100);
  });

  it("returns 75 for bullish with half tau separation", () => {
    // strength=0.025, scaled=0.5 => 50 + 50*1*0.5 = 75
    expect(technicalScoreSMA_Strength(102.5, 100, 0.05)).toBeCloseTo(75, 10);
  });

  it("returns 25 for bearish with half tau separation", () => {
    // diff negative => sign=-1, strength=0.025 => 50 - 25 = 25
    expect(technicalScoreSMA_Strength(97.5, 100, 0.05)).toBeCloseTo(25, 10);
  });

  it("returns 50 when SMAs are equal (within eps)", () => {
    expect(technicalScoreSMA_Strength(100, 100, 0.05, 1e-9)).toBe(50);
  });

  it("returns 50 when sma252 is ~0 (division guard)", () => {
    expect(technicalScoreSMA_Strength(100, 0, 0.05)).toBe(50);
  });

  it("stays within [0, 100]", () => {
    const cases: Array<[number, number]> = [
      [200, 100],
      [50, 100],
      [100, 100],
      [101, 100],
      [99, 100]
    ];
    for (const [a, b] of cases) {
      const v = technicalScoreSMA_Strength(a, b, 0.05);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
