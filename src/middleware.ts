import { NextFetchEvent, NextRequest, NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { isAuthBypassEnabledServer } from '@/lib/authMode';

const MAX_BODY_SIZE = 2 * 1024 * 1024;

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health(.*)',
]);

const clerkHandler = clerkMiddleware(async (auth, request) => {
  if (
    request.nextUrl.pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH'].includes(request.method)
  ) {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: 'Request zu groß. Maximum: 2MB' },
        { status: 413 }
      );
    }
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (isAuthBypassEnabledServer()) {
    if (
      request.nextUrl.pathname.startsWith('/api/') &&
      ['POST', 'PUT', 'PATCH'].includes(request.method)
    ) {
      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
        return NextResponse.json(
          { error: 'Request zu groß. Maximum: 2MB' },
          { status: 413 }
        );
      }
    }
    return NextResponse.next();
  }

  return clerkHandler(request, event);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
