import { NextRequest, NextResponse } from 'next/server';
import { loadTimeSeriesData } from '@/lib/analysis/timeSeriesAnalysis';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') || '1Y') as '1Y' | '3Y' | '5Y';
  const { symbol } = await params;

  try {
    const data = await loadTimeSeriesData(symbol.toUpperCase(), period);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Time series data error:', error);
    return NextResponse.json(
      { error: 'Failed to load time series data', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
