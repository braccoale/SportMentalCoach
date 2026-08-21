import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/auth/supabase';
import { safeRedirectPath } from '@/lib/core/auth/safe-redirect';

/**
 * Supabase Auth code exchange (password reset, OAuth, magic links).
 * Exchanges the one-time `code` for a session cookie, then forwards to
 * `next` (same-origin paths only).
 *
 * Il filtro su `next` è condiviso con le action di accesso, e non è più un
 * `startsWith('/')`: `//altro-sito` supera quel controllo e il browser lo
 * legge come indirizzo assoluto, quindi bastava un collegamento costruito ad
 * arte per far atterrare l'utente altrove **subito dopo un accesso riuscito**
 * — il momento in cui si fida di più.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeRedirectPath(url.searchParams.get('next')) ?? '/dashboard';

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL('/reset-password?error=link', url.origin)
      );
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
