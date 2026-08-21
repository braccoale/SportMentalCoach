import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users, userOnboarding } from '@/lib/db/schema';
import { REQUEST_METHOD_HEADER } from '@/lib/auth/demo-readonly';

const protectedRoutes = '/dashboard';

/**
 * Refreshes the Supabase Auth session on every request (rotating tokens are
 * written back to cookies) and guards /dashboard for anonymous visitors.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedRoute = pathname.startsWith(protectedRoutes);
  const signInUrl = new URL('/sign-in', request.url);
  signInUrl.searchParams.set(
    'redirect',
    `${pathname}${request.nextUrl.search}`
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_METHOD_HEADER, request.method);
  const nextResponse = () =>
    NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Auth not configured yet: keep public pages working, protect /dashboard.
    return isProtectedRoute
      ? NextResponse.redirect(signInUrl)
      : nextResponse();
  }

  // Anonymous visitors have no Supabase session cookie, so there is nothing to
  // refresh: skip the network `getUser()` entirely (big win for public traffic
  // like the landing/marketplace). Just guard /dashboard.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => /^sb-.*-auth-token/.test(c.name));
  if (!hasAuthCookie) {
    return isProtectedRoute
      ? NextResponse.redirect(signInUrl)
      : nextResponse();
  }

  let response = nextResponse();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = nextResponse();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session if needed; do not run app logic between client
  // creation and getUser() (see Supabase SSR docs).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Le API di scrittura degli account demo terminano qui con un 403 chiaro,
  // prima di raggiungere route handler e database. `/api/demo/login` è il solo
  // POST di bootstrap e non modifica dati applicativi.
  const isApiMutation =
    pathname.startsWith('/api/') &&
    pathname !== '/api/demo/login' &&
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());
  if (user && isApiMutation) {
    const [appUser] = await db
      .select({ isDemo: users.isDemo })
      .from(users)
      .where(eq(users.authId, user.id))
      .limit(1);
    if (appUser?.isDemo) {
      const forbidden = NextResponse.json(
        {
          code: 'DEMO_READONLY',
          error:
            'Questa è una demo in sola lettura. Puoi esplorare tutti i dati, ma non modificarli.',
        },
        { status: 403 }
      );
      for (const cookie of response.cookies.getAll()) {
        forbidden.cookies.set(cookie);
      }
      return forbidden;
    }
  }

  // Already-authenticated visitors don't need the marketing landing page: send
  // them straight to their dashboard (which itself routes to the right area).
  if (user && pathname === '/') {
    const toDashboard = NextResponse.redirect(new URL('/dashboard', request.url));
    // Carry over any auth cookies the session refresh above just rotated.
    for (const cookie of response.cookies.getAll()) {
      toDashboard.cookies.set(cookie);
    }
    return toDashboard;
  }

  if (isProtectedRoute && !user) {
    return NextResponse.redirect(signInUrl);
  }

  // Onboarding gate: an authenticated user whose onboarding is not yet complete
  // is sent to the wizard before any dashboard page. No loop — `/onboarding`
  // lives outside `/dashboard`. Legacy users (no row) are treated as complete
  // (fail-open), so existing accounts are never interrupted.
  if (isProtectedRoute && user) {
    const [row] = await db
      .select({ status: userOnboarding.status })
      .from(users)
      .innerJoin(userOnboarding, eq(userOnboarding.userId, users.id))
      .where(eq(users.authId, user.id))
      .limit(1);
    if (row && row.status !== 'completed') {
      const toWizard = NextResponse.redirect(new URL('/onboarding', request.url));
      for (const cookie of response.cookies.getAll()) {
        toWizard.cookies.set(cookie);
      }
      return toWizard;
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
  runtime: 'nodejs'
};
