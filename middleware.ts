import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const protectedRoutes = '/dashboard';

/**
 * Refreshes the Supabase Auth session on every request (rotating tokens are
 * written back to cookies) and guards /dashboard for anonymous visitors.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedRoute = pathname.startsWith(protectedRoutes);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Auth not configured yet: keep public pages working, protect /dashboard.
    return isProtectedRoute
      ? NextResponse.redirect(new URL('/sign-in', request.url))
      : NextResponse.next();
  }

  // Anonymous visitors have no Supabase session cookie, so there is nothing to
  // refresh: skip the network `getUser()` entirely (big win for public traffic
  // like the landing/marketplace). Just guard /dashboard.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => /^sb-.*-auth-token/.test(c.name));
  if (!hasAuthCookie) {
    return isProtectedRoute
      ? NextResponse.redirect(new URL('/sign-in', request.url))
      : NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
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

  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
  runtime: 'nodejs'
};
