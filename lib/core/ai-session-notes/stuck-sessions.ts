import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  sessionAiNotes,
  sessionAiProcessingJobs,
  sessionAudioRecordings,
  sessionTranscriptSegments,
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

/**
 * Il più recente fra due segnali di progresso.
 *
 * Il driver del database può restituire la data come stringa: si normalizza
 * qui una volta sola, invece di scoprirlo con una scadenza calcolata su un
 * `Invalid Date`.
 */
function latestProgress(
  sessionUpdatedAt: Date,
  lastJobActivityAt: Date | string | null
): Date {
  if (!lastJobActivityAt) return sessionUpdatedAt;
  const jobMoment = new Date(lastJobActivityAt);
  if (Number.isNaN(jobMoment.getTime())) return sessionUpdatedAt;
  return jobMoment > sessionUpdatedAt ? jobMoment : sessionUpdatedAt;
}

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

/**
 * C'è del testo trascritto, anche se la timeline non è ancora stata
 * costruita.
 *
 * La timeline è un passaggio successivo alla trascrizione: guardare solo
 * quella significa scambiare «non ho ancora normalizzato» per «non ha
 * parlato nessuno». È esattamente l'errore che ha marcato «senza parlato»
 * una seduta con milleduecento segmenti.
 */
async function hasTranscriptSegments(sessionId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: sessionTranscriptSegments.id })
    .from(sessionTranscriptSegments)
    .where(eq(sessionTranscriptSegments.sessionAiNotesId, sessionId))
    .limit(1);
  return Boolean(row);
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
  /*
   * Ultimo controllo prima di scrivere uno stato terminale.
   *
   * Una sessione con lavoro ancora vivo non e' ferma: e' in corso. Chiuderla
   * qui significa dichiararla fallita mentre la sua trascrizione sta
   * arrivando — ed e' successo davvero: una seduta e' stata marcata «senza
   * parlato» cinque secondi prima che ne uscissero milleduecento segmenti.
   * Il verdetto va preso adesso, non con i numeri letti da chi ci ha portati
   * fin qui, perche' fra quella lettura e questa scrittura la coda ha potuto
   * muoversi.
   */
  if ((await activeJobCount(params.sessionId, dependencies)) > 0) {
    logPipeline({
      phase: 'session_expiry',
      outcome: 'skipped',
      sessionId: params.sessionId,
      detail: { reason: params.reason, motivo: 'lavoro ancora in coda' },
    });
    return false;
  }

  const hasTranscript = Boolean(
    await persistedTimelineFingerprint(params.sessionId)
  );

  /*
   * E se il testo c'e' ma la timeline non e' ancora stata costruita, la
   * sessione non e' muta: le manca solo un passaggio. Guardare solo la
   * timeline e' ciò che ha prodotto il verdetto «senza parlato» su una
   * trascrizione completa.
   */
  const hasRawTranscript = hasTranscript || (await hasTranscriptSegments(params.sessionId));
  const recorded = await hasRecordedAudio(params.sessionId, dependencies);
  const nextStatus = terminalStatusForExpiredSession({
    hasTranscript: hasRawTranscript,
  });
  const errorCode = expiryErrorCode({
    reason: params.reason,
    hasTranscript: hasRawTranscript,
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

  /*
   * Chiusa la sessione, si chiude anche il lavoro che la riguarda.
   *
   * Gli stati terminali non hanno transizioni in uscita, quindi un job
   * rimasto in coda non potra' mai riuscire: la generazione del riepilogo
   * pretende una sessione in `ready_for_review` o `approved` e respinge tutto
   * il resto in una manciata di millisecondi. Il job resterebbe li' a
   * consumare i suoi tentativi contro una porta chiusa, e a schermo si
   * leggerebbe «in coda» per qualcosa che non partira' mai. Meglio dire la
   * verita' subito.
   */
  /*
   * Import dinamico di proposito: `processing` importa gia' questo modulo
   * (`closeSessionWithoutSpeech`), quindi un import statico chiuderebbe un
   * anello fra i due. Qui l'anello non si forma, e la funzione si risolve al
   * momento della chiamata — che avviene comunque a moduli caricati.
   */
  const { cancelAiProcessingJobsForSession } = await import('./processing');
  const cancelled = await cancelAiProcessingJobsForSession(
    {
      sessionId: params.sessionId,
      actorUserId: params.actorUserId,
      reason: `session_expired_${params.reason}`,
    },
    dependencies
  );

  logPipeline({
    phase: 'session_expiry',
    outcome: 'ok',
    sessionId: params.sessionId,
    errorCode,
    counts: { jobAnnullati: cancelled },
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
      /*
       * L'ultimo momento in cui un job di questa sessione si e' mosso.
       *
       * La riga della sessione non viene toccata mentre la coda lavora: il
       * suo `updateddate` resta fermo all'ingresso in `processing`. Guardando
       * solo quello, una sessione che ha appena finito la trascrizione
       * risulta immobile da mezz'ora — e nella finestra fra «un job finisce»
       * e «il successivo entra in coda» il conteggio dei job vivi passa da
       * zero, quindi scatta la scadenza corta. E' esattamente cosi' che una
       * sessione sana e' stata dichiarata fallita 23 secondi dopo aver
       * completato la normalizzazione.
       */
      lastJobActivityAt: sql<Date | null>`(
        select max(j.updateddate) from session_ai_processing_jobs j
        where j.session_ai_notes_id = ${sessionAiNotes.id}
      )`,
    })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.status, 'processing'))
    .limit(params.limit);

  let closed = 0;
  for (const session of candidates) {
    const verdict = processingDeadlineVerdict({
      lastProgressAt: latestProgress(
        session.updatedDate,
        session.lastJobActivityAt
      ),
      activeJobCount: Number(session.activeJobs),
      now,
    });
    if (!verdict.expired) continue;

    /*
     * Un ultimo tentativo prima di dichiararla persa.
     *
     * Una sessione arriva qui anche quando non c'era niente di rotto a valle:
     * basta che una registrazione sia fallita perche' il passo di
     * normalizzazione non venga mai accodato, e allora la coda resta vuota,
     * la scadenza corta scatta, e un'ora di conversazione gia' trascritta
     * finisce in `report_failed`. E' successo alla seduta del 16 agosto.
     *
     * La regola giusta la conosce `enqueueNormalizationIfReady`, che ora
     * accetta anche i partecipanti la cui registrazione e' fallita. Chiamarla
     * qui copre ogni ordine in cui gli eventi possono arrivare — la
     * registrazione che fallisce prima dell'ultima trascrizione o dopo, la
     * callback che si perde e torna tardi — invece di rincorrerli uno a uno.
     *
     * Se accoda qualcosa, la sessione ha di nuovo lavoro vivo e non e' piu'
     * scaduta: si passa oltre e la si rivaluta al giro successivo.
     */
    if (verdict.reason === 'no_active_work') {
      /*
       * Importata qui e non in testa al file: `processing` importa gia'
       * `stuck-sessions`, e un import statico chiuderebbe il cerchio. Il
       * modulo viene risolto una volta sola e resta in cache.
       */
      const { enqueueNormalizationIfReady } = await import('./processing');
      const ripartita = await enqueueNormalizationIfReady(
        session.id,
        dependencies
      );
      if (ripartita) continue;
    }

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
