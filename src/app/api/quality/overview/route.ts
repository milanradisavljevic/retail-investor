import { NextRequest, NextResponse } from 'next/server';
import { getQualityObservatorySnapshot } from '@/lib/quality/observatory';

export const runtime = 'nodejs';

function parseUniverses(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const universes = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return universes.length > 0 ? universes : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const universes = parseUniverses(request.nextUrl.searchParams.get('universes'));
    const forceRefresh = request.nextUrl.searchParams.get('force') === '1';
    const snapshot = getQualityObservatorySnapshot({ universeIds: universes, forceRefresh });

    return NextResponse.json(
      {
        generated_at: snapshot.generated_at,
        universe_ids: snapshot.universe_ids,
        universes: snapshot.universes,
        drift: snapshot.drift,
        stock_count: snapshot.stocks.length,
      },
      {
        headers: {
          'Cache-Control': 's-maxage=300, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error('[quality/overview] failed', error);
    return NextResponse.json({ error: 'Failed to build quality overview' }, { status: 500 });
  }
}
