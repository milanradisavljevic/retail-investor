import { NextRequest, NextResponse } from 'next/server';
import { findPeers } from '@/lib/analysis/peerAnalysis';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  try {
    const data = await findPeers(symbol.toUpperCase());
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load peers' },
      { status: 500 }
    );
  }
}
