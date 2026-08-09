import { after } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { getAiNotesSessionForBooking } from '@/lib/core/ai-session-notes';
import { runAiNotesQueueAfterResponse } from '@/lib/core/ai-session-notes/queue-runner';
import { shouldNudgeWorker } from '@/lib/core/ai-session-notes/worker-nudge';

export const dynamic = 'force-dynamic';

/**
 * Ultima sveglia inviata, per sessione.
 *
 * Vive in memoria e si azzera a ogni istanza fredda: va bene cosi'. Non serve
 * una garanzia globale, serve che una pagina in polling non spari una sveglia
 * al secondo.
 */
const lastNudgeAt = new Map<number, number>();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }
  const bookingId = Number((await params).appointmentId);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return Response.json({ error: 'Appuntamento non valido.' }, { status: 400 });
  }

  const session = await getAiNotesSessionForBooking(bookingId, user.id);
  // Participant mismatch and a missing booking are intentionally indistinguishable.
  if (!session) {
    return Response.json({ session: null });
  }
  /*
   * Se la sessione sta ancora elaborando, questa richiesta la fa avanzare.
   *
   * E' la sveglia piu' affidabile che abbiamo, perche' parte dal browser di
   * qualcuno che sta effettivamente aspettando quel risultato — a differenza
   * del webhook, che a volte non arriva, e del cron, che passa una volta al
   * giorno.
   */
  const now = Date.now();
  if (
    shouldNudgeWorker({
      status: session.status,
      lastNudgeAt: lastNudgeAt.get(session.id) ?? null,
      now,
    })
  ) {
    lastNudgeAt.set(session.id, now);
    runAiNotesQueueAfterResponse();
  }
  return Response.json({ session });
}
