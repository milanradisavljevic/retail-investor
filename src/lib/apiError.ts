import { NextResponse } from 'next/server';

export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    if (process.env.NODE_ENV === 'development') {
      return error.message;
    }
    return 'Ein interner Fehler ist aufgetreten';
  }
  return 'Ein unbekannter Fehler ist aufgetreten';
}

export function apiError(message: string, status: number = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function apiErrorResponse(error: unknown, status: number = 500): NextResponse {
  console.error('[API] Error:', error);
  return NextResponse.json({ error: sanitizeError(error) }, { status });
}
