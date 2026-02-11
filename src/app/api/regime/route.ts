import { NextResponse } from 'next/server';
import { detectRegime } from '@/regime/engine';
import { getLatestMacroValue } from '@/data/macro-db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const regime = detectRegime(today);

    const vixRow = getLatestMacroValue('VIXCLS');
    const yieldRow = getLatestMacroValue('T10Y2Y');
    const fedRow = getLatestMacroValue('FEDFUNDS');
    const cpiRow = getLatestMacroValue('CPIAUCSL');

    return NextResponse.json(
      {
        regime,
        macro: {
          vix: vixRow?.value ?? null,
          yield_curve: yieldRow?.value ?? null,
          fed_rate: fedRow?.value ?? null,
          cpi: cpiRow?.value ?? null,
        },
      },
      {
        headers: {
          'Cache-Control': 's-maxage=3600, stale-while-revalidate=1800',
        },
      }
    );
  } catch (err) {
    console.error('[regime] failed to detect regime', err);
    return NextResponse.json(
      { error: 'Failed to detect regime' },
      { status: 502 }
    );
  }
}
