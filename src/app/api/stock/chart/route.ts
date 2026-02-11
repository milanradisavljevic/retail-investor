import { NextRequest, NextResponse } from 'next/server';
import { YFinanceProvider } from '@/providers/yfinance_provider';
import { MarketDataDB } from '@/data/market-data-db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const days = parseInt(searchParams.get('days') || '252'); // default 1 year

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol parameter required' },
        { status: 400 }
      );
    }

    // Try local database first (much faster, avoids API limits)
    try {
      const db = new MarketDataDB();
      const prices = db.getPrices(symbol, days);
      db.close();

      if (prices && prices.length > 0) {
        // Convert to chart format (most recent first)
        const chartData = prices.map((row) => ({
          date: row.date,
          close: row.close ?? row.adjusted_close
        })).reverse();

        return NextResponse.json(chartData);
      }
    } catch (dbError) {
      console.warn(`Failed to read prices from DB for ${symbol}:`, dbError);
      // Continue to fallback
    }

    // Fallback to live YFinance API
    const provider = new YFinanceProvider();
    const candles = await provider.getCandles(symbol, days);

    if (!candles || !candles.t || candles.t.length === 0) {
      return NextResponse.json(
        { error: 'No data available' },
        { status: 404 }
      );
    }

    // Convert to simple format for chart
    const chartData = candles.t.map((timestamp, i) => ({
      date: new Date(timestamp * 1000).toISOString().split('T')[0],
      close: candles.c[i]
    }));

    return NextResponse.json(chartData);
  } catch (error) {
    console.error('Failed to fetch chart data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chart data' },
      { status: 500 }
    );
  }
}
