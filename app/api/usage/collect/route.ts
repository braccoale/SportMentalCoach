import { handleCollect } from '@/lib/core/usage/server';

export const dynamic = 'force-dynamic';

/**
 * Dove il browser manda ciò che ha misurato (tempi di apertura, errori visti,
 * visite alle pagine pubbliche). Risponde sempre 204 e non chiede l'accesso:
 * non porta con sé nessun utente e nessun indirizzo IP viene conservato. Chi
 * sta nell'elenco delle esclusioni non lascia nessuna traccia.
 */
export async function POST(request: Request) {
  return handleCollect(request);
}
