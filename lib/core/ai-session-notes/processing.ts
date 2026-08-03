import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  sessionAiAuditEvents,
  sessionAiConsents,
  sessionAiNotes,
  sessionAiProcessingJobs,
  sessionAudioRecordings,
  sessionParticipantRecordings,
  sessionTranscriptSegments,
  type AiProcessingJobStatus,
  type AiProcessingJobType,
} from '@/lib/db/schema';
import {
  getSessionReportProvider,
  getSpeechToTextProvider,
} from './providers';
import {
  AiNotesProcessingError,
  jobRequiresParticipantRecording,
  retryDelayMs,
  retryStatus,
  sessionCanProcess,
} from './processing-policy';
import { getAiNotesAudioMaxBytes } from './recording-config';
import { rebuildSessionTimeline } from './timeline';
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
  return !queued.duplicate;
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
             s.requested_by
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

async function transcribeParticipantRecording(
  job: JobRow,
  dependencies: AiSessionNotesDependencies
): Promise<string | undefined> {
  if (!job.participant_recording_id) throw new AiNotesProcessingError('PARTICIPANT_RECORDING_NOT_FOUND', 'Registrazione partecipante non trovata.');
  const maxAudioBytes = getAiNotesAudioMaxBytes();
  const model = process.env.AI_NOTES_STT_MODEL?.trim() || 'nova-3';
  if (model !== 'nova-3') throw new AiNotesProcessingError('INVALID_JOB', 'Modello STT non consentito.');
  const language = 'it';
  const rows = await dependencies.db.select({ id: sessionAudioRecordings.id, order: sessionAudioRecordings.segmentOrder, userId: sessionAudioRecordings.participantUserId, role: sessionAudioRecordings.participantRole, status: sessionAudioRecordings.status, objectKey: sessionAudioRecordings.storageObjectKey, mimeType: sessionAudioRecordings.mimeType, sizeBytes: sessionAudioRecordings.sizeBytes, checksum: sessionAudioRecordings.checksum }).from(sessionAudioRecordings).where(and(eq(sessionAudioRecordings.sessionAiNotesId, job.session_ai_notes_id), eq(sessionAudioRecordings.participantRecordingId, job.participant_recording_id))).orderBy(asc(sessionAudioRecordings.segmentOrder), asc(sessionAudioRecordings.id));
  const name = job.provider;
  let operationId: string | undefined;
  for (const row of rows) {
    const existing = await dependencies.db.select({ id: sessionTranscriptSegments.id }).from(sessionTranscriptSegments).where(and(eq(sessionTranscriptSegments.physicalRecordingId, row.id), eq(sessionTranscriptSegments.provider, name))).limit(1);
    if (existing.length) continue;
    await assertClaimStillProcessable(job, dependencies);
    if (row.status !== 'recorded') throw new AiNotesProcessingError('AUDIO_NOT_FOUND', 'Segmento audio non disponibile.');
    if (row.mimeType !== 'audio/ogg' || row.sizeBytes === null || row.sizeBytes <= 0 || row.sizeBytes > maxAudioBytes) throw new AiNotesProcessingError('UNSUPPORTED_AUDIO', 'Formato o dimensione audio non supportati.');
    const inspected = await dependencies.audioStorage.inspect(row.objectKey);
    if (!inspected.exists) throw new AiNotesProcessingError('AUDIO_NOT_FOUND', 'File audio non trovato.');
    if (inspected.sizeBytes !== row.sizeBytes || (row.checksum && inspected.checksum && row.checksum !== inspected.checksum)) throw new AiNotesProcessingError('AUDIO_INTEGRITY_FAILED', 'Integrità file audio non verificata.');
    const audio = await dependencies.audioStorage.download(row.objectKey);
    if (audio.byteLength !== row.sizeBytes) throw new AiNotesProcessingError('AUDIO_INTEGRITY_FAILED', 'Dimensione file audio non verificata.');
    const output = await dependencies.speechToTextProvider.transcribe({ sessionId: job.session_ai_notes_id, participantRecordingId: job.participant_recording_id, physicalSegmentId: row.id, audio, mimeType: 'audio/ogg', language, model });
    await assertClaimStillProcessable(job, dependencies);
    const now = dependencies.clock.now();
    await dependencies.db.transaction(async (tx) => {
      await tx.delete(sessionTranscriptSegments).where(and(eq(sessionTranscriptSegments.physicalRecordingId, row.id), eq(sessionTranscriptSegments.provider, name)));
      if (output.segments.length) await tx.insert(sessionTranscriptSegments).values(output.segments.map((segment, index) => ({ sessionAiNotesId: job.session_ai_notes_id, participantRecordingId: job.participant_recording_id!, physicalRecordingId: row.id, participantUserId: row.userId, speakerRole: row.role, sequenceNumber: (row.order ?? 0) * 1_000_000 + index, startedAtMs: segment.startMs, endedAtMs: segment.endMs, text: segment.text, isFinal: true, confidence: segment.confidence, provider: name, providerModel: output.model, providerSegmentId: segment.providerSegmentId, normalizationStatus: 'pending', metadata: {}, createdDate: now, createdBy: job.requested_by, updatedDate: now, updatedBy: job.requested_by })));
    });
    operationId = output.providerOperationId ?? operationId;
  }
  return operationId;
}

/** Processes a finite batch and exits. */
export async function processAiNotesBatch(params: {
  workerId: string;
  limit: number;
}, dependencies: AiSessionNotesDependencies): Promise<{ claimed: number; completed: number; failed: number; cancelled: number }> {
  const limit = Math.max(1, Math.min(params.limit, 100));
  const result = { claimed: 0, completed: 0, failed: 0, cancelled: 0 };
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
        const providerOperationId = await transcribeParticipantRecording(
          job,
          dependencies
        );
        if (await completeAiProcessingJob({ jobId: job.id, workerId: params.workerId, providerOperationId }, dependencies)) {
          result.completed += 1;
          await enqueueNormalizationIfReady(
            job.session_ai_notes_id,
            dependencies
          );
        }
      } else if (job.job_type === 'report_generation') {
        const { provider } = getSessionReportProvider();
        const output = await provider.generate({ sessionId: job.session_ai_notes_id });
        if (await completeAiProcessingJob({ jobId: job.id, workerId: params.workerId, providerOperationId: output.providerOperationId }, dependencies)) {
          result.completed += 1;
        }
      } else {
        await rebuildSessionTimeline(job.session_ai_notes_id, job.requested_by);
        if (await completeAiProcessingJob({ jobId: job.id, workerId: params.workerId }, dependencies)) result.completed += 1;
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
