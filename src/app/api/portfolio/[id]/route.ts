export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPositionById, updatePosition, deletePosition } from '@/data/portfolio';
import type { PortfolioPositionInput } from '@/types/portfolio';
import { getDatabase } from '@/data/db';
import { sanitizeError } from '@/lib/apiError';
import { getAuthUserId } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await getAuthUserId();
    getDatabase();
    
    const { id } = await params;
    const positionId = parseInt(id, 10);
    
    if (Number.isNaN(positionId)) {
      return NextResponse.json(
        { error: 'Invalid position ID' },
        { status: 400 }
      );
    }
    
    const position = getPositionById(positionId, userId);
    
    if (!position) {
      return NextResponse.json(
        { error: 'Position not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(position);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[API /portfolio/[id]] Error:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await getAuthUserId();
    getDatabase();
    
    const { id } = await params;
    const positionId = parseInt(id, 10);
    
    if (Number.isNaN(positionId)) {
      return NextResponse.json(
        { error: 'Invalid position ID' },
        { status: 400 }
      );
    }
    
    const body = await request.json() as Partial<PortfolioPositionInput>;
    const success = updatePosition(positionId, body, userId);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Position not found or no changes made' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Position updated successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[API /portfolio/[id]] Error updating position:', error);
    
    if (error instanceof Error && error.message.includes('must be')) {
      return NextResponse.json(
        { error: 'Validation error' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await getAuthUserId();
    getDatabase();
    
    const { id } = await params;
    const positionId = parseInt(id, 10);
    
    if (Number.isNaN(positionId)) {
      return NextResponse.json(
        { error: 'Invalid position ID' },
        { status: 400 }
      );
    }
    
    const success = deletePosition(positionId, userId);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Position not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Position deleted successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[API /portfolio/[id]] Error deleting position:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
