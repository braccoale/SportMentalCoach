import { getApiUser } from '@/lib/auth/api-user';
import { createRoomToken } from '@/lib/core/video';
import { trackUsage } from '@/lib/core/usage/server';

/**
 * Token LiveKit per entrare in una stanza, dall'app.
 *
 * Sul web il token viene generato dentro la pagina e passato al componente:
 * non esiste un indirizzo che un client esterno possa chiamare. L'app nativa
 * ne ha bisogno, e non deve ricevere un permesso più largo di quello del
 * browser — per questo qui non c'è nessuna logica propria: si delega a
 * `createRoomToken`, la stessa funzione che serve la pagina web, con i suoi
 * controlli su partecipazione, stato della prenotazione, tutela dei minori e
 * finestra della sessione.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const id = Number(bookingId);
  const user = await getApiUser(request);
  if (!user || !Number.isInteger(id)) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const result = await createRoomToken(id, user.id);
  if (!result.ok) {
    await trackUsage(
      {
        event: 'session_joined',
        userId: user.id,
        entityType: 'booking',
        entityId: id,
        outcome: 'denied',
        props: { reason: String(result.reason).slice(0, 50) },
      },
      request
    );
    // Il motivo viene inoltrato così com'è: l'app deve poter distinguere
    // «sei arrivato presto» da «non sei di questa sessione», e mostrarlo.
    return Response.json({ error: result.reason }, { status: 403 });
  }

  await trackUsage(
    {
      event: 'session_joined',
      userId: user.id,
      role: result.viewerIsCoach ? 'coach' : 'athlete',
      entityType: 'booking',
      entityId: id,
    },
    request
  );

  return Response.json({
    token: result.token,
    url: result.url,
    room: result.room,
    otherName: result.otherName,
    viewerIsCoach: result.viewerIsCoach,
    // Serve alla sala d'attesa per riconoscere il coach fra i presenti. Il web
    // lo prendeva già da `createRoomToken`; qui mancava solo di inoltrarlo, e
    // senza di esso l'app non poteva distinguere «c'è il coach» da «c'è
    // qualcuno».
    coachIdentity: result.coachIdentity,
  });
}
