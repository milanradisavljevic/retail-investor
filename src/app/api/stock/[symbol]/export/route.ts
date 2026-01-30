import { NextRequest, NextResponse } from 'next/server';
import { getLatestRunFile } from '@/run/files';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json';
  const { symbol } = await params;
  const symbolNormalized = symbol.toUpperCase();
  
  const latestRun = getLatestRunFile();
  if (!latestRun) {
    return NextResponse.json({ error: 'No run data' }, { status: 404 });
  }
  
  const stockScore = latestRun.run.scores.find(
    s => s.symbol === symbolNormalized
  );
  
  if (!stockScore) {
    return NextResponse.json({ error: 'Symbol not found' }, { status: 404 });
  }
  
  if (format === 'json') {
    return NextResponse.json(stockScore, {
      headers: {
        'Content-Disposition': `attachment; filename="${symbol}_analysis.json"`
      }
    });
  }
  
  // TODO: Add CSV format
  return NextResponse.json({ error: 'Format not supported' }, { status: 400 });
}
