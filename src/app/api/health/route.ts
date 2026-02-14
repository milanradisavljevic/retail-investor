import { NextResponse } from 'next/server';
import { getHealthSnapshot } from '@/lib/health';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const payload = getHealthSnapshot();
    const responsePayload = {
      ...payload,
      provider_coverage: payload.provider_coverage ?? [],
    };
    return NextResponse.json(responsePayload, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('[health] failed to build health snapshot', error);
    return NextResponse.json(
      { error: 'Failed to load health data' },
      { status: 500 }
    );
  }
}
