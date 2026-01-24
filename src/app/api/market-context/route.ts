import { NextResponse } from 'next/server';
import { getMarketContext } from '@/lib/marketContext';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const payload = await getMarketContext();
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 's-maxage=900, stale-while-revalidate=900',
      },
    });
  } catch (err) {
    console.error('[market-context] failed to load data', err);
    return NextResponse.json(
      { error: 'Failed to load market context' },
      { status: 502 }
    );
  }
}
