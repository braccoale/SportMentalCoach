import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServer } from '@/lib/auth/supabase';
import { safeRedirectPath } from '@/lib/core/auth/safe-redirect';
import { COMPLETE_SIGNUP_PATH } from '@/lib/core/auth/signup-completion';
import { SIGNUP_ROLE_COOKIE } from '@/lib/core/auth/signup-role-cookie';

/**
 * Lo scambio del codice di Supabase Auth: ripristino password, OAuth, link
 * magici. Scambia il codice usa-e-getta con un cookie di sessione, poi manda a
 * `next` — solo percorsi di questo sito.
 *
 * Il filtro su `next` è condiviso con le action di accesso, e non è un
 * `startsWith('/')`: quel controllo lascia passare `//altro-sito`, e anche
 * `/⏎/altro-sito` e `/..//altro-sito`, che il browser risolve come indirizzo
 * assoluto. Bastava un collegamento costruito ad arte per far atterrare
 * l'utente altrove **subito dopo un accesso riuscito** — il momento in cui si
 * fida di più.
 */

/**
 * Dove mandare qualcuno quando la cosa non riesce.
 *
 * Due errori diversi finivano nello stesso posto sbagliato. Questa rotta serve
 * tre flussi ma aveva una sola destinazione d'errore, presa dal ripristino
 * password: chi entrava con Google e restava troppo sulla schermata di consenso
 * — il verificatore PKCE scade — atterrava su un modulo che gli diceva che il
 * suo link di ripristino era scaduto. Non ne aveva mai chiesto uno, e non
 * avendo una password da lì non poteva fare niente.
 *
 * Fra le due pagine di autenticazione decide il cookie del ruolo, che esiste
 * **solo** se il giro era partito da una registrazione: così chi stava
 * iscrivendosi torna sulla propria pagina, e riprovando non deve ridire se è
 * atleta o coach.
 */
function failureDestination(next: string, startedSignup: boolean): string {
  if (!next.startsWith(COMPLETE_SIGNUP_PATH)) {
    return '/reset-password?error=link';
  }
  return startedSignup ? '/sign-up?error=google' : '/sign-in?error=google';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeRedirectPath(url.searchParams.get('next')) ?? '/dashboard';

  const cookieStore = await cookies();
  const startedSignup = Boolean(cookieStore.get(SIGNUP_ROLE_COOKIE)?.value);

  const fail = () =>
    NextResponse.redirect(
      new URL(failureDestination(next, startedSignup), url.origin)
    );

  // Il fornitore ha risposto «no»: l'utente ha premuto Annulla, o non ha
  // concesso il permesso. Qui **non arriva nessun codice**, quindi finche' si
  // guardava solo il ramo dello scambio si tirava dritto verso `next` senza
  // sessione — e quella pagina, non trovandola, rimbalzava all'accesso senza
  // un messaggio. Sembrava che il pulsante non facesse niente.
  if (url.searchParams.get('error')) return fail();

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail();
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
