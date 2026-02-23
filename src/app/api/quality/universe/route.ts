import { NextRequest, NextResponse } from 'next/server';
import { getQualityObservatorySnapshot } from '@/lib/quality/observatory';

export const runtime = 'nodejs';

function parseLimit(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  try {
    const universeId = request.nextUrl.searchParams.get('u')?.trim().toLowerCase();
    if (!universeId) {
      return NextResponse.json({ error: 'Missing query parameter: u' }, { status: 400 });
    }

    const limit = parseLimit(request.nextUrl.searchParams.get('limit'), 100);
    const forceRefresh = request.nextUrl.searchParams.get('force') === '1';
    const snapshot = getQualityObservatorySnapshot({
      universeIds: [universeId],
      forceRefresh,
    });

    const universe = snapshot.universes.find((item) => item.universe_id === universeId);
    if (!universe) {
      return NextResponse.json({ error: 'Universe not found in observatory snapshot' }, { status: 404 });
    }

    const stocks = snapshot.stocks
      .filter((stock) => stock.universe_id === universeId)
      .sort((a, b) => {
        if (b.missing_quality_fields.length !== a.missing_quality_fields.length) {
          return b.missing_quality_fields.length - a.missing_quality_fields.length;
        }
        const aDq = a.data_quality_score ?? -1;
        const bDq = b.data_quality_score ?? -1;
        return aDq - bDq;
      })
      .slice(0, limit);

    return NextResponse.json(
      {
        generated_at: snapshot.generated_at,
        universe,
        stocks,
      },
      {
        headers: {
          'Cache-Control': 's-maxage=300, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error('[quality/universe] failed', error);
    return NextResponse.json({ error: 'Failed to load universe quality data' }, { status: 500 });
  }
}
