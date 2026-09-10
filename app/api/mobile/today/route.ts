import { getApiUser } from '@/lib/auth/api-user';
import { getAthleteToday } from '@/lib/core/ai-session-notes/athlete-today-store';

/**
 * «Oggi», deciso dal server.
 *
 * L'app riceve uno stato già scelto e un testo già scritto, non gli ingredienti
 * per calcolarli: quale delle sette situazioni mostrare, quale azione mettere in
 * cima con più coach, e se la stanza è aperta adesso — quest'ultima con
 * `canJoinVideoNow`, la stessa funzione che apre la stanza sul web.
 *
 * È la regola di questo repository: una regola si scrive una volta. Un secondo
 * calcolo dentro `mobile/` sarebbe un secondo insieme di condizioni da tenere
 * allineato, e in questo prodotto è già costato due volte.
 */
export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const payload = await getAthleteToday({
    athleteUserId: user.id,
    now: new Date(),
  });

  return Response.json(payload, {
    // Uno stato che dipende dal minuto non si mette in cache da nessuna parte.
    headers: { 'Cache-Control': 'no-store' },
  });
}
