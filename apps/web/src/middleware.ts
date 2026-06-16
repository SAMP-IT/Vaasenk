import { NextResponse, type NextRequest } from 'next/server';
import { isSafeRedirect } from './lib/safe-redirect';
import { updateSession } from './lib/supabase/middleware';

const PROTECTED_PREFIXES = ['/admin', '/teacher', '/student'];
const AUTH_PATHS = ['/login', '/register'];

/** Returns true when env vars look unconfigured (so we don't enforce auth in dev). */
function isPlaceholderSupabase(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return (
    !url ||
    url.includes('your-project') ||
    url.includes('placeholder') ||
    url === 'https://your-project.supabase.co'
  );
}

function roleHomePath(user: { app_metadata?: Record<string, unknown> } | null): string {
  const raw = user?.app_metadata?.['role'];
  const role = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (role === 'admin' || role === 'super_admin') return '/admin';
  if (role === 'student') return '/student';
  return '/teacher';
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Dev mode: Supabase isn't configured. Refresh the (empty) session for
  // cookie parity and let every page render so designers can review them.
  if (isPlaceholderSupabase()) {
    const { response } = await updateSession(request);
    return response;
  }

  const { user, response } = await updateSession(request);

  const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const isAuthRoute = AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (user && (isAuthRoute || path === '/')) {
    const url = request.nextUrl.clone();
    // Honour ?next=<path> on auth routes (e.g. the user was redirected
    // here mid-session) but only when the value is a safe same-origin
    // path — isSafeRedirect rejects protocol/scheme/`//host` payloads
    // so this can't be turned into an open redirector.
    const nextParam = request.nextUrl.searchParams.get('next');
    if (isAuthRoute && isSafeRedirect(nextParam)) {
      url.pathname = nextParam;
    } else {
      url.pathname = roleHomePath(user);
    }
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (!user && path === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except Next.js internals and common static assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
