import 'server-only';
import { and, eq } from 'drizzle-orm';
import {
  sessionAiProcessingJobs,
  sessionAudioRecordings,
  sessionTranscriptSegments,
  sessionTranscriptionRequests,
} from '@/lib/db/schema';
import { enqueueNormalizationIfReady } from './processing';
import { isCallbackTokenWellFormed } from './stt-callback-policy';
import type { AiSessionNotesDependencies } from './dependencies';

export { isCallbackTokenWellFormed };

export type CallbackOutcome = 'ingested' | 'duplicate' | 'unknown';

/**
 * Decide il destino del job dopo l'ingestione di una risposta.
 *
 * Non lo completa alla cieca: se nel frattempo è comparso un segmento nuovo
 * — ed è proprio ciò che produce una riconnessione — il job torna in coda
 * invece di chiudersi, così la corsa successiva lo consegna. Si completa
 * solo quando non resta nulla da trascrivere.
 */
export async function advanceJobAfterCallback(
  jobId: number,
  dependencies: AiSessionNotesDependencies
): Promise<'completed' | 'requeued' | 'waiting'> {
  const [job] = await dependencies.db
    .select({
      id: sessionAiProcessingJobs.id,
      sessionId: sessionAiProcessingJobs.sessionAiNotesId,
      participantRecordingId: sessionAiProcessingJobs.participantRecordingId,
      status: sessionAiProcessingJobs.status,
    })
    .from(sessionAiProcessingJobs)
    .where(eq(sessionAiProcessingJobs.id, jobId))
    .limit(1);
  if (!job || job.status !== 'awaiting_provider' || !job.participantRecordingId) {
    return 'waiting';
  }

  const pending = await dependencies.db
    .select({ id: sessionTranscriptionRequests.id })
    .from(sessionTranscriptionRequests)
    .where(
      and(
        eq(sessionTranscriptionRequests.processingJobId, jobId),
        eq(sessionTranscriptionRequests.status, 'submitted')
      )
    )
    .limit(1);
  if (pending.length) return 'waiting';

  const recorded = await dependencies.db
    .select({ id: sessionAudioRecordings.id })
    .from(sessionAudioRecordings)
    .where(
      and(
        eq(
          sessionAudioRecordings.participantRecordingId,
          job.participantRecordingId
        ),
        eq(sessionAudioRecordings.status, 'recorded')
      )
    );
  const transcribed = await dependencies.db
    .select({ physicalId: sessionTranscriptSegments.physicalRecordingId })
    .from(sessionTranscriptSegments)
    .where(
      eq(
        sessionTranscriptSegments.participantRecordingId,
        job.participantRecordingId
      )
    );
  const missing = recorded.filter(
    (row) => !transcribed.some((segment) => segment.physicalId === row.id)
  );

  const now = dependencies.clock.now();
  if (missing.length) {
    await dependencies.db
      .update(sessionAiProcessingJobs)
      .set({ status: 'queued', availableAfter: now, updatedDate: now })
      .where(
        and(
          eq(sessionAiProcessingJobs.id, jobId),
          eq(sessionAiProcessingJobs.status, 'awaiting_provider')
        )
      );
    return 'requeued';
  }

  await dependencies.db
    .update(sessionAiProcessingJobs)
    .set({ status: 'completed', completedAt: now, updatedDate: now })
    .where(
      and(
        eq(sessionAiProcessingJobs.id, jobId),
        eq(sessionAiProcessingJobs.status, 'awaiting_provider')
      )
    );
  return 'completed';
}

/**
 * Ingerisce i risultati di una trascrizione consegnati dal provider.
 *
 * Deve tollerare consegne ripetute: il provider ritenta fino a dieci volte
 * se non riceve un 2xx, e una seconda ingestione dello stesso audio
 * duplicherebbe il parlato. La riga della richiesta è il punto di
 * serializzazione: solo chi riesce a portarla da `submitted` a `received`
 * scrive i segmenti.
 */
export async function ingestTranscriptionCallback(
  params: { token: string; payload: unknown },
  dependencies: AiSessionNotesDependencies
): Promise<CallbackOutcome> {
  if (!isCallbackTokenWellFormed(params.token)) return 'unknown';

  const [request] = await dependencies.db
    .select({
      id: sessionTranscriptionRequests.id,
      status: sessionTranscriptionRequests.status,
      provider: sessionTranscriptionRequests.provider,
      providerRequestId: sessionTranscriptionRequests.providerRequestId,
      physicalRecordingId: sessionTranscriptionRequests.physicalRecordingId,
      jobId: sessionTranscriptionRequests.processingJobId,
      token: sessionTranscriptionRequests.callbackToken,
    })
    .from(sessionTranscriptionRequests)
    .where(eq(sessionTranscriptionRequests.callbackToken, params.token))
    .limit(1);
  if (!request || request.token !== params.token) return 'unknown';
  if (request.status !== 'submitted') return 'duplicate';

  // Il request id nel payload deve corrispondere a quello restituito
  // all'invio: un token valido con un corpo altrui non passa.
  const deliveredRequestId = (
    params.payload as { metadata?: { request_id?: unknown } } | null
  )?.metadata?.request_id;
  if (
    request.providerRequestId &&
    typeof deliveredRequestId === 'string' &&
    deliveredRequestId !== request.providerRequestId
  ) {
    return 'unknown';
  }

  const [claimed] = await dependencies.db
    .update(sessionTranscriptionRequests)
    .set({
      status: 'received',
      receivedAt: dependencies.clock.now(),
      updatedDate: dependencies.clock.now(),
    })
    .where(
      and(
        eq(sessionTranscriptionRequests.id, request.id),
        eq(sessionTranscriptionRequests.status, 'submitted')
      )
    )
    .returning({ id: sessionTranscriptionRequests.id });
  if (!claimed) return 'duplicate';

  const [recording] = await dependencies.db
    .select({
      id: sessionAudioRecordings.id,
      sessionId: sessionAudioRecordings.sessionAiNotesId,
      participantRecordingId: sessionAudioRecordings.participantRecordingId,
      participantUserId: sessionAudioRecordings.participantUserId,
      participantRole: sessionAudioRecordings.participantRole,
      segmentOrder: sessionAudioRecordings.segmentOrder,
      requestedBy: sessionAudioRecordings.createdBy,
    })
    .from(sessionAudioRecordings)
    .where(eq(sessionAudioRecordings.id, request.physicalRecordingId))
    .limit(1);
  if (!recording || !recording.participantRecordingId) return 'unknown';

  const parsed = dependencies.speechToTextProvider.parseCallback(
    params.payload,
    recording.id
  );
  const now = dependencies.clock.now();
  const actorUserId = recording.requestedBy ?? null;

  await dependencies.db.transaction(async (tx) => {
    // Sostituzione atomica per file fisico: una reimmissione non somma testo
    // a quello già presente.
    await tx
      .delete(sessionTranscriptSegments)
      .where(
        and(
          eq(sessionTranscriptSegments.physicalRecordingId, recording.id),
          eq(sessionTranscriptSegments.provider, request.provider)
        )
      );
    if (parsed.segments.length) {
      await tx.insert(sessionTranscriptSegments).values(
        parsed.segments.map((segment, index) => ({
          sessionAiNotesId: recording.sessionId,
          participantRecordingId: recording.participantRecordingId!,
          physicalRecordingId: recording.id,
          participantUserId: recording.participantUserId,
          speakerRole: recording.participantRole,
          // L'ordine del segmento moltiplicato tiene separati i blocchi di
          // ogni rientro: senza, le utterance del secondo segmento si
          // mescolerebbero a quelle del primo.
          sequenceNumber: (recording.segmentOrder ?? 0) * 1_000_000 + index,
          startedAtMs: segment.startMs,
          endedAtMs: segment.endMs,
          text: segment.text,
          isFinal: true,
          confidence: segment.confidence,
          provider: request.provider,
          providerModel: parsed.model,
          providerSegmentId: segment.providerSegmentId,
          normalizationStatus: 'pending' as const,
          metadata: {},
          createdDate: now,
          createdBy: actorUserId,
          updatedDate: now,
          updatedBy: actorUserId,
        }))
      );
    }
  });

  const advanced = await advanceJobAfterCallback(request.jobId, dependencies);
  if (advanced === 'completed') {
    await enqueueNormalizationIfReady(recording.sessionId, dependencies);
  }
  return 'ingested';
}
