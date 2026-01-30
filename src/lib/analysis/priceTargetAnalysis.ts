import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

export interface PriceTargetEnhanced {
  symbol: string;
  current: {
    price: number;
    date: string;
  };
  targets: {
    entry: number;
    exit: number;
    fairValue: number;
  };
  potential: {
    upside: {
      price: number;
      percentage: number;
      basis: string;
    };
    downside: {
      price: number;
      percentage: number;
      support: string;
    };
  };
  riskReward: {
    ratio: number;
    interpretation: 'excellent' | 'good' | 'balanced' | 'poor';
  };
  confidence: {
    level: 'high' | 'medium' | 'low';
    dataQuality: number;
    reasons: string[];
  };
  historicalPattern?: {
    description: string;
    occurrences: number;
    avgGain: number;
    timeframe: string;
    confidence: number;
  };
  holdingPeriod: {
    months: number;
    targetDate: string;
    reasoning: string;
  };
}

const HISTORICAL_DIRS = [
  path.join(process.cwd(), 'data', 'backtesting', 'historical'),
  path.join(process.cwd(), 'data', 'historical'),
];

/**
 * Build enhanced price target data
 */
export async function buildEnhancedPriceTarget(
  symbol: string,
  stockScore: RunV1SchemaJson['scores'][number]
): Promise<PriceTargetEnhanced> {
  const priceTarget = stockScore.price_target;
  if (!priceTarget) {
    throw new Error(`No price target available for ${symbol}`);
  }

  const historicalData = await loadHistoricalPrices(symbol, 252);
  const fallbackPrice = priceTarget.current_price ?? 0;
  const currentPrice = priceTarget.current_price ?? fallbackPrice;

  const low52W =
    historicalData.length > 0
      ? Math.min(...historicalData.map((d) => d.close))
      : fallbackPrice;
  const high52W =
    historicalData.length > 0
      ? Math.max(...historicalData.map((d) => d.close))
      : fallbackPrice;

  const downsidePrice = Math.max(
    low52W,
    (priceTarget.fair_value ?? fallbackPrice) * 0.7
  );
  const downsidePercentage = currentPrice
    ? Math.max(0, ((currentPrice - downsidePrice) / currentPrice) * 100)
    : 0;

  const upsidePrice = Math.min(
    high52W * 1.1,
    (priceTarget.fair_value ?? fallbackPrice) * 1.3
  );
  const upsidePercentage = currentPrice
    ? ((upsidePrice - currentPrice) / currentPrice) * 100
    : 0;

  const ratio =
    downsidePercentage <= 0 ? Infinity : Math.abs(upsidePercentage / downsidePercentage);
  const interpretation =
    ratio > 3 ? 'excellent' : ratio > 2 ? 'good' : ratio > 1 ? 'balanced' : 'poor';
  const ratioValue = ratio === Infinity ? 99 : ratio;

  const pattern = await detectHistoricalPattern(symbol, stockScore, historicalData);

  const confidenceReasons: string[] = [];
  if (stockScore.data_quality.data_quality_score > 80) {
    confidenceReasons.push('High data quality (>80%)');
  }
  const upsidePctAbs = Math.abs((priceTarget.upside_pct ?? 0) * 100);
  if (upsidePctAbs < 50) {
    confidenceReasons.push('Realistic upside expectation (<50%)');
  }
  if (stockScore.evidence.valuation > 85 && stockScore.evidence.quality > 85) {
    confidenceReasons.push('Strong fundamentals (Val & Quality >85)');
  }

  return {
    symbol,
    current: {
      price: currentPrice,
      date: new Date().toISOString().split('T')[0],
    },
    targets: {
      entry: priceTarget.target_buy_price ?? currentPrice,
      exit: priceTarget.target_sell_price ?? priceTarget.fair_value ?? currentPrice,
      fairValue: priceTarget.fair_value ?? currentPrice,
    },
    potential: {
      upside: {
        price: upsidePrice,
        percentage: Number(upsidePercentage.toFixed(1)),
        basis: upsidePrice === high52W * 1.1 ? 'Historical high + 10%' : 'Fair value ceiling',
      },
      downside: {
        price: downsidePrice,
        percentage: Number(downsidePercentage.toFixed(1)),
        support: downsidePrice === low52W ? '52W low support' : 'Fair value floor',
      },
    },
    riskReward: {
      ratio: Number(ratioValue.toFixed(2)),
      interpretation,
    },
    confidence: {
      level: priceTarget.confidence ?? 'low',
      dataQuality: stockScore.data_quality.data_quality_score,
      reasons: confidenceReasons,
    },
    historicalPattern: pattern,
    holdingPeriod: {
      months: priceTarget.holding_period_months ?? 6,
      targetDate: priceTarget.target_date ?? '',
      reasoning: generateHoldingPeriodReasoning(
        priceTarget.holding_period_months ?? 6,
        stockScore.evidence.risk
      ),
    },
  };
}

async function loadHistoricalPrices(
  symbol: string,
  days: number
): Promise<{ date: string; close: number }[]> {
  const filePath = HISTORICAL_DIRS.map((dir) => path.join(dir, `${symbol}.csv`)).find((p) =>
    existsSync(p)
  );

  if (!filePath) {
    return [];
  }

  try {
    const csv = await fs.readFile(filePath, 'utf-8');
    const lines = csv.split('\n').slice(1);
    return lines
      .filter((line) => line.trim())
      .map((line) => {
        const cols = line.split(',');
        const date = cols[0];
        const close = parseFloat(cols[4] ?? cols[1]);
        return { date, close };
      })
      .filter((d) => !Number.isNaN(d.close))
      .slice(-days);
  } catch {
    return [];
  }
}

async function detectHistoricalPattern(
  symbol: string,
  _stockScore: RunV1SchemaJson['scores'][number],
  historicalData: { date: string; close: number }[]
): Promise<PriceTargetEnhanced['historicalPattern'] | undefined> {
  if (historicalData.length < 150) return undefined;

  const currentPrice = historicalData[historicalData.length - 1].close;
  const high52W = Math.max(...historicalData.map((d) => d.close));
  const low52W = Math.min(...historicalData.map((d) => d.close));
  const range = high52W - low52W;
  if (range === 0) return undefined;

  const positionInRange = (currentPrice - low52W) / range;
  if (positionInRange >= 0.2) return undefined;

  let occurrences = 0;
  let totalGain = 0;

  for (let i = 0; i < historicalData.length - 126; i++) {
    const window = historicalData.slice(Math.max(0, i - 252), i);
    if (window.length < 10) continue;
    const localHigh = Math.max(...window.map((d) => d.close));
    const localLow = Math.min(...window.map((d) => d.close));
    const localRange = localHigh - localLow;
    if (localRange === 0) continue;

    const localPos = (historicalData[i].close - localLow) / localRange;
    if (localPos < 0.2) {
      const futurePrice = historicalData[i + 126]?.close;
      if (futurePrice) {
        const gain = ((futurePrice - historicalData[i].close) / historicalData[i].close) * 100;
        occurrences += 1;
        totalGain += gain;
      }
    }
  }

  if (occurrences < 3) return undefined;

  const avgGain = totalGain / occurrences;
  return {
    description: `Trading near 52W low (bottom 20% of range). Last ${occurrences} occurrences → avg +${avgGain.toFixed(
      1
    )}% over 6 months.`,
    occurrences,
    avgGain: Number(avgGain.toFixed(1)),
    timeframe: '6 months',
    confidence: occurrences >= 5 ? 0.8 : 0.6,
  };
}

function generateHoldingPeriodReasoning(months: number, _riskScore: number): string {
  if (months <= 3) {
    return 'Short-term trade based on technical setup and near-term catalysts.';
  }
  if (months <= 6) {
    return 'Medium-term hold to realize valuation re-rating.';
  }
  if (months <= 12) {
    return 'Long-term position targeting fundamental improvement.';
  }
  return 'Extended hold period justified by secular growth trends.';
}
