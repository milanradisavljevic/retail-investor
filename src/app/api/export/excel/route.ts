export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { generateRunExport, generatePortfolioExport, getExportFilename } from '@/lib/excelExport';
import { getAuthUserId } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') as 'run' | 'portfolio' | null;
  const runId = searchParams.get('runId') || undefined;

  if (!type || !['run', 'portfolio'].includes(type)) {
    return NextResponse.json(
      { error: 'Invalid type parameter. Use ?type=run or ?type=portfolio' },
      { status: 400 }
    );
  }

  try {
    const userId = await getAuthUserId();
    let buffer: Buffer;
    let filename: string;

    if (type === 'run') {
      buffer = await generateRunExport(runId);
      filename = getExportFilename('run', runId?.split('__')[0]);
    } else {
      buffer = await generatePortfolioExport(userId);
      filename = getExportFilename('portfolio');
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /export/excel] Error:', message);
    
    return NextResponse.json(
      { error: `Export failed: ${message}` },
      { status: 500 }
    );
  }
}
