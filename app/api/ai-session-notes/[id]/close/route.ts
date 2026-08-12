import { getApiUser } from '@/lib/auth/api-user';
import { getRecordingStatus } from '@/lib/core/ai-session-notes/recording';
import { closeAiNotesSession } from '@/lib/core/ai-session-notes/session-close';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';
import { aiNotesErrorResponse } from '@/lib/core/ai-session-notes/http';
import { allowRecordingMutation } from '@/lib/core/ai-session-notes/rate-limit';
import { runAiNotesQueueAfterResponse } from '@/lib/core/ai-session-notes/queue-runner';

/**
 * Il riepilogo impiega dai dieci ai venti secondi, e qui dentro gira la coda.
 *
 * Senza questa riga la funzione eredita il limite predefinito e viene uccisa
 * a meta' generazione: il job resta appeso, viene recuperato e riparte. E'
 * esattamente il doppio tentativo visto su due sedute di fila — non un
 * guasto del modello, un budget di tempo troppo stretto.
 */
export const maxDuration = 60;


/**
 * Chiusura definitiva della sessione Appunti AI, decisa dal coach.
 *
 * È distinta dall'arresto della registrazione: quello è una pausa, e la
 * sessione resta riprendibile. Questa chiude, e dopo di essa nemmeno un
 * microfono ripubblicato fa ripartire la registrazione. La videochiamata non
 * viene toccata.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }
  if (!allowRecordingMutation(user.id, 'close')) {
    return Response.json(
      { error: 'Troppe richieste. Riprova tra un minuto.' },
      { status: 429 }
    );
  }
  const sessionId = Number((await params).id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return Response.json({ error: 'Sessione non valida.' }, { status: 400 });
  }
  // A differenza degli altri comandi, qui un corpo c'e': l'osservazione che
  // il coach scrive chiudendo. Nient'altro viene accettato.
  const raw = await request.text();
  let closingNote: string | null = null;
  if (raw.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return Response.json({ error: 'Richiesta non valida.' }, { status: 400 });
    }
    const value = (parsed as { closingNote?: unknown } | null)?.closingNote;
    if (value !== undefined && typeof value !== 'string') {
      return Response.json({ error: 'Nota non valida.' }, { status: 400 });
    }
    closingNote = typeof value === 'string' ? value : null;
  }
  try {
    const dependencies = createProductionAiSessionNotesDependencies();
    await closeAiNotesSession(
      {
        sessionId,
        reason: 'coach_closed',
        actorUserId: user.id,
        enforceCoach: true,
        closingNote,
      },
      dependencies.liveKit
    );
    /*
     * Sveglia il worker adesso.
     *
     * Prima l'unica sveglia utile era il webhook LiveKit, e quando non
     * arrivava la coda restava ferma fino al cron — che sul piano Hobby passa
     * una volta al giorno. Qui invece siamo certi di due cose: la sessione e'
     * appena stata chiusa, e c'e' qualcuno dall'altra parte che aspetta il
     * risultato. Best effort: la chiusura e' gia' avvenuta e non deve fallire
     * per una sveglia mancata.
     */
    runAiNotesQueueAfterResponse();
    return Response.json({
      recording: await getRecordingStatus(sessionId, user.id),
    });
  } catch (error) {
    return aiNotesErrorResponse(error);
  }
}
