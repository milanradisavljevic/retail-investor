import fs from 'fs/promises';
import path from 'path';

export interface TimeSeriesPoint {
  date: string;
  price: number;
  sp500: number;
  sectorIndex?: number;
  marketCap?: number;
}

export interface QuarterlyPerformance {
  quarter: string; // "2024 Q1"
  startDate: string;
  endDate: string;
  stockReturn: number; // percentage
  marketReturn: number; // percentage
  sectorReturn?: number; // percentage
  outperformance: number; // stock - market
  interpretation: 'defensive' | 'capture' | 'consistent' | 'underperform';
}

export interface TimeSeriesData {
  symbol: string;
  currentPrice: number;
  timeSeries: TimeSeriesPoint[];
  quarterlyPerformance: QuarterlyPerformance[];
  summary: {
    '1Y': { return: number; vsMarket: number; vsSector?: number };
    '3Y'?: { return: number; vsMarket: number; vsSector?: number };
    '5Y'?: { return: number; vsMarket: number; vsSector?: number };
  };
}

/**
 * Load historical price data for a symbol from CSV files
 */
export async function loadTimeSeriesData(
  symbol: string,
  period: '1Y' | '3Y' | '5Y' = '1Y'
): Promise<TimeSeriesData> {
  // 1. Load symbol's historical data
  const symbolFile = path.join(
    process.cwd(),
    'data',
    'backtesting',
    'historical',
    `${symbol}.csv`
  );

  let symbolData: { date: string; close: number }[];
  try {
    const csv = await fs.readFile(symbolFile, 'utf-8');
    symbolData = parseCSV(csv);
  } catch (error) {
    throw new Error(`Historical data not found for ${symbol}`);
  }

  // 2. Load S&P 500 benchmark data (SPY.csv)
  const spyFile = path.join(
    process.cwd(),
    'data',
    'backtesting',
    'historical',
    'SPY.csv'
  );
  const spyCSV = await fs.readFile(spyFile, 'utf-8');
  const spyData = parseCSV(spyCSV);

  // 3. Filter to requested period
  const cutoffDate = getCutoffDate(period);
  const filteredSymbol = symbolData.filter(d => d.date >= cutoffDate);
  const filteredSpy = spyData.filter(d => d.date >= cutoffDate);
  const series = filteredSymbol.length > 0 ? filteredSymbol : symbolData;
  const benchmark = filteredSpy.length > 0 ? filteredSpy : spyData;

  // 4. Merge data by date
  const timeSeries: TimeSeriesPoint[] = series.map(point => {
    const spyPoint = benchmark.find(s => s.date === point.date);
    return {
      date: point.date,
      price: point.close,
      sp500: spyPoint?.close ?? point.close
    };
  }).filter(p => p.sp500 > 0); // Remove dates without S&P data

  // 5. Calculate quarterly performance
  const quarterlyPerformance = calculateQuarterlyReturns(timeSeries);

  // 6. Calculate summary stats
  const summary: TimeSeriesData['summary'] = {
    '1Y': calculateReturns(timeSeries, 252), // 252 trading days = 1 year
  };

  if (period === '3Y' || period === '5Y') {
    summary['3Y'] = calculateReturns(timeSeries, 756); // 3 years
  }

  if (period === '5Y') {
    summary['5Y'] = calculateReturns(timeSeries, 1260); // 5 years
  }

  return {
    symbol,
    currentPrice: timeSeries[timeSeries.length - 1].price,
    timeSeries,
    quarterlyPerformance,
    summary
  };
}

/**
 * Parse CSV file to array of {date, close}
 */
function parseCSV(csv: string): { date: string; close: number }[] {
  const lines = csv.split('\n');
  const header = lines[0].split(',');
  const dateIdx = header.indexOf('date');
  const closeIdx = header.indexOf('close');

  return lines.slice(1)
    .filter(line => line.trim())
    .map(line => {
      const cols = line.split(',');
      return {
        date: cols[dateIdx],
        close: parseFloat(cols[closeIdx])
      };
    })
    .filter(d => !isNaN(d.close));
}

/**
 * Get cutoff date for period
 */
function getCutoffDate(period: '1Y' | '3Y' | '5Y'): string {
  const now = new Date();
  const years = period === '1Y' ? 1 : period === '3Y' ? 3 : 5;
  now.setFullYear(now.getFullYear() - years);
  return now.toISOString().split('T')[0];
}

/**
 * Calculate returns over a period
 */
function calculateReturns(
  timeSeries: TimeSeriesPoint[],
  days: number
): { return: number; vsMarket: number } {
  if (timeSeries.length < days) {
    // Not enough data for this period, calculate with available data
    if (timeSeries.length < 2) {
      return { return: 0, vsMarket: 0 };
    }
    const start = timeSeries[0];
    const end = timeSeries[timeSeries.length - 1];

    const stockReturn = ((end.price - start.price) / start.price) * 100;
    const marketReturn = ((end.sp500 - start.sp500) / start.sp500) * 100;

    return {
      return: Number(stockReturn.toFixed(2)),
      vsMarket: Number((stockReturn - marketReturn).toFixed(2))
    };
  }

  const startIdx = Math.max(0, timeSeries.length - days);
  const start = timeSeries[startIdx];
  const end = timeSeries[timeSeries.length - 1];

  const stockReturn = ((end.price - start.price) / start.price) * 100;
  const marketReturn = ((end.sp500 - start.sp500) / start.sp500) * 100;

  return {
    return: Number(stockReturn.toFixed(2)),
    vsMarket: Number((stockReturn - marketReturn).toFixed(2))
  };
}

/**
 * Calculate quarterly returns
 */
function calculateQuarterlyReturns(
  timeSeries: TimeSeriesPoint[]
): QuarterlyPerformance[] {
  // Group data by quarter
  const quarters = new Map<string, TimeSeriesPoint[]>();

  for (const point of timeSeries) {
    const date = new Date(point.date);
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const key = `${year} Q${quarter}`;

    if (!quarters.has(key)) {
      quarters.set(key, []);
    }
    quarters.get(key)!.push(point);
  }

  // Calculate returns for each quarter
  const results: QuarterlyPerformance[] = [];

  for (const [quarter, points] of quarters.entries()) {
    if (points.length < 2) continue; // Need at least 2 points

    const start = points[0];
    const end = points[points.length - 1];

    const stockReturn = ((end.price - start.price) / start.price) * 100;
    const marketReturn = ((end.sp500 - start.sp500) / start.sp500) * 100;
    const outperformance = stockReturn - marketReturn;

    // Determine interpretation
    let interpretation: QuarterlyPerformance['interpretation'];
    if (marketReturn < 0 && stockReturn > marketReturn) {
      interpretation = 'defensive'; // Down less than market in downturn
    } else if (marketReturn > 0 && stockReturn > marketReturn) {
      interpretation = 'capture'; // Captured upside
    } else if (Math.abs(outperformance) < 2) {
      interpretation = 'consistent'; // Tracking market
    } else {
      interpretation = 'underperform';
    }

    results.push({
      quarter,
      startDate: start.date,
      endDate: end.date,
      stockReturn: Number(stockReturn.toFixed(2)),
      marketReturn: Number(marketReturn.toFixed(2)),
      outperformance: Number(outperformance.toFixed(2)),
      interpretation
    });
  }

  return results.sort((a, b) => a.startDate.localeCompare(b.startDate));
}
