import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Auth clients.
 *
 * - `createSupabaseServer()` — cookie-aware client for the current request
 *   (RSC, server actions, route handlers). Reads/refreshes the user session.
 * - `createSupabaseAdmin()` — service-role client for privileged operations
 *   (creating users at signup, deleting identities). Server-only secret.
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY (server-only).
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} non è configurata. Aggiungila a .env / .env.local (Supabase → Settings → API).`
    );
  }
  return v;
}

export async function createSupabaseServer(): Promise<SupabaseClient> {
  // Read cookies BEFORE env validation: touching cookies() opts the route
  // into dynamic rendering, which must happen even when env is missing.
  const cookieStore = await cookies();
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookie writes are not allowed
          // there. The middleware refreshes sessions, so this is safe.
        }
      },
    },
  });
}

export function createSupabaseAdmin(): SupabaseClient {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
