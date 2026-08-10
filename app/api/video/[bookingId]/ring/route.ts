import { getUser } from '@/lib/db/queries';
import { ringCounterpart } from '@/lib/core/video/ring';

/**
 * Fa squillare l'altro partecipante quando qualcuno entra nella stanza.
 *
 * Esiste come rotta lato server perché una notifica push non si può mandare
 * dal browser: servono le chiavi VAPID e l'elenco dei dispositivi iscritti.
 * Il controllo di partecipazione e la finestra della sessione stanno dentro
 * `ringCounterpart`, non qui.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const id = Number(bookingId);
  const user = await getUser();
  if (!user || !Number.isInteger(id)) {
    return new Response(null, { status: 401 });
  }

  const outcome = await ringCounterpart(id, user.id);
  return Response.json({ outcome });
}
