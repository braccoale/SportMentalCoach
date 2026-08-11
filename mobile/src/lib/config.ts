/**
 * Le tre coordinate che l'app deve conoscere per esistere.
 *
 * Non ci sono segreti qui: la chiave anonima di Supabase è pubblica per
 * costruzione (le regole stanno sul database), e l'indirizzo dell'API è
 * l'indirizzo del sito. Tutto ciò che è segreto resta sul server, che è il
 * motivo per cui l'app non parla mai direttamente con LiveKit senza passare
 * da noi per farsi dare un token.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://www.kaipaicoaching.com';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function assertConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Mancano EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY: copiale in mobile/.env da .env.local del progetto web.'
    );
  }
}
