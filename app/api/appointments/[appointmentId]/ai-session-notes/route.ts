import { after } from 'next/server';
import { getApiUser } from '@/lib/auth/api-user';
import { getAiNotesSessionForBooking } from '@/lib/core/ai-session-notes';
import { runAiNotesQueueAfterResponse } from '@/lib/core/ai-session-notes/queue-runner';
import { shouldNudgeWorker } from '@/lib/core/ai-session-notes/worker-nudge';

/**
 * Il riepilogo impiega dai dieci ai venti secondi, e qui dentro gira la coda.
 *
 * Senza questa riga la funzione eredita il limite predefinito e viene uccisa
 * a meta' generazione: il job resta appeso, viene recuperato e riparte. E'
 * esattamente il doppio tentativo visto su due sedute di fila — non un
 * guasto del modello, un budget di tempo troppo stretto.
 */
export const maxDuration = 60;


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
  const user = await getApiUser(request);
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
