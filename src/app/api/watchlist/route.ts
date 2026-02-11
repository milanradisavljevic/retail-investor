import { NextResponse } from 'next/server';
import {
  addStoredEntry,
  clearStoredEntries,
  getWatchlistWithScores,
  removeStoredEntry,
} from '@/lib/watchlist/server';

export async function GET() {
  const items = await getWatchlistWithScores();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const symbol = typeof body.symbol === 'string' ? body.symbol.toUpperCase() : '';
  const companyName =
    typeof body.companyName === 'string' && body.companyName.trim().length > 0
      ? body.companyName.trim()
      : symbol;

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  await addStoredEntry({ symbol, companyName });
  const items = await getWatchlistWithScores();
  return NextResponse.json({ items });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol');
  const clearAll = url.searchParams.get('all') === 'true';

  if (clearAll) {
    await clearStoredEntries();
    return NextResponse.json({ ok: true });
  }

  if (!symbol) {
    return NextResponse.json({ error: 'symbol query param required' }, { status: 400 });
  }

  await removeStoredEntry(symbol.toUpperCase());
  const items = await getWatchlistWithScores();
  return NextResponse.json({ items });
}
