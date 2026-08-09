import 'server-only';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { sessionAiNotes, sessionAiProcessingJobs } from '@/lib/db/schema';
import { advanceAiNotesSessionStatus } from './session-status';
import { persistedTimelineFingerprint } from './timeline';
import type { AiSessionNotesDependencies } from './dependencies';

/**
 * Nessuna sessione resta a girare per sempre.
 *
 * Una seduta senza parlato — dieci secondi di prova, un microfono muto — non
 * produce nessun segmento. Senza segmenti non c'e' timeline, senza timeline
 * non si accoda nessun riepilogo, e la sessione restava in `processing` a
 * tempo indeterminato: la rotellina girava e nessuno diceva perche'.
 *
 * Uno stato terminale sbagliato e' meglio di uno stato che non arriva mai. Il
 * coach puo' reagire a «non ho sentito nulla»; non puo' reagire a una
 * rotellina.
 */

/**
 * Quanto si aspetta prima di dichiarare ferma una sessione che ha ancora
 * lavoro in corso da qualche parte.
 *
 * Generoso di proposito: la callback del provider puo' tardare, e chiudere
 * una sessione che stava per completarsi sarebbe peggio del problema.
 */
export const STUCK_PROCESSING_MINUTES = 30;

/** Audio registrato, ma nessuna parola dentro. Non e' un guasto. */
export const NO_SPEECH_ERROR_CODE = 'NO_SPEECH_DETECTED';

const ACTIVE_JOB_STATUSES = ['queued', 'processing', 'awaiting_provider'];

/** Quanto lavoro e' ancora vivo per questa sessione. */
async function activeJobCount(
  sessionId: number,
  dependencies: AiSessionNotesDependencies
): Promise<number> {
  const rows = await dependencies.db
    .select({ id: sessionAiProcessingJobs.id })
    .from(sessionAiProcessingJobs)
    .where(
      and(
        eq(sessionAiProcessingJobs.sessionAiNotesId, sessionId),
        inArray(sessionAiProcessingJobs.status, ACTIVE_JOB_STATUSES)
      )
    );
  return rows.length;
}

/**
 * Chiude la sessione se la trascrizione e' finita e non ha prodotto nulla.
 *
 * Si chiama subito dopo la normalizzazione: e' il momento in cui si sa che il
 * testo non arrivera' piu'. Non aspetta i trenta minuti, perche' qui la
 * certezza c'e' gia'.
 */
export async function closeSessionWithoutSpeech(
  sessionId: number,
  actorUserId: number,
  dependencies: AiSessionNotesDependencies
): Promise<boolean> {
  if (await persistedTimelineFingerprint(sessionId)) return false;
  if ((await activeJobCount(sessionId, dependencies)) > 0) return false;
  const advanced = await advanceAiNotesSessionStatus({
    sessionId,
    nextStatus: 'transcription_failed',
    actorUserId,
    executor: dependencies.db,
  });
  if (!advanced) return false;
  // Il motivo distingue il silenzio da un guasto: allo stesso stato si
  // arriva per due strade molto diverse, e chi legge deve sapere quale.
  await dependencies.db
    .update(sessionAiNotes)
    .set({ errorCode: NO_SPEECH_ERROR_CODE, updatedDate: new Date() })
    .where(eq(sessionAiNotes.id, sessionId));
  return true;
}

/**
 * Rete di sicurezza: le sessioni ferme in `processing` senza piu' lavoro.
 *
 * Copre i casi che nessuno ha previsto — un job cancellato a meta', una
 * callback che non arrivera' mai, un difetto ancora ignoto. Gira a ogni
 * passata del worker e costa una query.
 */
export async function closeStuckProcessingSessions(
  params: { limit: number; now?: Date },
  dependencies: AiSessionNotesDependencies
): Promise<number> {
  const now = params.now ?? new Date();
  const threshold = new Date(now.getTime() - STUCK_PROCESSING_MINUTES * 60_000);

  const stale = await dependencies.db
    .select({
      id: sessionAiNotes.id,
      requestedBy: sessionAiNotes.requestedBy,
    })
    .from(sessionAiNotes)
    .where(
      and(
        eq(sessionAiNotes.status, 'processing'),
        lt(sessionAiNotes.updatedDate, threshold),
        sql`NOT EXISTS (
          SELECT 1 FROM session_ai_processing_jobs j
          WHERE j.session_ai_notes_id = ${sessionAiNotes.id}
            AND j.status IN ('queued', 'processing', 'awaiting_provider')
        )`
      )
    )
    .limit(params.limit);

  let closed = 0;
  for (const session of stale) {
    const advanced = await advanceAiNotesSessionStatus({
      sessionId: session.id,
      // Senza timeline non c'e' niente da rileggere; con una timeline ma
      // senza riepilogo il difetto sta a valle della trascrizione.
      nextStatus: (await persistedTimelineFingerprint(session.id))
        ? 'report_failed'
        : 'transcription_failed',
      actorUserId: session.requestedBy,
      executor: dependencies.db,
    });
    if (advanced) closed += 1;
  }
  return closed;
}
