import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/auth/supabase';
import { safeRedirectPath } from '@/lib/core/auth/safe-redirect';

/**
 * Lo scambio del codice di Supabase Auth: ripristino password, OAuth, link
 * magici. Scambia il codice usa-e-getta con un cookie di sessione, poi manda a
 * `next` — solo percorsi di questo sito.
 *
 * Il filtro su `next` è condiviso con le action di accesso, e non è un
 * `startsWith('/')`: quel controllo lascia passare `//altro-sito`, e anche
 * `/⏎/altro-sito`, che il browser risolve come indirizzo assoluto. Bastava un
 * collegamento costruito ad arte per far atterrare l'utente altrove **subito
 * dopo un accesso riuscito** — il momento in cui si fida di più.
 */

/** Il percorso che identifica un ritorno da un fornitore d'identità. */
const COMPLETE_SIGNUP_PATH = '/registrazione/completa';

/**
 * Dove mandare qualcuno quando lo scambio fallisce.
 *
 * Questa rotta serve tre flussi ma aveva una sola destinazione d'errore, presa
 * dal ripristino password. Chi entrava con Google e restava troppo sulla
 * schermata di consenso — il verificatore PKCE scade — atterrava su un modulo
 * che gli diceva che il suo link di ripristino era scaduto: non ne aveva mai
 * chiesto uno, e non avendo una password da lì non poteva fare niente.
 */
function failureDestination(next: string): string {
  return next.startsWith(COMPLETE_SIGNUP_PATH)
    ? '/sign-in?error=google'
    : '/reset-password?error=link';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeRedirectPath(url.searchParams.get('next')) ?? '/dashboard';

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(failureDestination(next), url.origin)
      );
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
