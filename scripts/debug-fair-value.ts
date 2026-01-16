import { createProvider } from '../src/providers/registry';
import { getUniverse } from '../src/core/universe';
import { extractStockMetrics, calculateSectorMedians } from '../src/scoring/price-target';
import type { FundamentalsData } from '../src/data/repositories/fundamentals_repo';
import type { CompanyProfile, TechnicalMetrics } from '../src/providers/types';
import { YFinanceProvider } from '../src/providers/yfinance_provider';
import { getScoringConfig } from '../src/scoring/scoring_config';

type Component =
  | {
      name: 'PE' | 'PB' | 'PS';
      weight: number;
      included: true;
      sectorMedian: number;
      companyMultiple: number | null;
      value: number;
      relativeMultiple: number | null;
      clampedRelative: number | null;
    }
  | {
      name: 'PE' | 'PB' | 'PS';
      weight: number;
      included: false;
      reason: string;
    };

const MIN_RELATIVE_MULTIPLE_FACTOR = 0.35;
const MAX_RELATIVE_MULTIPLE_FACTOR = 2.5;

async function main() {
  const provider = createProvider();
  const fallback = new YFinanceProvider();
  const universe = getUniverse();

  const rows: Array<{
    symbol: string;
    fundamentals: FundamentalsData | null;
    technical: TechnicalMetrics | null;
    profile: CompanyProfile | null;
  }> = [];

  for (const symbol of universe) {
    const profilePromise = provider.getCompanyProfile
      ? provider.getCompanyProfile(symbol)
      : Promise.resolve<CompanyProfile | null>(null);
    const [fundamentals, technical, profile] = await Promise.all([
      provider.getFundamentals(symbol),
      provider.getTechnicalMetrics(symbol),
      profilePromise,
    ]);

    // Fetch fallback fundamentals/profile when PS or D/E missing
    let mergedFundamentals: FundamentalsData | null = fundamentals;
    let mergedProfile: CompanyProfile | null = profile;
    if (!fundamentals || fundamentals.psRatio === null || fundamentals.debtToEquity === null) {
      try {
        const [fbFundamentals, fbProfile] = await Promise.all([
          fallback.getFundamentals(symbol),
          fallback.getCompanyProfile(symbol),
        ]);
        if (fbFundamentals) {
          mergedFundamentals = mergeFundamentals(fundamentals, fbFundamentals);
        }
        if (!profile && fbProfile) {
          mergedProfile = fbProfile;
        }
      } catch (err) {
        console.warn(`Fallback fetch failed for ${symbol}: ${String(err)}`);
      }
    }

    rows.push({ symbol, fundamentals: mergedFundamentals, technical, profile: mergedProfile });
  }

  const metrics = rows
    .filter((row) => row.fundamentals && row.technical?.currentPrice)
    .map((row) =>
      extractStockMetrics(
        row.symbol,
        row.technical!.currentPrice!,
        row.fundamentals!,
        row.profile
      )
    );

  const priceTargetConfig = getScoringConfig().priceTarget;
  const sectorMedians = calculateSectorMedians(metrics, priceTargetConfig);

  for (const row of rows) {
    const currentPrice = row.technical?.currentPrice ?? null;
    if (!row.fundamentals || !currentPrice) {
      console.log(`\n${row.symbol}: missing fundamentals or price - skipping`);
      continue;
    }

    const stockMetrics = extractStockMetrics(
      row.symbol,
      currentPrice,
      row.fundamentals,
      row.profile
    );
    const medians = sectorMedians.sectors.get(stockMetrics.sector ?? 'Unknown');

    if (!medians) {
      console.log(`\n${row.symbol}: no sector medians available`);
      continue;
    }

    const components = buildComponents(stockMetrics, medians, currentPrice);
    const included = components.filter((c) => c.included) as Extract<Component, { included: true }>[];
    const totalWeight = included.reduce((sum, c) => sum + c.weight, 0);
    const fairValue =
      totalWeight > 0
        ? included.reduce(
            (sum, c) => sum + c.value * (c.weight / totalWeight),
            0
          )
        : null;

    console.log(`\n=== ${row.symbol} (${stockMetrics.sector ?? 'Unknown'}) ===`);
    console.log(
      `Current: $${currentPrice.toFixed(2)} | Fair: ${
        fairValue ? `$${fairValue.toFixed(2)}` : 'n/a'
      } | Upside: ${
        fairValue ? (((fairValue - currentPrice) / currentPrice) * 100).toFixed(1) + '%' : 'n/a'
      }`
    );
    console.log(
      `Sector medians (sample ${medians.sampleSize}): PE ${fmt(medians.medianPE)}, PB ${fmt(
        medians.medianPB
      )}, PS ${fmt(medians.medianPS)}`
    );
    console.log(
      `Per-share: EPS ${fmt(stockMetrics.eps)}, BVPS ${fmt(stockMetrics.bookValuePerShare)}, RPS ${fmt(
        stockMetrics.revenuePerShare
      )}`
    );

    for (const comp of components) {
      if (!comp.included) {
        console.log(`- ${comp.name}: skipped (${comp.reason})`);
        continue;
      }
      const rel =
        comp.relativeMultiple !== null && comp.clampedRelative !== null
          ? `${comp.relativeMultiple.toFixed(2)} → ${comp.clampedRelative.toFixed(2)}`
          : comp.relativeMultiple !== null
            ? comp.relativeMultiple.toFixed(2)
            : 'n/a';
      console.log(
        `- ${comp.name} w=${comp.weight.toFixed(2)}: $${comp.value.toFixed(2)} | median ${
          comp.sectorMedian
        } | company ${fmt(comp.companyMultiple)} | relative ${rel}`
      );
    }
  }

  provider.close();
  fallback.close();
}

function buildComponents(
  metrics: ReturnType<typeof extractStockMetrics>,
  sectorMedians: import('../src/scoring/price-target').SectorMedians,
  currentPrice: number
): Component[] {
  const components: Component[] = [];

  if (
    metrics.eps === null ||
    metrics.eps <= 0 ||
    !sectorMedians.medianPE ||
    sectorMedians.medianPE <= 0
  ) {
    components.push({
      name: 'PE',
      weight: 0.4,
      included: false,
      reason: 'missing/negative EPS or sector PE',
    });
  } else {
    const base = metrics.eps * sectorMedians.medianPE;
    const relative = relativeMultiple(sectorMedians.medianPE, metrics.peRatio);
    const value =
      relative.clamped !== null && relative.relative !== null && relative.clamped !== relative.relative
        ? currentPrice * relative.clamped
        : base;
    components.push({
      name: 'PE',
      weight: 0.4,
      included: true,
      sectorMedian: sectorMedians.medianPE,
      companyMultiple: metrics.peRatio ?? null,
      relativeMultiple: relative.relative,
      clampedRelative: relative.clamped,
      value,
    });
  }

  if (
    metrics.bookValuePerShare === null ||
    metrics.bookValuePerShare <= 0 ||
    !sectorMedians.medianPB ||
    sectorMedians.medianPB <= 0
  ) {
    components.push({
      name: 'PB',
      weight: 0.3,
      included: false,
      reason: 'missing book value/share or sector PB',
    });
  } else {
    const base = metrics.bookValuePerShare * sectorMedians.medianPB;
    const relative = relativeMultiple(sectorMedians.medianPB, metrics.pbRatio);
    const value =
      relative.clamped !== null && relative.relative !== null && relative.clamped !== relative.relative
        ? currentPrice * relative.clamped
        : base;
    components.push({
      name: 'PB',
      weight: 0.3,
      included: true,
      sectorMedian: sectorMedians.medianPB,
      companyMultiple: metrics.pbRatio ?? null,
      relativeMultiple: relative.relative,
      clampedRelative: relative.clamped,
      value,
    });
  }

  if (
    metrics.revenuePerShare === null ||
    metrics.revenuePerShare <= 0 ||
    !sectorMedians.medianPS ||
    sectorMedians.medianPS <= 0
  ) {
    components.push({
      name: 'PS',
      weight: 0.3,
      included: false,
      reason: 'missing revenue/share or sector PS',
    });
  } else {
    const base = metrics.revenuePerShare * sectorMedians.medianPS;
    const relative = relativeMultiple(sectorMedians.medianPS, metrics.psRatio);
    const value =
      relative.clamped !== null && relative.relative !== null && relative.clamped !== relative.relative
        ? currentPrice * relative.clamped
        : base;
    components.push({
      name: 'PS',
      weight: 0.3,
      included: true,
      sectorMedian: sectorMedians.medianPS,
      companyMultiple: metrics.psRatio ?? null,
      relativeMultiple: relative.relative,
      clampedRelative: relative.clamped,
      value,
    });
  }

  return components;
}

function relativeMultiple(
  sectorMedian: number,
  companyMultiple: number | null
): { relative: number | null; clamped: number | null } {
  if (!companyMultiple || companyMultiple <= 0) {
    return { relative: null, clamped: null };
  }
  const relative = sectorMedian / companyMultiple;
  const clamped = Math.min(
    MAX_RELATIVE_MULTIPLE_FACTOR,
    Math.max(MIN_RELATIVE_MULTIPLE_FACTOR, relative)
  );
  return { relative, clamped };
}

function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
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
