import { NextRequest, NextResponse } from 'next/server';
import { getQualityObservatorySnapshot } from '@/lib/quality/observatory';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase();
    if (!symbol) {
      return NextResponse.json({ error: 'Missing query parameter: symbol' }, { status: 400 });
    }

    const universesParam = request.nextUrl.searchParams.get('universes');
    const universeIds = universesParam
      ? universesParam
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .filter((item) => item.length > 0)
      : undefined;

    const snapshot = getQualityObservatorySnapshot({
      universeIds,
      forceRefresh: request.nextUrl.searchParams.get('force') === '1',
    });

    const matches = snapshot.stocks
      .filter((stock) => stock.symbol === symbol)
      .sort((a, b) => a.universe_id.localeCompare(b.universe_id));

    if (matches.length === 0) {
      return NextResponse.json({ error: 'Stock not found in observatory snapshot' }, { status: 404 });
    }

    return NextResponse.json(
      {
        generated_at: snapshot.generated_at,
        symbol,
        entries: matches,
      },
      {
        headers: {
          'Cache-Control': 's-maxage=300, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error('[quality/stock] failed', error);
    return NextResponse.json({ error: 'Failed to load stock quality data' }, { status: 500 });
  }
}
