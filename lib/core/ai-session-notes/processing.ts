import 'server-only';
import { and, asc, count, eq, inArray, lte, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  sessionAiAuditEvents,
  sessionAiConsents,
  sessionAiNotes,
  sessionAiProcessingJobs,
  sessionAudioRecordings,
  sessionParticipantRecordings,
  sessionTranscriptSegments,
  sessionTranscriptTimelineSegments,
  sessionTranscriptionRequests,
  type AiProcessingJobStatus,
  type AiProcessingJobType,
} from '@/lib/db/schema';
import {
  getSpeechToTextProvider,
} from './providers';
import {
  AiNotesProcessingError,
  isTranscriptionRequestStale,
  jobRequiresParticipantRecording,
  retryDelayMs,
  retryStatus,
  sessionCanProcess,
  STALE_TRANSCRIPTION_REQUEST_MINUTES,
} from './processing-policy';
import { dispatchPendingTranscriptionRequests } from './transcription-dispatch';
import { closeSessionWithoutSpeech } from './stuck-sessions';
import { persistedTimelineFingerprint, rebuildSessionTimeline } from './timeline';
import { advanceAiNotesSessionStatus } from './session-status';
import { sourceFingerprint, type TimelineSource } from './timeline';
import type { AiSessionNotesDependencies } from './dependencies';

type JobRow = {
  id: number;
  session_ai_notes_id: number;
  participant_recording_id: number | null;
  job_type: AiProcessingJobType;
  status: AiProcessingJobStatus;
  provider: string;
  attempt_count: number;
  max_attempts: number;
  idempotency_key: string;
  requested_by: number;
};

async function sessionProcessingContext(
  executor: DbOrTx,
  sessionId: number
) {
  const [session] = await executor
    .select({
      id: sessionAiNotes.id,
      requestedBy: sessionAiNotes.requestedBy,
      status: sessionAiNotes.status,
    })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.id, sessionId))
    .limit(1);
  if (!session) {
    throw new AiNotesProcessingError('JOB_NOT_FOUND', 'Sessione AI non trovata.');
  }
  const consents = await executor
    .select({ status: sessionAiConsents.consentStatus })
    .from(sessionAiConsents)
    .where(eq(sessionAiConsents.sessionAiNotesId, sessionId));
  return { ...session, consents: consents.map((row) => row.status) };
}

async function assertProcessableSession(
  executor: DbOrTx,
  sessionId: number
) {
  const context = await sessionProcessingContext(executor, sessionId);
  if (
    !sessionCanProcess({
      sessionStatus: context.status,
      consentStatuses: context.consents,
    })
  ) {
    throw new AiNotesProcessingError(
      'SESSION_NOT_PROCESSABLE',
      'Il consenso o lo stato della sessione non consente l’elaborazione.'
    );
  }
  return context;
}

async function auditJob(
  executor: DbOrTx,
  params: {
    sessionId: number;
    actorUserId: number;
    eventType:
      | 'processing_job_queued'
      | 'processing_job_claimed'
      | 'processing_job_completed'
      | 'processing_job_failed'
      | 'processing_job_cancelled'
      | 'processing_job_recovered';
    jobId: number;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  }
) {
  await executor.insert(sessionAiAuditEvents).values({
    sessionAiNotesId: params.sessionId,
    eventType: params.eventType,
    actorUserId: params.actorUserId,
    eventMetadata: { jobId: params.jobId, ...(params.metadata ?? {}) },
    ...(params.occurredAt
      ? {
          createdDate: params.occurredAt,
          updatedDate: params.occurredAt,
        }
      : {}),
    createdBy: params.actorUserId,
    updatedBy: params.actorUserId,
  });
}

export async function enqueueAiProcessingJob(params: {
  sessionId: number;
  participantRecordingId?: number | null;
  jobType: AiProcessingJobType;
  idempotencyKey: string;
  maxAttempts?: number;
  availableAfter?: Date;
  metadata?: Record<string, unknown>;
  executor?: DbOrTx;
}): Promise<{ id: number; status: AiProcessingJobStatus; duplicate: boolean }> {
  if (!params.idempotencyKey || params.idempotencyKey.length > 200) {
    throw new AiNotesProcessingError('INVALID_JOB', 'Chiave idempotenza non valida.');
  }
  if (
    jobRequiresParticipantRecording(params.jobType) !==
    Boolean(params.participantRecordingId)
  ) {
    throw new AiNotesProcessingError(
      'INVALID_JOB',
      'Il tipo job richiede una correlazione partecipante non valida.'
    );
  }
  const maxAttempts = params.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new AiNotesProcessingError('INVALID_JOB', 'Numero tentativi non valido.');
  }

  const executor = params.executor ?? db;
  return executor.transaction(async (tx) => {
    const context = await assertProcessableSession(tx, params.sessionId);
    if (params.participantRecordingId) {
      const [participantRecording] = await tx
        .select({ id: sessionParticipantRecordings.id })
        .from(sessionParticipantRecordings)
        .where(
          and(
            eq(sessionParticipantRecordings.id, params.participantRecordingId),
            eq(sessionParticipantRecordings.sessionAiNotesId, params.sessionId)
          )
        )
        .limit(1);
      if (!participantRecording) {
        throw new AiNotesProcessingError(
          'PARTICIPANT_RECORDING_NOT_FOUND',
          'Registrazione partecipante non trovata.'
        );
      }
    }

    const [inserted] = await tx
      .insert(sessionAiProcessingJobs)
      .values({
        sessionAiNotesId: params.sessionId,
        participantRecordingId: params.participantRecordingId ?? null,
        jobType: params.jobType,
        provider:
          params.jobType === 'transcription'
            ? getSpeechToTextProvider().name
            : params.jobType === 'report_generation'
              ? 'openai'
              : 'disabled',
        maxAttempts,
        availableAfter: params.availableAfter ?? new Date(),
        idempotencyKey: params.idempotencyKey,
        metadata: params.metadata ?? {},
        createdBy: context.requestedBy,
        updatedBy: context.requestedBy,
      })
      .onConflictDoNothing({ target: sessionAiProcessingJobs.idempotencyKey })
      .returning({
        id: sessionAiProcessingJobs.id,
        status: sessionAiProcessingJobs.status,
      });
    if (!inserted) {
      const [existing] = await tx
        .select({
          id: sessionAiProcessingJobs.id,
          status: sessionAiProcessingJobs.status,
          sessionId: sessionAiProcessingJobs.sessionAiNotesId,
          type: sessionAiProcessingJobs.jobType,
          participantRecordingId: sessionAiProcessingJobs.participantRecordingId,
        })
        .from(sessionAiProcessingJobs)
        .where(eq(sessionAiProcessingJobs.idempotencyKey, params.idempotencyKey))
        .limit(1);
      if (
        !existing ||
        existing.sessionId !== params.sessionId ||
        existing.type !== params.jobType ||
        existing.participantRecordingId !== (params.participantRecordingId ?? null)
      ) {
        throw new AiNotesProcessingError(
          'INVALID_JOB',
          'Chiave idempotenza già associata a un’altra operazione.'
        );
      }
      return {
        id: existing.id,
        status: existing.status as AiProcessingJobStatus,
        duplicate: true,
      };
    }
    await auditJob(tx, {
      sessionId: params.sessionId,
      actorUserId: context.requestedBy,
      eventType: 'processing_job_queued',
      jobId: inserted.id,
      metadata: { jobType: params.jobType },
    });
    return {
      id: inserted.id,
      status: inserted.status as AiProcessingJobStatus,
      duplicate: false,
    };
  });
}

/** Atomically claims one due job with SKIP LOCKED for multi-worker safety. */
export async function claimNextAiProcessingJob(params: {
  workerId: string;
}, dependencies: AiSessionNotesDependencies): Promise<JobRow | null> {
  if (!params.workerId || params.workerId.length > 160) {
    throw new AiNotesProcessingError('INVALID_JOB', 'Worker non valido.');
  }
  const now = dependencies.clock.now();
  // Il driver postgres-js esegue i template `sql` grezzi via `unsafe`, che non
  // serializza gli oggetti Date: si passa l'ISO con cast esplicito.
  const nowIso = now.toISOString();
  const claimed = await dependencies.db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      WITH candidate AS (
        SELECT j.id
        FROM session_ai_processing_jobs j
        WHERE j.status = 'queued'
          AND j.available_after <= ${nowIso}::timestamptz
          AND j.attempt_count < j.max_attempts
          AND EXISTS (
            SELECT 1 FROM session_ai_notes s
            WHERE s.id = j.session_ai_notes_id
              AND s.status NOT IN ('cancelled', 'consent_rejected')
          )
          AND NOT EXISTS (
            SELECT 1 FROM session_ai_consents c
            WHERE c.session_ai_notes_id = j.session_ai_notes_id
              AND c.consent_status IN ('rejected', 'revoked')
          )
        ORDER BY j.available_after, j.id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE session_ai_processing_jobs j
      SET
        status = 'processing',
        attempt_count = j.attempt_count + 1,
        started_at = COALESCE(j.started_at, ${nowIso}::timestamptz),
        locked_at = ${nowIso}::timestamptz,
        locked_by = ${params.workerId},
        error_code = NULL,
        error_message_sanitized = NULL,
        updateddate = ${nowIso}::timestamptz
      FROM candidate
      WHERE j.id = candidate.id
      RETURNING
        j.id, j.session_ai_notes_id, j.participant_recording_id,
        j.job_type, j.status, j.provider, j.attempt_count, j.max_attempts,
        j.idempotency_key,
        (SELECT requested_by FROM session_ai_notes WHERE id = j.session_ai_notes_id) AS requested_by
    `);
    const row = (rows as unknown as JobRow[])[0] ?? null;
    if (row) {
      await auditJob(tx, {
        sessionId: row.session_ai_notes_id,
        actorUserId: row.requested_by,
        eventType: 'processing_job_claimed',
        jobId: row.id,
        metadata: { worker: params.workerId, attempt: row.attempt_count },
        occurredAt: now,
      });
    }
    return row;
  });
  return claimed;
}

/**
 * Rimette in coda i job le cui richieste non hanno mai ricevuto risposta.
 *
 * È il meccanismo che impedisce a una trascrizione di perdersi: il provider
 * non conserva i risultati, quindi una consegna smarrita si recupera solo
 * reinviando l'audio, che resta nostro per la durata della retention. La
 * richiesta persa viene marcata `failed` perché il conteggio dei tentativi
 * resti onesto, e il job torna `queued`.
 */
export async function recoverStaleTranscriptionRequests(
  params: { limit: number },
  dependencies: AiSessionNotesDependencies
): Promise<number> {
  const now = dependencies.clock.now();
  const limit = Math.max(1, Math.min(params.limit, 100));
  const rows = await dependencies.db
    .select({
      id: sessionTranscriptionRequests.id,
      jobId: sessionTranscriptionRequests.processingJobId,
      submittedAt: sessionTranscriptionRequests.submittedAt,
      status: sessionTranscriptionRequests.status,
    })
    .from(sessionTranscriptionRequests)
    .where(eq(sessionTranscriptionRequests.status, 'submitted'))
    .orderBy(asc(sessionTranscriptionRequests.id))
    .limit(limit);

  let recovered = 0;
  for (const row of rows) {
    if (row.status !== 'submitted') continue;
    if (
      !isTranscriptionRequestStale({
        submittedAt: row.submittedAt,
        now,
        staleAfterMinutes: STALE_TRANSCRIPTION_REQUEST_MINUTES,
      })
    ) {
      continue;
    }
    const [claimed] = await dependencies.db
      .update(sessionTranscriptionRequests)
      .set({
        status: 'failed',
        errorCode: 'CALLBACK_NOT_RECEIVED',
        updatedDate: now,
      })
      .where(
        and(
          eq(sessionTranscriptionRequests.id, row.id),
          eq(sessionTranscriptionRequests.status, 'submitted')
        )
      )
      .returning({ id: sessionTranscriptionRequests.id });
    if (!claimed) continue;

    await dependencies.db
      .update(sessionAiProcessingJobs)
      .set({ status: 'queued', availableAfter: now, updatedDate: now })
      .where(
        and(
          eq(sessionAiProcessingJobs.id, row.jobId),
          eq(sessionAiProcessingJobs.status, 'awaiting_provider')
        )
      );
    recovered += 1;
  }
  return recovered;
}

/**
 * Mette il job in attesa del provider.
 *
 * Non è né completato né fallito: il lavoro è stato consegnato e la risposta
 * arriverà su un altro percorso. Nessun worker deve riprenderlo nel
 * frattempo, ed è per questo che `awaiting_provider` è fuori dagli stati
 * claimabili.
 */
export async function parkAiProcessingJob(params: {
  jobId: number;
  workerId: string;
}, dependencies: AiSessionNotesDependencies): Promise<boolean> {
  const [updated] = await dependencies.db
    .update(sessionAiProcessingJobs)
    .set({
      status: 'awaiting_provider',
      lockedBy: null,
      lockedAt: null,
      updatedDate: dependencies.clock.now(),
    })
    .where(
      and(
        eq(sessionAiProcessingJobs.id, params.jobId),
        eq(sessionAiProcessingJobs.status, 'processing'),
        eq(sessionAiProcessingJobs.lockedBy, params.workerId)
      )
    )
    .returning({ id: sessionAiProcessingJobs.id });
  return Boolean(updated);
}

export async function completeAiProcessingJob(params: {
  jobId: number;
  workerId: string;
  providerOperationId?: string;
}, dependencies: AiSessionNotesDependencies): Promise<boolean> {
  const now = dependencies.clock.now();
  const [job] = await dependencies.db
    .update(sessionAiProcessingJobs)
    .set({
      status: 'completed',
      completedAt: now,
      lockedAt: null,
      lockedBy: null,
      providerOperationId: params.providerOperationId ?? null,
      updatedDate: now,
    })
    .where(
      and(
        eq(sessionAiProcessingJobs.id, params.jobId),
        eq(sessionAiProcessingJobs.status, 'processing'),
        eq(sessionAiProcessingJobs.lockedBy, params.workerId)
      )
    )
    .returning({
      id: sessionAiProcessingJobs.id,
      sessionId: sessionAiProcessingJobs.sessionAiNotesId,
    });
  if (!job) return false;
  const context = await sessionProcessingContext(
    dependencies.db,
    job.sessionId
  );
  await auditJob(dependencies.db, {
    sessionId: job.sessionId,
    actorUserId: context.requestedBy,
    eventType: 'processing_job_completed',
    jobId: job.id,
    occurredAt: now,
  });
  return true;
}

/** Queues exactly one derived session-level normalization input version. */
export async function enqueueNormalizationIfReady(
  sessionId: number,
  dependencies: AiSessionNotesDependencies
): Promise<boolean> {
  const participants = await dependencies.db.select({ id: sessionParticipantRecordings.id }).from(sessionParticipantRecordings).where(eq(sessionParticipantRecordings.sessionAiNotesId, sessionId));
  if (participants.length < 2) return false;
  const completed = await dependencies.db.select({ participantId: sessionAiProcessingJobs.participantRecordingId }).from(sessionAiProcessingJobs).where(and(eq(sessionAiProcessingJobs.sessionAiNotesId, sessionId), eq(sessionAiProcessingJobs.jobType, 'transcription'), eq(sessionAiProcessingJobs.status, 'completed')));
  if (!participants.every(p => completed.some(j => j.participantId === p.id))) return false;
  const sources = await dependencies.db.select({ id: sessionTranscriptSegments.id, participantRecordingId: sessionTranscriptSegments.participantRecordingId, participantUserId: sessionTranscriptSegments.participantUserId, participantRole: sessionTranscriptSegments.speakerRole, participantSequence: sessionTranscriptSegments.sequenceNumber, startMs: sessionTranscriptSegments.startedAtMs, endMs: sessionTranscriptSegments.endedAtMs, text: sessionTranscriptSegments.text, provider: sessionTranscriptSegments.provider, model: sessionTranscriptSegments.providerModel }).from(sessionTranscriptSegments).where(eq(sessionTranscriptSegments.sessionAiNotesId, sessionId));
  const fingerprintSources = sources
    .filter((s) => s.participantRecordingId !== null && (s.participantRole === 'coach' || s.participantRole === 'athlete'))
    .map((s) => ({ ...s, participantRecordingId: s.participantRecordingId!, participantRole: s.participantRole as 'coach' | 'athlete' }));
  const fingerprint = sourceFingerprint(fingerprintSources);
  const queued = await enqueueAiProcessingJob({ sessionId, jobType: 'transcript_normalization', idempotencyKey: `normalization:${sessionId}:${fingerprint}`, metadata: { sourceFingerprint: fingerprint }, availableAfter: dependencies.clock.now(), executor: dependencies.db });

  // Nessun avanzamento di stato qui. Con una riconnessione entrambe le
  // trascrizioni possono completarsi mentre la sessione è ancora in corso:
  // chiuderla a quel punto la renderebbe non più registrabile a metà seduta,
  // che è esattamente il difetto che questo percorso deve evitare. La
  // sessione passa a `processing` solo per mano di `closeAiNotesSession`.

  return !queued.duplicate;
}

/**
 * Accoda il Session Compass appena esiste una timeline normalizzata.
 * La chiave è per sessione: il worker genera la prima bozza una sola volta;
 * le rigenerazioni successive restano un'azione esplicita del coach.
 */
export async function enqueueSessionCompassIfReady(
  sessionId: number,
  dependencies: AiSessionNotesDependencies
): Promise<boolean> {
  // La chiave era legata alla sola sessione: un riepilogo generato su una
  // trascrizione parziale non veniva mai rifatto quando arrivava il resto, e
  // il coach leggeva l'analisi di mezza seduta credendola completa. Legandola
  // al contenuto, una timeline invariata non produce lavoro e una timeline
  // estesa — cioè ogni riconnessione — produce un riepilogo nuovo.
  const fingerprint = await persistedTimelineFingerprint(sessionId);
  if (!fingerprint) return false;

  // Un solo riepilogo per volta può essere in lavorazione: l'indice unico
  // sui job attivi lo impone, e senza questo controllo un fingerprint nuovo
  // che arriva mentre il precedente è ancora in coda solleverebbe una
  // violazione invece di aspettare. Non è una perdita: la corsa successiva
  // del worker rivaluta il fingerprint e accoda allora.
  const [pending] = await dependencies.db
    .select({ id: sessionAiProcessingJobs.id })
    .from(sessionAiProcessingJobs)
    .where(
      and(
        eq(sessionAiProcessingJobs.sessionAiNotesId, sessionId),
        eq(sessionAiProcessingJobs.jobType, 'report_generation'),
        inArray(sessionAiProcessingJobs.status, [
          'queued',
          'processing',
          'awaiting_provider',
        ])
      )
    )
    .limit(1);
  if (pending) return false;

  const queued = await enqueueAiProcessingJob({
    sessionId,
    jobType: 'report_generation',
    idempotencyKey: `session-compass:auto:${sessionId}:${fingerprint}`,
    availableAfter: dependencies.clock.now(),
    executor: dependencies.db,
  });
  return !queued.duplicate;
}

/** Recupera sessioni già trascritte che una vecchia corsa ha lasciato a metà. */
export async function enqueueReadySessionCompassJobs(
  params: { limit: number },
  dependencies: AiSessionNotesDependencies
): Promise<number> {
  const limit = Math.max(1, Math.min(params.limit, 100));
  // Si selezionano le sessioni con una timeline; la decisione se accodare
  // spetta a `enqueueSessionCompassIfReady`, che confronta il fingerprint.
  // Filtrare qui sull'esistenza di un job qualsiasi reintrodurrebbe il
  // difetto: un riepilogo vecchio impedirebbe quello nuovo, e una
  // trascrizione estesa dopo una riconnessione non verrebbe mai riletta.
  const rows = (await dependencies.db.execute(sql`
    SELECT s.id
    FROM session_ai_notes s
    WHERE s.status IN ('processing', 'ready_for_review')
      AND EXISTS (
        SELECT 1 FROM session_transcript_timeline_segments t
        WHERE t.session_ai_notes_id = s.id
      )
    ORDER BY s.processing_started_at, s.id
    LIMIT ${limit}
  `)) as unknown as Array<{ id: number }>;
  let queued = 0;
  for (const row of rows) {
    if (await enqueueSessionCompassIfReady(row.id, dependencies)) queued += 1;
  }
  return queued;
}

function sanitizeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof AiNotesProcessingError) {
    return { code: error.code, message: error.message.slice(0, 500) };
  }
  return { code: 'PROCESSING_FAILED', message: 'Elaborazione non completata.' };
}

export async function failAiProcessingJob(params: {
  jobId: number;
  workerId: string;
  error: unknown;
}, dependencies: AiSessionNotesDependencies): Promise<AiProcessingJobStatus | null> {
  return dependencies.db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT j.id, j.session_ai_notes_id, j.attempt_count, j.max_attempts,
             j.job_type, s.requested_by
      FROM session_ai_processing_jobs j
      JOIN session_ai_notes s ON s.id = j.session_ai_notes_id
      WHERE j.id = ${params.jobId}
        AND j.status = 'processing'
        AND j.locked_by = ${params.workerId}
      FOR UPDATE
    `);
    const job = (rows as unknown as Array<{
      id: number;
      session_ai_notes_id: number;
      attempt_count: number;
      max_attempts: number;
      job_type: AiProcessingJobType;
      requested_by: number;
    }>)[0];
    if (!job) return null;
    const failure = sanitizeFailure(params.error);
    const nextStatus = retryStatus({
      attemptCount: job.attempt_count,
      maxAttempts: job.max_attempts,
    });
    const now = dependencies.clock.now();
    await tx
      .update(sessionAiProcessingJobs)
      .set({
        status: nextStatus,
        availableAfter:
          nextStatus === 'queued'
            ? new Date(now.getTime() + retryDelayMs(job.attempt_count))
            : now,
        completedAt: nextStatus === 'failed' ? now : null,
        lockedAt: null,
        lockedBy: null,
        errorCode: failure.code,
        errorMessageSanitized: failure.message,
        updatedDate: now,
      })
      .where(eq(sessionAiProcessingJobs.id, job.id));
    await auditJob(tx, {
      sessionId: job.session_ai_notes_id,
      actorUserId: job.requested_by,
      eventType: 'processing_job_failed',
      jobId: job.id,
      metadata: { errorCode: failure.code, retrying: nextStatus === 'queued' },
      occurredAt: now,
    });
    if (nextStatus === 'failed') {
      await advanceAiNotesSessionStatus({
        sessionId: job.session_ai_notes_id,
        nextStatus:
          job.job_type === 'report_generation'
            ? 'report_failed'
            : 'transcription_failed',
        actorUserId: job.requested_by,
        executor: tx,
      });
    }
    return nextStatus;
  });
}

export async function cancelAiProcessingJobsForSession(params: {
  sessionId: number;
  actorUserId: number;
  reason: string;
}, dependencies?: Pick<AiSessionNotesDependencies, 'db' | 'clock'>): Promise<number> {
  const executor = dependencies?.db ?? db;
  const now = dependencies?.clock.now() ?? new Date();
  const jobs = await executor
    .update(sessionAiProcessingJobs)
    .set({
      status: 'cancelled',
      cancelledAt: now,
      completedAt: now,
      lockedAt: null,
      lockedBy: null,
      errorCode: 'SESSION_NOT_PROCESSABLE',
      errorMessageSanitized: 'Elaborazione annullata per consenso o sessione.',
      updatedDate: now,
      updatedBy: params.actorUserId,
    })
    .where(
      and(
        eq(sessionAiProcessingJobs.sessionAiNotesId, params.sessionId),
        inArray(sessionAiProcessingJobs.status, ['queued', 'processing'])
      )
    )
    .returning({ id: sessionAiProcessingJobs.id });
  for (const job of jobs) {
    await auditJob(executor, {
      sessionId: params.sessionId,
      actorUserId: params.actorUserId,
      eventType: 'processing_job_cancelled',
      jobId: job.id,
      metadata: { reason: params.reason.slice(0, 80) },
      occurredAt: now,
    });
  }
  return jobs.length;
}

export async function recoverStaleAiProcessingJobs(params?: {
  olderThanMinutes?: number;
  limit?: number;
}): Promise<number> {
  const olderThanMinutes = Math.max(1, Math.min(params?.olderThanMinutes ?? 30, 24 * 60));
  const limit = Math.max(1, Math.min(params?.limit ?? 100, 500));
  return db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT j.id, j.session_ai_notes_id, j.attempt_count, j.max_attempts,
             s.requested_by
      FROM session_ai_processing_jobs j
      JOIN session_ai_notes s ON s.id = j.session_ai_notes_id
      WHERE j.status = 'processing'
        AND j.locked_at < now() - (${olderThanMinutes} * interval '1 minute')
      ORDER BY j.locked_at, j.id
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `);
    const jobs = rows as unknown as Array<{
      id: number;
      session_ai_notes_id: number;
      attempt_count: number;
      max_attempts: number;
      requested_by: number;
    }>;
    for (const job of jobs) {
      const nextStatus = retryStatus({
        attemptCount: job.attempt_count,
        maxAttempts: job.max_attempts,
      });
      await tx
        .update(sessionAiProcessingJobs)
        .set({
          status: nextStatus,
          availableAfter: new Date(),
          completedAt: nextStatus === 'failed' ? new Date() : null,
          lockedAt: null,
          lockedBy: null,
          errorCode: 'STALE_PROCESSING_RECOVERED',
          errorMessageSanitized: 'Claim worker scaduto; job recuperato.',
          updatedDate: new Date(),
        })
        .where(eq(sessionAiProcessingJobs.id, job.id));
      await auditJob(tx, {
        sessionId: job.session_ai_notes_id,
        actorUserId: job.requested_by,
        eventType: 'processing_job_recovered',
        jobId: job.id,
        metadata: { retrying: nextStatus === 'queued' },
      });
    }
    return jobs.length;
  });
}

async function assertClaimStillProcessable(
  job: JobRow,
  dependencies: AiSessionNotesDependencies
): Promise<void> {
  await assertProcessableSession(
    dependencies.db,
    job.session_ai_notes_id
  );
}

/**
 * Quanto lavoro resta pronto a partire adesso.
 *
 * Serve al worker per decidere se richiamarsi: una singola invocazione ne
 * smaltisce un numero limitato, e su Vercel non esiste un processo che resti
 * in ascolto. Senza questo, ogni sveglia sposta la coda di qualche job e poi
 * la lascia ferma fino alla sveglia successiva.
 */
export async function countReadyAiNotesJobs(
  now: Date = new Date()
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(sessionAiProcessingJobs)
    .where(
      and(
        eq(sessionAiProcessingJobs.status, 'queued'),
        lte(sessionAiProcessingJobs.availableAfter, now)
      )
    );
  return Number(row?.total ?? 0);
}

/** Processes a finite batch and exits. */
export async function processAiNotesBatch(params: {
  workerId: string;
  limit: number;
}, dependencies: AiSessionNotesDependencies): Promise<{ claimed: number; completed: number; parked: number; failed: number; cancelled: number }> {
  const limit = Math.max(1, Math.min(params.limit, 100));
  const result = { claimed: 0, completed: 0, parked: 0, failed: 0, cancelled: 0 };
  for (let index = 0; index < limit; index += 1) {
    const job = await claimNextAiProcessingJob(
      { workerId: params.workerId },
      dependencies
    );
    if (!job) break;
    result.claimed += 1;
    try {
      await assertClaimStillProcessable(job, dependencies);
      if (job.job_type === 'transcription') {
        if (!job.participant_recording_id) {
          throw new AiNotesProcessingError(
            'PARTICIPANT_RECORDING_NOT_FOUND',
            'Registrazione partecipante non trovata.'
          );
        }
        const dispatch = await dispatchPendingTranscriptionRequests(
          {
            id: job.id,
            sessionAiNotesId: job.session_ai_notes_id,
            participantRecordingId: job.participant_recording_id,
            provider: job.provider,
          },
          dependencies
        );
        if (dispatch.remaining === 0) {
          // Tutto già trascritto: non c'è nulla da attendere.
          if (await completeAiProcessingJob({ jobId: job.id, workerId: params.workerId }, dependencies)) {
            result.completed += 1;
            await enqueueNormalizationIfReady(
              job.session_ai_notes_id,
              dependencies
            );
          }
        } else {
          // Il lavoro è dal provider. Il job esce dalla coda senza essere
          // completato: lo risveglierà la callback.
          await parkAiProcessingJob(
            { jobId: job.id, workerId: params.workerId },
            dependencies
          );
          result.parked += 1;
        }
      } else if (job.job_type === 'report_generation') {
        if (!dependencies.generateSessionCompass) {
          throw new AiNotesProcessingError(
            'PROVIDER_NOT_CONFIGURED',
            'Generatore del riepilogo sessione non configurato.'
          );
        }
        const output = await dependencies.generateSessionCompass({
          sessionId: job.session_ai_notes_id,
          actorUserId: job.requested_by,
        });
        if (await completeAiProcessingJob({ jobId: job.id, workerId: params.workerId, providerOperationId: output.providerOperationId }, dependencies)) {
          result.completed += 1;
          await advanceAiNotesSessionStatus({
            sessionId: job.session_ai_notes_id,
            nextStatus: 'ready_for_review',
            actorUserId: job.requested_by,
            executor: dependencies.db,
          });
        }
      } else {
        await rebuildSessionTimeline(job.session_ai_notes_id, job.requested_by);
        if (await completeAiProcessingJob({ jobId: job.id, workerId: params.workerId }, dependencies)) {
          result.completed += 1;
          const enqueued = await enqueueSessionCompassIfReady(
            job.session_ai_notes_id,
            dependencies
          );
          /*
           * Nessun riepilogo da accodare e nessuna timeline: la seduta non
           * conteneva parlato. Va dichiarata finita adesso — restava in
           * `processing` a tempo indeterminato, con la rotellina che girava e
           * nessuno che dicesse perche'.
           */
          if (!enqueued) {
            await closeSessionWithoutSpeech(
              job.session_ai_notes_id,
              job.requested_by,
              dependencies
            );
          }
        }
      }
    } catch (error) {
      if (error instanceof AiNotesProcessingError && error.code === 'SESSION_NOT_PROCESSABLE') {
        await cancelAiProcessingJobsForSession({
          sessionId: job.session_ai_notes_id,
          actorUserId: job.requested_by,
          reason: 'session_not_processable',
        }, dependencies);
        result.cancelled += 1;
      } else {
        await failAiProcessingJob(
          { jobId: job.id, workerId: params.workerId, error },
          dependencies
        );
        result.failed += 1;
      }
    }
  }
  return result;
}
