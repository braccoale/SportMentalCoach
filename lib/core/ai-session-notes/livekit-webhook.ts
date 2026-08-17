import 'server-only';
import { createHash } from 'node:crypto';
import { EgressStatus, type WebhookEvent } from 'livekit-server-sdk';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  bookings,
  livekitWebhookReceipts,
  providerProfiles,
  sessionAiAuditEvents,
  sessionAiNotes,
  sessionAudioRecordings,
} from '@/lib/db/schema';
import { parseBookingRoomName, technicalEventOccurredAt } from '@/lib/core/video/technical-events';
import { inspectAudioObject } from './audio-storage';
import {
  getAudioRecordingConfig,
  getLiveKitWebhookMaxAgeSeconds,
} from './recording-config';
import {
  isIntruderParticipant,
  isWebhookTimestampAcceptable,
} from './recording-policy';
import { enqueueAiProcessingJob } from './processing';
import type { AiSessionNotesDependencies } from './dependencies';
import {
  startAiNotesRecordingSystem,
  stopAiNotesRecordingByTrack,
  stopAiNotesRecordings,
  stopAiNotesRecordingsByParticipant,
} from './recording';
import { closeAiNotesSession } from './session-close';

export class LiveKitWebhookError extends Error {
  constructor(
    public readonly code:
      | 'MISSING_EVENT_ID'
      | 'STALE_EVENT'
      | 'REPLAY_MISMATCH'
      | 'PROCESSING_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'LiveKitWebhookError';
  }
}

function roomNameForEvent(event: WebhookEvent): string | null {
  return (
    event.room?.name ||
    event.egressInfo?.roomName ||
    event.ingressInfo?.roomName ||
    null
  );
}

function payloadDigest(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf8').digest('hex');
}

async function claimReceipt(
  event: WebhookEvent,
  rawBody: string,
  executor: DbOrTx = db
): Promise<'claimed' | 'duplicate'> {
  if (!event.id || !event.event) {
    throw new LiveKitWebhookError(
      'MISSING_EVENT_ID',
      'Webhook privo di identificatore.'
    );
  }
  const rawCreatedAt = Number(event.createdAt);
  if (!Number.isFinite(rawCreatedAt) || rawCreatedAt <= 0) {
    throw new LiveKitWebhookError(
      'STALE_EVENT',
      'Webhook privo di timestamp valido.'
    );
  }
  const createdAt = technicalEventOccurredAt(event.createdAt);
  if (
    !isWebhookTimestampAcceptable({
      createdAt,
      maxAgeSeconds: getLiveKitWebhookMaxAgeSeconds(),
    })
  ) {
    throw new LiveKitWebhookError('STALE_EVENT', 'Webhook fuori finestra.');
  }
  const digest = payloadDigest(rawBody);

  return executor.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        digest: livekitWebhookReceipts.payloadDigest,
        status: livekitWebhookReceipts.status,
        updatedDate: livekitWebhookReceipts.updatedDate,
      })
      .from(livekitWebhookReceipts)
      .where(eq(livekitWebhookReceipts.eventId, event.id!))
      .limit(1);
    if (existing && existing.digest !== digest) {
      throw new LiveKitWebhookError(
        'REPLAY_MISMATCH',
        'Event ID già ricevuto con payload differente.'
      );
    }
    if (existing?.status === 'processed') {
      return 'duplicate';
    }
    if (
      existing?.status === 'failed' ||
      (existing?.status === 'processing' &&
        existing.updatedDate.getTime() < Date.now() - 5 * 60_000)
    ) {
      await tx
        .update(livekitWebhookReceipts)
        .set({
          status: 'processing',
          errorCode: null,
          updatedDate: new Date(),
        })
        .where(eq(livekitWebhookReceipts.eventId, event.id!));
      return 'claimed';
    }
    if (existing?.status === 'processing') return 'duplicate';
    const [inserted] = await tx
      .insert(livekitWebhookReceipts)
      .values({
        eventId: event.id!,
        eventType: event.event!,
        roomName: roomNameForEvent(event),
        eventCreatedAt: createdAt,
        payloadDigest: digest,
        status: 'processing',
      })
      .onConflictDoNothing({ target: livekitWebhookReceipts.eventId })
      .returning({ eventId: livekitWebhookReceipts.eventId });
    if (!inserted) {
      const [raced] = await tx
        .select({
          digest: livekitWebhookReceipts.payloadDigest,
        })
        .from(livekitWebhookReceipts)
        .where(eq(livekitWebhookReceipts.eventId, event.id!))
        .limit(1);
      if (!raced || raced.digest !== digest) {
        throw new LiveKitWebhookError(
          'REPLAY_MISMATCH',
          'Event ID concorrente con payload differente.'
        );
      }
      return 'duplicate';
    }
    return 'claimed';
  });
}

async function sessionForRoom(roomName: string | null, executor: DbOrTx = db) {
  const bookingId = parseBookingRoomName(roomName ?? '');
  if (!bookingId) return null;
  const [session] = await executor
    .select({
      id: sessionAiNotes.id,
      requestedBy: sessionAiNotes.requestedBy,
      status: sessionAiNotes.status,
      coachUserId: providerProfiles.userId,
      athleteUserId: bookings.clientId,
    })
    .from(sessionAiNotes)
    .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .innerJoin(
      providerProfiles,
      eq(providerProfiles.id, bookings.providerId)
    )
    .where(
      and(
        eq(sessionAiNotes.bookingId, bookingId),
        inArray(sessionAiNotes.status, [
          'waiting_for_consent',
          'active',
          // Una traccia può essere già pronta e aver fatto avanzare la
          // sessione mentre l'altra sta ancora chiudendo. Gli ultimi eventi
          // LiveKit devono continuare a poter fermare e finalizzare l'audio.
          'processing',
          'cancelled',
          'consent_rejected',
        ])
      )
    )
    .orderBy(sql`${sessionAiNotes.createdDate} desc`)
    .limit(1);
  return session ?? null;
}

function nsToDate(value: bigint): Date | null {
  if (value <= 0n) return null;
  const millis = Number(value / 1_000_000n);
  return Number.isSafeInteger(millis) ? new Date(millis) : null;
}

function nsDurationSeconds(startedAt: bigint, endedAt: bigint): number | null {
  if (startedAt <= 0n || endedAt < startedAt) return null;
  const seconds = Number((endedAt - startedAt) / 1_000_000_000n);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

/**
 * Il motivo del fallimento, ridotto a quel che sta nella colonna.
 *
 * Errore d'infrastruttura, non contenuto della seduta: si conserva com'e'.
 */
function sanitizeEgressFailure(error: string | undefined): string | null {
  const detail = error?.trim();
  if (!detail) return null;
  return detail.slice(0, 500);
}

async function auditEgress(params: {
  sessionId: number;
  requestedBy: number;
  eventType:
    | 'recording_started'
    | 'recording_recorded'
    | 'recording_failed';
  recordingId: number;
  errorCode?: string;
  executor?: DbOrTx;
}) {
  await (params.executor ?? db).insert(sessionAiAuditEvents).values({
    sessionAiNotesId: params.sessionId,
    eventType: params.eventType,
    actorUserId: params.requestedBy,
    eventMetadata: {
      recordingId: params.recordingId,
      ...(params.errorCode ? { errorCode: params.errorCode } : {}),
    },
    createdBy: params.requestedBy,
    updatedBy: params.requestedBy,
  });
}

async function handleEgressEvent(event: WebhookEvent, executor: DbOrTx = db): Promise<void> {
  const info = event.egressInfo;
  if (!info?.egressId) return;
  const [recording] = await executor
    .select({
      id: sessionAudioRecordings.id,
      participantRecordingId: sessionAudioRecordings.participantRecordingId,
      sessionId: sessionAudioRecordings.sessionAiNotesId,
      requestedBy: sessionAiNotes.requestedBy,
      objectKey: sessionAudioRecordings.storageObjectKey,
      roomName: sessionAudioRecordings.livekitRoomName,
      status: sessionAudioRecordings.status,
    })
    .from(sessionAudioRecordings)
    .innerJoin(
      sessionAiNotes,
      eq(sessionAiNotes.id, sessionAudioRecordings.sessionAiNotesId)
    )
    .where(eq(sessionAudioRecordings.livekitEgressId, info.egressId))
    .limit(1);
  if (!recording) return;
  if (info.roomName && info.roomName !== recording.roomName) {
    throw new Error('EGRESS_ROOM_MISMATCH');
  }

  const common = {
    lastWebhookEventId: event.id || null,
    updatedDate: new Date(),
    updatedBy: recording.requestedBy,
  };
  if (
    info.status === EgressStatus.EGRESS_STARTING ||
    info.status === EgressStatus.EGRESS_ACTIVE
  ) {
    const [updated] = await executor
      .update(sessionAudioRecordings)
      .set({
        ...common,
        status:
          info.status === EgressStatus.EGRESS_ACTIVE
            ? 'recording'
            : 'starting',
        startedAt: nsToDate(info.startedAt),
      })
      .where(
        and(
          eq(sessionAudioRecordings.id, recording.id),
          inArray(sessionAudioRecordings.status, ['starting', 'recording'])
        )
      )
      .returning({ id: sessionAudioRecordings.id });
    if (updated && info.status === EgressStatus.EGRESS_ACTIVE) {
      await auditEgress({
        sessionId: recording.sessionId,
        requestedBy: recording.requestedBy,
        eventType: 'recording_started',
        recordingId: recording.id,
        executor,
      });
    }
    return;
  }
  if (info.status === EgressStatus.EGRESS_ENDING) {
    await executor
      .update(sessionAudioRecordings)
      .set({ ...common, status: 'stopping' })
      .where(
        and(
          eq(sessionAudioRecordings.id, recording.id),
          inArray(sessionAudioRecordings.status, [
            'starting',
            'recording',
            'stopping',
          ])
        )
      );
    return;
  }

  if (
    info.status === EgressStatus.EGRESS_COMPLETE ||
    info.status === EgressStatus.EGRESS_ABORTED
  ) {
    let audioRecorded = false;
    try {
      const config = getAudioRecordingConfig();
      const object = await inspectAudioObject(config, recording.objectKey);
      if (
        !object.exists ||
        object.sizeBytes === null ||
        object.sizeBytes <= 0 ||
        object.sizeBytes > config.maxBytes ||
        (object.mimeType !== null &&
          !['audio/ogg', 'application/ogg'].includes(object.mimeType))
      ) {
        throw new Error('EGRESS_FILE_INVALID');
      }
      await executor
        .update(sessionAudioRecordings)
        .set({
          ...common,
          status: 'recorded',
          startedAt: nsToDate(info.startedAt),
          endedAt: nsToDate(info.endedAt) ?? new Date(),
          durationSeconds: nsDurationSeconds(
            info.startedAt,
            info.endedAt
          ),
          sizeBytes: object.sizeBytes,
          checksum: object.checksum,
          errorCode: null,
          errorMessageSanitized: null,
        })
        .where(eq(sessionAudioRecordings.id, recording.id));
      await auditEgress({
        sessionId: recording.sessionId,
        requestedBy: recording.requestedBy,
        eventType: 'recording_recorded',
        recordingId: recording.id,
        executor,
      });
      audioRecorded = true;
    } catch {
      // Converted below into a visible per-track failure.
    }

    if (audioRecorded) {
      if (recording.participantRecordingId) {
        await enqueueAiProcessingJob({
          sessionId: recording.sessionId,
          participantRecordingId: recording.participantRecordingId,
          jobType: 'transcription',
          idempotencyKey: `transcription:${recording.participantRecordingId}:${recording.id}`,
          metadata: { physicalRecordingId: recording.id },
          executor,
        });
      }
      // La chiusura di un egress dice che *quel file* è pronto, non che la
      // sessione sia finita: dopo una disconnessione i due sono la stessa
      // cosa solo in apparenza. Chiudere qui rendeva la sessione non più
      // registrabile a metà seduta, e tutto ciò che veniva detto dopo il
      // rientro andava perso senza un segnale. Chi chiude la sessione è
      // `closeAiNotesSession`, e nessun altro.
      return;
    }
  }

  const errorCode =
    info.status === EgressStatus.EGRESS_LIMIT_REACHED
      ? 'EGRESS_LIMIT_REACHED'
      : info.status === EgressStatus.EGRESS_COMPLETE ||
          info.status === EgressStatus.EGRESS_ABORTED
        ? 'EGRESS_FILE_INVALID'
        : 'EGRESS_FAILED';
  await executor
    .update(sessionAudioRecordings)
    .set({
      ...common,
      status: 'failed',
      endedAt: nsToDate(info.endedAt) ?? new Date(),
      errorCode,
      /*
       * Il motivo vero, non un segnaposto.
       *
       * Qui c'era «LiveKit Egress ha segnalato un errore», e il messaggio di
       * LiveKit veniva buttato. Quel messaggio diceva `S3 upload failed ...
       * 413 EntityTooLarge`: la causa esatta, in chiaro, cestinata. Per
       * ritrovarla e' servito interrogare a mano l'API degli egress giorni
       * dopo, quando la seduta era gia' persa.
       *
       * Non e' un dato sensibile: e' un errore d'infrastruttura, non contiene
       * nulla della conversazione. La colonna e' comunque limitata a 500
       * caratteri, e il testo viene tagliato.
       */
      errorMessageSanitized: sanitizeEgressFailure(info.error),
    })
    .where(eq(sessionAudioRecordings.id, recording.id));
  await auditEgress({
    sessionId: recording.sessionId,
    requestedBy: recording.requestedBy,
    eventType: 'recording_failed',
    recordingId: recording.id,
    errorCode,
    executor,
  });
}

/**
 * Se la sessione ha una registrazione avviata o in corso in questo momento.
 *
 * È la condizione che rende legittimo l'egress presente in stanza: senza una
 * registrazione richiesta da noi, un egress non ha titolo per esserci.
 */
async function hasRecordingInProgress(
  sessionId: number,
  executor: DbOrTx = db
): Promise<boolean> {
  const [row] = await executor
    .select({ id: sessionAudioRecordings.id })
    .from(sessionAudioRecordings)
    .where(
      and(
        eq(sessionAudioRecordings.sessionAiNotesId, sessionId),
        inArray(sessionAudioRecordings.status, [
          'pending',
          'starting',
          'recording',
          'stopping',
        ])
      )
    )
    .limit(1);
  return Boolean(row);
}

export async function processLiveKitWebhookEvent(
  event: WebhookEvent,
  dependencies: AiSessionNotesDependencies
): Promise<void> {
  const executor = dependencies.db;
  const liveKit = dependencies.liveKit;
  const eventName = event.event ?? '';
  if (eventName.startsWith('egress_')) {
    await handleEgressEvent(event, executor);
    return;
  }
  const session = await sessionForRoom(roomNameForEvent(event), executor);
  if (!session) return;

  if (
    eventName === 'participant_joined' &&
    isIntruderParticipant({
      identity: event.participant?.identity,
      kind: event.participant?.kind,
      expectedIdentities: [
        `user-${session.coachUserId}`,
        `user-${session.athleteUserId}`,
      ],
      // La registrazione di LiveKit entra in stanza come partecipante: se
      // l'abbiamo chiesta noi, quello è il nostro registratore e non un
      // intruso. Senza questo controllo la guardia fermava la registrazione
      // circa trecento millisecondi dopo averla avviata.
      recordingInProgress: await hasRecordingInProgress(
        session.id,
        executor
      ),
    })
  ) {
    await executor.insert(sessionAiAuditEvents).values({
      sessionAiNotesId: session.id,
      eventType: 'unverified_participant_blocked',
      actorUserId: session.requestedBy,
      eventMetadata: { action: 'recording_stopped' },
      createdBy: session.requestedBy,
      updatedBy: session.requestedBy,
    });
    await stopAiNotesRecordings({
      sessionId: session.id,
      reason: 'unverified_participant_joined',
    }, liveKit, executor);
    return;
  }
  if (eventName === 'room_finished') {
    // La stanza non esiste più: non può rientrare nessuno, e la sessione è
    // finita davvero.
    await closeAiNotesSession(
      { sessionId: session.id, reason: 'room_finished' },
      liveKit,
      executor
    );
    return;
  }
  if (
    eventName === 'participant_left' &&
    !!event.participant?.identity &&
    [
      `user-${session.coachUserId}`,
      `user-${session.athleteUserId}`,
    ].includes(event.participant.identity)
  ) {
    // Uscire non chiude la sessione: si può rientrare, e al rientro
    // `track_published` fa ripartire la registrazione con un segmento nuovo.
    await stopAiNotesRecordingsByParticipant(
      {
        sessionId: session.id,
        participantIdentity: event.participant.identity,
        reason: 'participant_left',
      },
      liveKit,
      executor
    );
    return;
  }
  if (eventName === 'track_unpublished' && event.track?.sid) {
    await stopAiNotesRecordingByTrack({
      sessionId: session.id,
      trackSid: event.track.sid,
      reason: 'track_unpublished',
    }, liveKit, executor);
    return;
  }
  if (
    eventName === 'track_published' &&
    session.status === 'active'
  ) {
    try {
      await startAiNotesRecordingSystem(
        { sessionId: session.id },
        liveKit,
        executor
      );
    } catch {
      // Missing peer/microphone is expected during join/reconnect ordering.
      // A later track_published event or explicit retry will re-evaluate.
    }
  }
}

export async function processVerifiedLiveKitWebhook(
  event: WebhookEvent,
  rawBody: string,
  dependencies: AiSessionNotesDependencies
): Promise<{ duplicate: boolean }> {
  const executor = dependencies.db;
  const claimed = await claimReceipt(event, rawBody, executor);
  if (claimed === 'duplicate') return { duplicate: true };
  try {
    await processLiveKitWebhookEvent(event, dependencies);
    await executor
      .update(livekitWebhookReceipts)
      .set({
        status: 'processed',
        processedAt: new Date(),
        errorCode: null,
        updatedDate: new Date(),
      })
      .where(eq(livekitWebhookReceipts.eventId, event.id!));
    return { duplicate: false };
  } catch (error) {
    await executor
      .update(livekitWebhookReceipts)
      .set({
        status: 'failed',
        errorCode:
          error instanceof Error ? error.name.slice(0, 80) : 'unknown',
        updatedDate: new Date(),
      })
      .where(eq(livekitWebhookReceipts.eventId, event.id!));
    throw new LiveKitWebhookError(
      'PROCESSING_FAILED',
      'Elaborazione webhook non riuscita.'
    );
  }
}
