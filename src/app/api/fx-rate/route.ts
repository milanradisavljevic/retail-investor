import { NextRequest, NextResponse } from 'next/server';
import { getUsdEurRate } from '@/lib/currency/serverFx';
import { sanitizeError } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const base = (url.searchParams.get('base') ?? 'USD').toUpperCase();
  const quote = (url.searchParams.get('quote') ?? 'EUR').toUpperCase();
  const forceRefresh = url.searchParams.get('refresh') === '1';

  if (base !== 'USD' || quote !== 'EUR') {
    return NextResponse.json(
      { error: 'Only USD/EUR is currently supported' },
      { status: 400 }
    );
  }

  try {
    const snapshot = await getUsdEurRate({ forceRefresh });
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 503 }
    );
  }
}
