import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  sessionAiAuditEvents,
  sessionAiConsents,
  sessionAiNotes,
  sessionAudioRecordings,
  userFeatureEntitlements,
  type AiAuditEventType,
  type AudioRecordingStatus,
} from '@/lib/db/schema';
import {
  evaluateFeatureEntitlement,
  FEATURE_CODES,
} from '@/lib/core/features/policy';
import { ensureAudioBucketPrivate } from './audio-storage';
import {
  audioRetentionUntil,
  getAudioRecordingConfig,
  type AudioRecordingConfig,
} from './recording-config';
import {
  aggregateRecordingState,
  isRecordingStoppable,
  verifyRoomForTrackEgress,
  type VerifiedMicrophone,
} from './recording-policy';
import { AiNotesDomainError } from './state-machine';
import type { LiveKitSessionControl } from './livekit-session-control';

const ACTIVE_RECORDING_STATUSES: AudioRecordingStatus[] = [
  'pending',
  'starting',
  'recording',
  'stopping',
];

type SessionRecordingContext = {
  sessionId: number;
  bookingId: number;
  roomName: string;
  requestedBy: number;
  sessionStatus: string;
  bookingStatus: string;
  coachUserId: number;
  athleteUserId: number;
};

function storageConfiguration(): AudioRecordingConfig {
  try {
    return getAudioRecordingConfig();
  } catch {
    throw new AiNotesDomainError(
      'STORAGE_NOT_CONFIGURED',
      'Lo storage privato per la registrazione audio non è configurato.'
    );
  }
}

async function sessionContext(
  sessionId: number,
  executor: DbOrTx = db
): Promise<SessionRecordingContext | null> {
  const [row] = await executor
    .select({
      sessionId: sessionAiNotes.id,
      bookingId: sessionAiNotes.bookingId,
      roomName: sessionAiNotes.livekitRoomName,
      requestedBy: sessionAiNotes.requestedBy,
      sessionStatus: sessionAiNotes.status,
      bookingStatus: bookings.status,
      coachUserId: providerProfiles.userId,
      athleteUserId: bookings.clientId,
    })
    .from(sessionAiNotes)
    .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .innerJoin(
      providerProfiles,
      eq(providerProfiles.id, bookings.providerId)
    )
    .where(eq(sessionAiNotes.id, sessionId))
    .limit(1);
  return row ?? null;
}

async function auditRecording(
  executor: DbOrTx,
  params: {
    sessionId: number;
    eventType: AiAuditEventType;
    actorUserId?: number | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await executor.insert(sessionAiAuditEvents).values({
    sessionAiNotesId: params.sessionId,
    eventType: params.eventType,
    actorUserId: params.actorUserId ?? null,
    eventMetadata: params.metadata ?? {},
    createdBy: params.actorUserId ?? null,
    updatedBy: params.actorUserId ?? null,
  });
}


function verificationError(
  code:
    | 'UNVERIFIED_PARTICIPANT_PRESENT'
    | 'REQUIRED_PARTICIPANT_MISSING'
    | 'REQUIRED_AUDIO_TRACK_MISSING'
): AiNotesDomainError {
  const messages = {
    UNVERIFIED_PARTICIPANT_PRESENT:
      'Gli Appunti AI non possono iniziare perché nella sessione è presente un partecipante non verificato.',
    REQUIRED_PARTICIPANT_MISSING:
      'Coach e atleta devono essere entrambi presenti nella stanza.',
    REQUIRED_AUDIO_TRACK_MISSING:
      'Coach e atleta devono avere entrambi una traccia microfono pubblicata.',
  };
  return new AiNotesDomainError(code, messages[code]);
}

async function assertStartPreconditions(
  context: SessionRecordingContext,
  actorUserId: number | null,
  enforceCoach: boolean,
  executor: DbOrTx = db
): Promise<void> {
  if (
    enforceCoach &&
    (actorUserId === null || actorUserId !== context.coachUserId)
  ) {
    // 404 prevents an outsider from probing session IDs.
    throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
  }
  if (
    actorUserId !== null &&
    actorUserId !== context.coachUserId &&
    actorUserId !== context.athleteUserId
  ) {
    throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
  }
  if (
    context.sessionStatus !== 'active' ||
    context.bookingStatus !== 'accepted'
  ) {
    throw new AiNotesDomainError(
      'RECORDING_NOT_READY',
      'La sessione non è pronta per la registrazione.'
    );
  }

  const [entitlementRow] = await executor
    .select({
      id: userFeatureEntitlements.id,
      status: userFeatureEntitlements.status,
      source: userFeatureEntitlements.source,
      startsAt: userFeatureEntitlements.startsAt,
      expiresAt: userFeatureEntitlements.expiresAt,
      usageLimit: userFeatureEntitlements.usageLimit,
      usageCount: userFeatureEntitlements.usageCount,
    })
    .from(userFeatureEntitlements)
    .where(
      and(
        eq(userFeatureEntitlements.userId, context.requestedBy),
        eq(
          userFeatureEntitlements.featureCode,
          FEATURE_CODES.AI_SESSION_NOTES
        )
      )
    )
    .limit(1);
  const entitlement = evaluateFeatureEntitlement(
    entitlementRow
      ? {
          ...entitlementRow,
          status: entitlementRow.status as
            | 'enabled'
            | 'disabled'
            | 'trial'
            | 'expired'
            | 'suspended',
          source: entitlementRow.source as
            | 'admin'
            | 'beta'
            | 'subscription'
            | 'addon'
            | 'trial'
            | 'system',
        }
      : null
  );
  if (!entitlement.allowed) {
    throw new AiNotesDomainError(
      'NOT_ENTITLED',
      'Funzionalità non abilitata per questo utente.'
    );
  }

  const consents = await executor
    .select({
      userId: sessionAiConsents.userId,
      status: sessionAiConsents.consentStatus,
    })
    .from(sessionAiConsents)
    .where(eq(sessionAiConsents.sessionAiNotesId, context.sessionId));
  const validUsers = new Set(
    consents
      .filter((consent) => consent.status === 'accepted')
      .map((consent) => consent.userId)
  );
  if (
    validUsers.size !== 2 ||
    !validUsers.has(context.coachUserId) ||
    !validUsers.has(context.athleteUserId)
  ) {
    throw new AiNotesDomainError(
      'RECORDING_NOT_READY',
      'Sono necessari entrambi i consensi validi.'
    );
  }
}

async function verifyLiveRoom(
  context: SessionRecordingContext,
  liveKit: LiveKitSessionControl,
  executor: DbOrTx = db
): Promise<VerifiedMicrophone[]> {
  let participants;
  try {
    participants = await liveKit.listParticipants(context.roomName);
  } catch {
    throw verificationError('REQUIRED_PARTICIPANT_MISSING');
  }
  const result = verifyRoomForTrackEgress(
    participants.map((participant) => ({
      identity: participant.identity,
      tracks: participant.tracks,
    })),
    [
      {
        userId: context.coachUserId,
        role: 'coach',
        identity: `user-${context.coachUserId}`,
      },
      {
        userId: context.athleteUserId,
        role: 'athlete',
        identity: `user-${context.athleteUserId}`,
      },
    ]
  );
  if (!result.ok) {
    if (result.code === 'UNVERIFIED_PARTICIPANT_PRESENT') {
      await auditRecording(executor, {
        sessionId: context.sessionId,
        eventType: 'unverified_participant_blocked',
        actorUserId: context.requestedBy,
      });
    }
    throw verificationError(result.code);
  }
  return result.microphones;
}

type ReservedRecording = {
  id: number;
  trackSid: string;
  roomName: string;
  objectKey: string;
  participantRole: 'coach' | 'athlete';
};

async function reserveTracks(
  context: SessionRecordingContext,
  tracks: VerifiedMicrophone[],
  config: AudioRecordingConfig,
  actorUserId: number | null,
  executor: DbOrTx = db
): Promise<ReservedRecording[]> {
  return executor.transaction(async (tx) => {
    const locked = await tx.execute(sql`
      SELECT status
      FROM session_ai_notes
      WHERE id = ${context.sessionId}
      FOR UPDATE
    `);
    const status = (
      locked as unknown as Array<{ status: string }>
    )[0]?.status;
    if (status !== 'active') {
      throw new AiNotesDomainError(
        'RECORDING_NOT_READY',
        'La sessione non è più attiva.'
      );
    }

    const consents = await tx
      .select({
        userId: sessionAiConsents.userId,
        status: sessionAiConsents.consentStatus,
      })
      .from(sessionAiConsents)
      .where(eq(sessionAiConsents.sessionAiNotesId, context.sessionId));
    if (
      consents.length !== 2 ||
      consents.some((consent) => consent.status !== 'accepted')
    ) {
      throw new AiNotesDomainError(
        'RECORDING_NOT_READY',
        'Sono necessari entrambi i consensi validi.'
      );
    }

    const now = new Date();
    const reserved: ReservedRecording[] = [];
    for (const track of tracks) {
      const objectKey =
        `audio-recordings/${context.sessionId}/${track.role}/` +
        `${randomUUID()}.ogg`;
      const [inserted] = await tx
        .insert(sessionAudioRecordings)
        .values({
          sessionAiNotesId: context.sessionId,
          bookingId: context.bookingId,
          participantUserId: track.userId,
          participantRole: track.role,
          livekitRoomName: context.roomName,
          livekitParticipantIdentity: track.identity,
          livekitTrackSid: track.trackSid,
          status: 'starting',
          storageBucket: config.bucket,
          storageObjectKey: objectKey,
          retentionUntil: audioRetentionUntil(config, now),
          metadata: {
            safetyStopAt: new Date(
              now.getTime() + config.safetyTimeoutMinutes * 60_000
            ).toISOString(),
          },
          createdBy: actorUserId ?? context.requestedBy,
          updatedBy: actorUserId ?? context.requestedBy,
        })
        .onConflictDoNothing({
          target: [
            sessionAudioRecordings.sessionAiNotesId,
            sessionAudioRecordings.livekitTrackSid,
          ],
        })
        .returning({
          id: sessionAudioRecordings.id,
          trackSid: sessionAudioRecordings.livekitTrackSid,
          roomName: sessionAudioRecordings.livekitRoomName,
          objectKey: sessionAudioRecordings.storageObjectKey,
          participantRole: sessionAudioRecordings.participantRole,
        });
      if (inserted) {
        reserved.push({
          ...inserted,
          participantRole: inserted.participantRole as
            | 'coach'
            | 'athlete',
        });
        await auditRecording(tx, {
          sessionId: context.sessionId,
          eventType: 'recording_start_requested',
          actorUserId: actorUserId ?? context.requestedBy,
          metadata: {
            recordingId: inserted.id,
            participantRole: inserted.participantRole,
          },
        });
      }
    }
    return reserved;
  });
}

async function startReservedTrack(
  recording: ReservedRecording,
  actorUserId: number,
  liveKit: LiveKitSessionControl,
  executor: DbOrTx = db
): Promise<void> {
  let egressId: string | null = null;
  try {
    const info = await liveKit.startTrackEgress({ roomName: recording.roomName, trackSid: recording.trackSid, objectKey: recording.objectKey });
    egressId = info.egressId;
    const [claimed] = await executor
      .update(sessionAudioRecordings)
      .set({
        livekitEgressId: egressId,
        updatedDate: new Date(),
        updatedBy: actorUserId,
      })
      .where(
        and(
          eq(sessionAudioRecordings.id, recording.id),
          eq(sessionAudioRecordings.status, 'starting'),
          isNull(sessionAudioRecordings.livekitEgressId)
        )
      )
      .returning({ id: sessionAudioRecordings.id });

    // Consent/room shutdown may race the Egress API. If the row was already
    // moved to stopping, stop the newly-created Egress immediately.
    if (!claimed) {
      await liveKit.stopEgress(egressId);
      await executor
        .update(sessionAudioRecordings)
        .set({
          livekitEgressId: egressId,
          status: 'stopping',
          updatedDate: new Date(),
          updatedBy: actorUserId,
        })
        .where(eq(sessionAudioRecordings.id, recording.id));
    }
  } catch (error) {
    await executor
      .update(sessionAudioRecordings)
      .set({
        livekitEgressId: egressId,
        status: 'failed',
        errorCode: 'EGRESS_START_FAILED',
        errorMessageSanitized:
          error instanceof Error ? error.name.slice(0, 80) : 'unknown',
        endedAt: new Date(),
        updatedDate: new Date(),
        updatedBy: actorUserId,
      })
      .where(eq(sessionAudioRecordings.id, recording.id));
    await auditRecording(executor, {
      sessionId: Number(recording.objectKey.split('/')[1]),
      eventType: 'recording_failed',
      actorUserId,
      metadata: {
        recordingId: recording.id,
        errorCode: 'EGRESS_START_FAILED',
      },
    });
    throw new AiNotesDomainError(
      'RECORDING_FAILED',
      'Avvio della registrazione audio non riuscito.'
    );
  }
}

async function startRecording(params: {
  sessionId: number;
  actorUserId: number | null;
  enforceCoach: boolean;
}, liveKit: LiveKitSessionControl, executor: DbOrTx = db): Promise<RecordingStatusView> {
  const context = await sessionContext(params.sessionId, executor);
  if (!context) {
    throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
  }
  await assertStartPreconditions(
    context,
    params.actorUserId,
    params.enforceCoach, executor
  );
  const config = storageConfiguration();
  await ensureAudioBucketPrivate(config).catch(() => {
    throw new AiNotesDomainError(
      'STORAGE_NOT_CONFIGURED',
      'Il bucket audio privato non è disponibile.'
    );
  });
  const tracks = await verifyLiveRoom(context, liveKit, executor);
  const reserved = await reserveTracks(
    context,
    tracks,
    config,
    params.actorUserId, executor
  );

  const failures: unknown[] = [];
  for (const recording of reserved) {
    try {
      await startReservedTrack(
        recording,
        params.actorUserId ?? context.requestedBy,
        liveKit,
        executor
      );
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) throw failures[0];
  return getRecordingStatus(params.sessionId, params.actorUserId ?? context.requestedBy, executor);
}

/** Manual endpoint: only the booking coach can request start. */
export async function startAiNotesRecording(params: {
  sessionId: number;
  actorUserId: number;
}, liveKit: LiveKitSessionControl): Promise<RecordingStatusView> {
  return startRecording({ ...params, enforceCoach: true }, liveKit);
}

/** Consent/webhook trigger: identity still comes from the canonical DB row. */
export async function startAiNotesRecordingSystem(params: {
  sessionId: number;
  actorUserId?: number | null;
}, liveKit: LiveKitSessionControl, executor: DbOrTx = db): Promise<RecordingStatusView> {
  return startRecording({
    sessionId: params.sessionId,
    actorUserId: params.actorUserId ?? null,
    enforceCoach: false,
  }, liveKit, executor);
}

export async function stopAiNotesRecordings(params: {
  sessionId: number;
  actorUserId?: number | null;
  reason: string;
  enforceCoach?: boolean;
}, liveKit: LiveKitSessionControl, executor: DbOrTx = db): Promise<void> {
  const context = await sessionContext(params.sessionId, executor);
  if (!context) {
    if (params.enforceCoach) {
      throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
    }
    return;
  }
  if (
    params.enforceCoach &&
    params.actorUserId !== context.coachUserId
  ) {
    throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
  }

  const rows = await executor
    .select({
      id: sessionAudioRecordings.id,
      egressId: sessionAudioRecordings.livekitEgressId,
      status: sessionAudioRecordings.status,
    })
    .from(sessionAudioRecordings)
    .where(
      and(
        eq(sessionAudioRecordings.sessionAiNotesId, params.sessionId),
        inArray(sessionAudioRecordings.status, [
          'pending',
          'starting',
          'recording',
        ])
      )
    )
    .orderBy(asc(sessionAudioRecordings.id));
  if (rows.length === 0) return;

  const actorUserId = params.actorUserId ?? context.requestedBy;
  for (const row of rows) {
    if (!isRecordingStoppable(row.status)) continue;
    const [claimed] = await executor
      .update(sessionAudioRecordings)
      .set({
        status: 'stopping',
        updatedDate: new Date(),
        updatedBy: actorUserId,
        metadata: sql`${sessionAudioRecordings.metadata} || ${JSON.stringify({
          stopReason: params.reason.slice(0, 80),
        })}::jsonb`,
      })
      .where(
        and(
          eq(sessionAudioRecordings.id, row.id),
          inArray(sessionAudioRecordings.status, [
            'pending',
            'starting',
            'recording',
          ])
        )
      )
      .returning({ id: sessionAudioRecordings.id });
    if (!claimed) continue;
    await auditRecording(executor, {
      sessionId: params.sessionId,
      eventType: 'recording_stop_requested',
      actorUserId,
      metadata: { recordingId: row.id, reason: params.reason.slice(0, 80) },
    });
    if (!row.egressId) continue;
    try {
      await liveKit.stopEgress(row.egressId);
    } catch {
      // Webhook/reconciliation owns the final state. A repeated stop or an
      // already-ended Egress is not converted into a false terminal result.
    }
  }
}

export async function stopBookingAiNotesRecordings(params: {
  bookingId: number;
  actorUserId?: number | null;
  reason: string;
}, liveKit: LiveKitSessionControl): Promise<void> {
  const sessions = await db
    .select({ id: sessionAiNotes.id })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.bookingId, params.bookingId));
  for (const session of sessions) {
    await stopAiNotesRecordings({
      sessionId: session.id,
      actorUserId: params.actorUserId,
      reason: params.reason,
    }, liveKit);
  }
}

export async function stopAiNotesRecordingsForRequester(params: {
  requestedBy: number;
  actorUserId: number;
  reason: string;
}, liveKit: LiveKitSessionControl): Promise<void> {
  const sessions = await db
    .select({ id: sessionAiNotes.id })
    .from(sessionAiNotes)
    .where(
      and(
        eq(sessionAiNotes.requestedBy, params.requestedBy),
        inArray(sessionAiNotes.status, ['waiting_for_consent', 'active'])
      )
    );
  for (const session of sessions) {
    await stopAiNotesRecordings({
      sessionId: session.id,
      actorUserId: params.actorUserId,
      reason: params.reason,
    }, liveKit);
  }
}

export async function stopAiNotesRecordingByTrack(params: {
  sessionId: number;
  trackSid: string;
  reason: string;
}, liveKit: LiveKitSessionControl, executor: DbOrTx = db): Promise<void> {
  const context = await sessionContext(params.sessionId, executor);
  if (!context) return;
  const [row] = await executor
    .select({
      id: sessionAudioRecordings.id,
      egressId: sessionAudioRecordings.livekitEgressId,
      status: sessionAudioRecordings.status,
    })
    .from(sessionAudioRecordings)
    .where(
      and(
        eq(sessionAudioRecordings.sessionAiNotesId, params.sessionId),
        eq(sessionAudioRecordings.livekitTrackSid, params.trackSid)
      )
    )
    .limit(1);
  if (!row || !isRecordingStoppable(row.status)) return;
  const [claimed] = await executor
    .update(sessionAudioRecordings)
    .set({
      status: 'stopping',
      updatedDate: new Date(),
      updatedBy: context.requestedBy,
    })
    .where(
      and(
        eq(sessionAudioRecordings.id, row.id),
        inArray(sessionAudioRecordings.status, [
          'pending',
          'starting',
          'recording',
        ])
      )
    )
    .returning({ id: sessionAudioRecordings.id });
  if (!claimed) return;
  await auditRecording(executor, {
    sessionId: params.sessionId,
    eventType: 'recording_stop_requested',
    actorUserId: context.requestedBy,
    metadata: {
      recordingId: row.id,
      reason: params.reason.slice(0, 80),
    },
  });
  if (!row.egressId) return;
  try {
    await liveKit.stopEgress(row.egressId);
  } catch {
    // Final state remains webhook/reconciliation-owned.
  }
}

export type RecordingStatusView = {
  state:
    | 'not_started'
    | 'starting'
    | 'recording'
    | 'stopping'
    | 'recorded'
    | 'failed'
    | 'deleted';
  participants: Array<{
    role: 'coach' | 'athlete';
    status: AudioRecordingStatus;
    startedAt: string | null;
    endedAt: string | null;
    errorCode: string | null;
  }>;
};

function aggregateStatus(statuses: AudioRecordingStatus[]): RecordingStatusView['state'] {
  return aggregateRecordingState(statuses);
}

export async function getRecordingStatus(
  sessionId: number,
  actorUserId: number,
  executor: DbOrTx = db
): Promise<RecordingStatusView> {
  const context = await sessionContext(sessionId, executor);
  if (
    !context ||
    ![context.coachUserId, context.athleteUserId].includes(actorUserId)
  ) {
    throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
  }
  const rows = await executor
    .select({
      role: sessionAudioRecordings.participantRole,
      status: sessionAudioRecordings.status,
      startedAt: sessionAudioRecordings.startedAt,
      endedAt: sessionAudioRecordings.endedAt,
      errorCode: sessionAudioRecordings.errorCode,
    })
    .from(sessionAudioRecordings)
    .where(eq(sessionAudioRecordings.sessionAiNotesId, sessionId))
    .orderBy(asc(sessionAudioRecordings.id));
  const participants = rows.map((row) => ({
    role: row.role as 'coach' | 'athlete',
    status: row.status as AudioRecordingStatus,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    errorCode: row.errorCode,
  }));
  return {
    state: aggregateStatus(participants.map((row) => row.status)),
    participants,
  };
}

export async function hasActiveAiNotesRecordingForBooking(
  bookingId: number
): Promise<boolean> {
  const [row] = await db
    .select({ id: sessionAudioRecordings.id })
    .from(sessionAudioRecordings)
    .innerJoin(
      sessionAiNotes,
      eq(sessionAiNotes.id, sessionAudioRecordings.sessionAiNotesId)
    )
    .where(
      and(
        eq(sessionAiNotes.bookingId, bookingId),
        inArray(sessionAudioRecordings.status, ACTIVE_RECORDING_STATUSES)
      )
    )
    .limit(1);
  return !!row;
}

export async function hasActiveAiNotesSessionForBooking(
  bookingId: number
): Promise<boolean> {
  const [row] = await db
    .select({ id: sessionAiNotes.id })
    .from(sessionAiNotes)
    .where(
      and(
        eq(sessionAiNotes.bookingId, bookingId),
        inArray(sessionAiNotes.status, ['waiting_for_consent', 'active'])
      )
    )
    .limit(1);
  return !!row;
}
