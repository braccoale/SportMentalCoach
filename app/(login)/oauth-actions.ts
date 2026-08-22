'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/auth/supabase';
import { safeRedirectPath } from '@/lib/core/auth/safe-redirect';
import { COMPLETE_SIGNUP_PATH } from '@/lib/core/auth/signup-completion';
import {
  SIGNUP_ROLE_COOKIE,
  SIGNUP_ROLE_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/core/auth/signup-role-cookie';

/**
 * L'avvio dell'accesso con Google.
 *
 * **Perché parte dal server e non dal browser.** `lib/auth/supabase.ts` è
 * `server-only` e un client lato browser qui non esiste: aggiungerne uno solo
 * per premere un pulsante significherebbe spedire la libreria di Auth a ogni
 * visitatore della pagina di accesso. `signInWithOAuth` con
 * `skipBrowserRedirect` restituisce l'indirizzo di Google invece di saltarci
 * sopra, e il reindirizzamento lo fa Next. Il pulsante resta un modulo, come
 * il resto di questa parte del prodotto.
 *
 * È anche il solo punto in cui possiamo scrivere un cookie **prima** di
 * partire, ed è ciò che salva il ruolo scelto: vedi `SIGNUP_ROLE_COOKIE`.
 */

/*
 * Il nome del cookie e la sua durata vivono in `lib/core/auth`: da un file
 * `'use server'` si possono esportare solo funzioni asincrone, e quel nome
 * serve anche alla pagina che lo legge e all'azione che lo cancella.
 *
 * `SameSite=Lax` qui sotto non e' un dettaglio: il ritorno da Google e' una
 * navigazione di primo livello, che con `Strict` non si porterebbe dietro il
 * cookie — e il ruolo scelto andrebbe perso proprio al rientro.
 */

/** I ruoli che una registrazione può scegliere da sé. */
const SELECTABLE_ROLES = new Set(['athlete', 'coach']);

/**
 * L'origine a cui Google deve riportare l'utente.
 *
 * Si parte dagli header perche' lo stesso codice gira sull'anteprima, in
 * produzione e in locale: un indirizzo deciso altrove manderebbe chi prova
 * sull'anteprima a completare la registrazione in produzione.
 *
 * Se mancano tutti, si restituisce `null` e il flusso si ferma con un errore
 * visibile. **Non** si ripiega sul dominio di produzione: sarebbe l'unico caso
 * in cui questa funzione manda l'utente di un'anteprima a completare la
 * registrazione sul sito vero — cioe' esattamente il guaio che partire dagli
 * header serve a evitare. Meglio fallire dove si vede.
 *
 * (La prima versione restituiva la stringa `https://null`, che Supabase
 * rifiuta come indirizzo di ritorno non valido, con un errore che non dice
 * nulla a nessuno.)
 */
async function requestOrigin(): Promise<string | null> {
  const requestHeaders = await headers();

  const origin = requestHeaders.get('origin');
  if (origin) return origin;

  const host =
    requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  if (host) {
    const proto = requestHeaders.get('x-forwarded-proto') ?? 'https';
    return `${proto}://${host}`;
  }

  return null;
}

export async function startGoogleOAuth(formData: FormData): Promise<void> {
  const rawRole = String(formData.get('role') ?? '').trim();
  const cookieStore = await cookies();

  if (SELECTABLE_ROLES.has(rawRole)) {
    cookieStore.set(SIGNUP_ROLE_COOKIE, rawRole, {
      path: '/',
      maxAge: SIGNUP_ROLE_COOKIE_MAX_AGE_SECONDS,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });
  } else {
    // Dalla pagina di accesso non si sceglie un ruolo: un cookie rimasto da un
    // tentativo precedente deciderebbe al posto dell'utente.
    cookieStore.set(SIGNUP_ROLE_COOKIE, '', { path: '/', maxAge: 0 });
  }

  // Dove tornare dopo il completamento (la scheda coach da cui era partita una
  // richiesta di prenotazione, per esempio). Stessa guardia di tutti gli altri
  // punti: un `startsWith('/')` lascerebbe passare `//altro-sito`, e avere la
  // stessa regola scritta in due modi significa che uno dei due e' quello
  // sbagliato.
  const backTo =
    safeRedirectPath(String(formData.get('redirect') ?? '').trim()) ?? '';

  const origin = await requestOrigin();
  if (!origin) {
    console.error('Avvio OAuth Google: origine della richiesta sconosciuta.');
    redirect('/sign-in?error=google');
  }

  const next = backTo
    ? `${COMPLETE_SIGNUP_PATH}?redirect=${encodeURIComponent(backTo)}`
    : COMPLETE_SIGNUP_PATH;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    console.error('Avvio OAuth Google non riuscito:', error);
    redirect('/sign-in?error=google');
  }

  redirect(data.url);
}
