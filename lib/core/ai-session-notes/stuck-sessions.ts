import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  sessionAiNotes,
  sessionAiProcessingJobs,
  sessionAudioRecordings,
} from '@/lib/db/schema';
import { advanceAiNotesSessionStatus } from './session-status';
import { persistedTimelineFingerprint } from './timeline';
import {
  expiryErrorCode,
  processingDeadlineVerdict,
  terminalStatusForExpiredSession,
} from './session-deadlines';
import { logPipeline } from './pipeline-log';
import type { AiSessionNotesDependencies } from './dependencies';

/**
 * Nessuna sessione resta a girare per sempre.
 *
 * Una seduta senza parlato — dieci secondi di prova, un microfono muto — non
 * produce nessun segmento. Senza segmenti non c'è timeline, senza timeline
 * non si accoda nessun riepilogo, e la sessione restava in `processing` a
 * tempo indeterminato: la rotellina girava e nessuno diceva perché.
 *
 * Uno stato terminale sbagliato è meglio di uno stato che non arriva mai. Il
 * coach può reagire a «non ho sentito nulla»; non può reagire a una
 * rotellina.
 *
 * Le scadenze non stanno qui: stanno in `session-deadlines`, che è puro e si
 * verifica senza database. Qui c'è solo il lavoro di leggerle e applicarle.
 */

/** Audio registrato, ma nessuna parola dentro. Non è un guasto. */
export const NO_SPEECH_ERROR_CODE = 'NO_SPEECH_DETECTED';

const ACTIVE_JOB_STATUSES = ['queued', 'processing', 'awaiting_provider'];

/** Quanto lavoro è ancora vivo per questa sessione. */
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

async function hasRecordedAudio(
  sessionId: number,
  dependencies: AiSessionNotesDependencies
): Promise<boolean> {
  const rows = await dependencies.db
    .select({ id: sessionAudioRecordings.id })
    .from(sessionAudioRecordings)
    .where(
      and(
        eq(sessionAudioRecordings.sessionAiNotesId, sessionId),
        eq(sessionAudioRecordings.status, 'recorded')
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Porta una sessione allo stato terminale che le compete, con il motivo.
 *
 * Unico punto in cui una sessione esce d'ufficio: due percorsi diversi che
 * scrivono due stati diversi sarebbero il modo più rapido per riavere il
 * difetto di stasera in una forma nuova.
 */
async function expireSession(
  params: {
    sessionId: number;
    actorUserId: number;
    reason: 'no_active_work' | 'work_too_slow';
  },
  dependencies: AiSessionNotesDependencies
): Promise<boolean> {
  const hasTranscript = Boolean(
    await persistedTimelineFingerprint(params.sessionId)
  );
  const recorded = await hasRecordedAudio(params.sessionId, dependencies);
  const nextStatus = terminalStatusForExpiredSession({ hasTranscript });
  const errorCode = expiryErrorCode({
    reason: params.reason,
    hasTranscript,
    hasRecordedAudio: recorded,
  });

  const advanced = await advanceAiNotesSessionStatus({
    sessionId: params.sessionId,
    nextStatus,
    actorUserId: params.actorUserId,
    executor: dependencies.db,
  });
  if (!advanced) return false;

  await dependencies.db
    .update(sessionAiNotes)
    .set({ errorCode, updatedDate: new Date() })
    .where(eq(sessionAiNotes.id, params.sessionId));

  logPipeline({
    phase: 'session_expiry',
    outcome: 'ok',
    sessionId: params.sessionId,
    errorCode,
    detail: { reason: params.reason, nextStatus, hasTranscript },
  });
  return true;
}

/**
 * Chiude la sessione se la trascrizione è finita e non ha prodotto nulla.
 *
 * Si chiama subito dopo la normalizzazione: è il momento in cui si sa che il
 * testo non arriverà più. Non aspetta nessuna scadenza, perché qui la
 * certezza c'è già.
 */
export async function closeSessionWithoutSpeech(
  sessionId: number,
  actorUserId: number,
  dependencies: AiSessionNotesDependencies
): Promise<boolean> {
  if (await persistedTimelineFingerprint(sessionId)) return false;
  if ((await activeJobCount(sessionId, dependencies)) > 0) return false;
  return expireSession(
    { sessionId, actorUserId, reason: 'no_active_work' },
    dependencies
  );
}

/**
 * Rete di sicurezza: le sessioni ferme in `processing` oltre la scadenza.
 *
 * Copre i casi che nessuno ha previsto — un job cancellato a metà, una
 * callback che non arriverà mai, un difetto ancora ignoto. Gira a ogni
 * passata del worker e costa due query.
 */
export async function closeStuckProcessingSessions(
  params: { limit: number; now?: Date },
  dependencies: AiSessionNotesDependencies
): Promise<number> {
  const now = params.now ?? new Date();

  const candidates = await dependencies.db
    .select({
      id: sessionAiNotes.id,
      requestedBy: sessionAiNotes.requestedBy,
      updatedDate: sessionAiNotes.updatedDate,
      activeJobs: sql<number>`(
        select count(*)::int from session_ai_processing_jobs j
        where j.session_ai_notes_id = ${sessionAiNotes.id}
          and j.status in ('queued', 'processing', 'awaiting_provider')
      )`,
    })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.status, 'processing'))
    .limit(params.limit);

  let closed = 0;
  for (const session of candidates) {
    const verdict = processingDeadlineVerdict({
      lastProgressAt: session.updatedDate,
      activeJobCount: Number(session.activeJobs),
      now,
    });
    if (!verdict.expired) continue;
    const advanced = await expireSession(
      {
        sessionId: session.id,
        actorUserId: session.requestedBy,
        reason: verdict.reason,
      },
      dependencies
    );
    if (advanced) closed += 1;
  }
  return closed;
}

/**
 * Quante sessioni sono oltre la loro scadenza in questo momento.
 *
 * È il controllo che deve valere zero: se non vale zero, o la rete di
 * sicurezza non sta girando o c'è uno stato che nessuno chiude. Serve al
 * cruscotto, dove la domanda «va tutto bene?» deve avere una risposta in tre
 * secondi.
 */
export async function countExpiredSessions(
  dependencies: AiSessionNotesDependencies,
  now: Date = new Date()
): Promise<number> {
  const rows = await dependencies.db
    .select({
      id: sessionAiNotes.id,
      updatedDate: sessionAiNotes.updatedDate,
      activeJobs: sql<number>`(
        select count(*)::int from session_ai_processing_jobs j
        where j.session_ai_notes_id = ${sessionAiNotes.id}
          and j.status in ('queued', 'processing', 'awaiting_provider')
      )`,
    })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.status, 'processing'));

  return rows.filter(
    (row) =>
      processingDeadlineVerdict({
        lastProgressAt: row.updatedDate,
        activeJobCount: Number(row.activeJobs),
        now,
      }).expired
  ).length;
}
