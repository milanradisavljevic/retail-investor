export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { generateDailyReport, generateStockReport, parseReportSections } from '@/lib/reportGenerator';

function sanitizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolParam = searchParams.get('symbol');
  const sectionsParam = searchParams.get('sections');

  try {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10);

    if (symbolParam && symbolParam.trim().length > 0) {
      const symbol = sanitizeSymbol(symbolParam);
      const buffer = await generateStockReport(symbol);
      const filename = `INTRINSIC-Stock-${symbol}-${datePart}.pdf`;

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });
    }

    const sections = parseReportSections(sectionsParam);
    const buffer = await generateDailyReport({ sections });
    const filename = `INTRINSIC-Report-${datePart}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /export/pdf] Error:', message);

    return NextResponse.json(
      { error: `PDF export failed: ${message}` },
      { status: 500 }
    );
  }
}
