import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';

/**
 * Chi sta chiamando questa rotta, dal browser **o** dall'app.
 *
 * Il web autentica con i cookie di Supabase Auth, che il browser allega da
 * solo. Un'app nativa non ha cookie: tiene il token della sessione nel
 * portachiavi del dispositivo e lo manda nell'intestazione `Authorization`.
 * Sono due modi di dire la stessa cosa, e le rotte condivise fra i due client
 * non devono conoscerne che uno.
 *
 * L'ordine conta: prima il Bearer, perché è esplicito. Se una richiesta lo
 * porta, sta dicendo con quale identità vuole essere trattata, e un cookie
 * rimasto in giro non deve poterla scavalcare.
 */
export async function getApiUser(request: Request) {
  const header = request.headers.get('authorization');
  const bearer = header?.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : null;

  if (!bearer) return getUser();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  // Client senza sessione: serve solo a far validare il token da Supabase.
  // La firma la verifica loro, noi non teniamo nessun segreto qui.
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser(bearer);
  if (error || !authUser) return null;

  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.authId, authUser.id), isNull(users.deletedAt)))
    .limit(1);

  return row ?? null;
}
