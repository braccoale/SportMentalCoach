import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/auth/supabase';

/**
 * Supabase Auth code exchange (password reset, OAuth, magic links).
 * Exchanges the one-time `code` for a session cookie, then forwards to
 * `next` (same-origin paths only).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next') ?? '/dashboard';
  // Only allow same-origin relative paths.
  const next = nextParam.startsWith('/') ? nextParam : '/dashboard';

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
