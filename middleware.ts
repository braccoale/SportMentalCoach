import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users, userOnboarding } from '@/lib/db/schema';
import { REQUEST_METHOD_HEADER } from '@/lib/auth/demo-readonly';
import { COMPLETE_SIGNUP_PATH } from '@/lib/core/auth/signup-completion';

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

  /**
   * I cookie che il rinnovo della sessione ha appena ruotato viaggiano con
   * ogni reindirizzamento: perderli qui significherebbe disconnettere l'utente
   * proprio mentre lo si sposta, e lasciargli in mano un cookie scaduto che a
   * ogni richiesta successiva costa una chiamata di rete destinata a fallire.
   */
  const withCookies = (destination: URL | string) => {
    const redirectResponse = NextResponse.redirect(
      destination instanceof URL ? destination : new URL(destination, request.url)
    );
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  };

  if (isProtectedRoute && !user) {
    return withCookies(signInUrl);
  }

  // Chi e' gia' dentro non ha bisogno della pagina di presentazione. Resta
  // **prima** della lettura qui sotto e senza query: `/` e' la pagina piu'
  // visitata del prodotto, e chi non ha ancora un account applicativo viene
  // comunque intercettato su `/dashboard`, che e' area riservata.
  if (user && pathname === '/') {
    return withCookies('/dashboard');
  }

  /**
   * I due cancelli dell'area riservata, in una lettura sola.
   *
   * Il primo e' nato con l'accesso Google, e senza di lui c'era un vicolo
   * cieco: puo' esistere una **sessione valida senza riga in `users`** — chi
   * torna dal fornitore d'identita' e non finisce la registrazione. La home
   * rimandava all'area riservata, `getUser()` restituiva null e si finiva alla
   * pagina di accesso, dove si e' gia' dentro. Nessuno riportava al
   * completamento.
   *
   * `leftJoin` e non `innerJoin`: serve distinguere «non c'e' l'account» da
   * «non c'e' ancora l'onboarding», che prima collassavano nello stesso
   * risultato vuoto.
   *
   * `isNull(deletedAt)` come in `getCachedUser`: un account chiuso con una
   * sessione ancora viva non e', per il resto del prodotto, un account — e
   * senza questo filtro finirebbe nello stesso vicolo cieco, perche' la riga
   * risulterebbe presente qui e assente ovunque altro.
   */
  if (user && isProtectedRoute) {
    const [row] = await db
      .select({ userId: users.id, status: userOnboarding.status })
      .from(users)
      .leftJoin(userOnboarding, eq(userOnboarding.userId, users.id))
      .where(and(eq(users.authId, user.id), isNull(users.deletedAt)))
      .limit(1);

    if (!row) return withCookies(COMPLETE_SIGNUP_PATH);

    // Onboarding: gli account storici (nessuna riga) restano completi, cosi'
    // nessuno viene interrotto a meta' di quello che stava facendo.
    if (row.status && row.status !== 'completed') {
      return withCookies('/onboarding');
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
  runtime: 'nodejs'
};
