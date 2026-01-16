import { createProvider } from '../src/providers/registry';
import { getUniverse } from '../src/core/universe';
import { calculateFundamentalScore } from '../src/scoring/fundamental';
import { getScoringConfig } from '../src/scoring/scoring_config';
import type { FundamentalsData } from '../src/data/repositories/fundamentals_repo';
import { YFinanceProvider } from '../src/providers/yfinance_provider';

type RawFundamentals = Record<string, unknown> | undefined;

async function main() {
  const provider = createProvider();
  const fallback = new YFinanceProvider();
  const universe = getUniverse();
  const thresholds = getScoringConfig().fundamentalThresholds;

  for (const symbol of universe) {
    const fundamentals = await provider.getFundamentals(symbol);
    let merged = fundamentals;

    // Pull fallback for PS/D/E when missing
    if (!fundamentals || fundamentals.psRatio === null || fundamentals.debtToEquity === null) {
      try {
        const fb = await fallback.getFundamentals(symbol);
        if (fb) {
          merged = mergeFundamentals(fundamentals, fb);
        }
      } catch (err) {
        console.warn(`Fallback fetch failed for ${symbol}: ${String(err)}`);
      }
    }

    if (!merged) {
      console.log(`\n${symbol}: missing fundamentals`);
      continue;
    }

    const raw = merged.raw as RawFundamentals;
    const quality = calculateFundamentalScore(merged, undefined, thresholds);

    const roeRaw = getNumber(raw?.roeTTM ?? raw?.returnOnEquity);
    const dteRaw = getNumber(raw?.debtToEquity);

    console.log(`\n=== ${symbol} ===`);
    console.log(
      `ROE raw ${fmt(roeRaw)} | converted ${fmt(merged.roe)} | ROE score ${quality.breakdown.roeScore}`
    );
    console.log(
      `D/E raw ${fmt(dteRaw)} | ratio ${fmt(merged.debtToEquity)} | D/E score ${quality.breakdown.debtEquityScore}`
    );
    console.log(
      `Quality: ${quality.components.quality} (valuation ${quality.components.valuation}, total ${quality.total})`
    );
    if (quality.assumptions.length > 0) {
      console.log(`Assumptions: ${quality.assumptions.join('; ')}`);
    }
    if (quality.missingFields.length > 0) {
      console.log(`Missing: ${quality.missingFields.join(', ')}`);
    }
  }

  provider.close();
  fallback.close();
}

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  return null;
}

function fmt(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'n/a';
  return value.toFixed(2);
}

function mergeFundamentals(
  primary: FundamentalsData | null,
  fallback: FundamentalsData
): FundamentalsData {
  if (!primary) return fallback;
  return {
    ...primary,
    psRatio: primary.psRatio ?? fallback.psRatio ?? null,
    debtToEquity: primary.debtToEquity ?? fallback.debtToEquity ?? null,
    raw: { ...(primary.raw ?? {}), ...(fallback.raw ?? {}) },
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
