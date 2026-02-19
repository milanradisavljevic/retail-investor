import { NextResponse } from 'next/server';
import { getRunLockState } from '@/data/repositories/run_lock_repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const state = getRunLockState();
  return NextResponse.json(state);
}
