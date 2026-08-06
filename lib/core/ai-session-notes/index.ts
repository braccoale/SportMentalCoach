import 'server-only';
import { createHash } from 'node:crypto';
import {
  and,
  desc,
  eq,
  inArray,
  or,
  sql,
} from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  services,
  sessionAiAuditEvents,
  sessionAiConsents,
  sessionAiNotes,
  userFeatureEntitlements,
  userRoles,
  type AiAuditEventType,
  type AiConsentStatus,
  type AiSessionNoteStatus,
  type FeatureEntitlementSource,
  type FeatureEntitlementStatus,
} from '@/lib/db/schema';
import {
  FEATURE_CODES,
  evaluateFeatureEntitlement,
} from '@/lib/core/features/policy';
import { isVideoConfigured } from '@/lib/core/flags';
import {
  canJoinVideoNow,
  isSessionJoinable,
} from '@/lib/core/sessions';
import { parseBookingRoomName } from '@/lib/core/video/technical-events';
import { effectiveBookingDurationMin } from '@/lib/core/bookings/conflict-query';
import {
  authorizeAiNotesStart,
  type StartAuthorizationResult,
} from './authorization';
import {
  AiNotesDomainError,
  assertAiNotesTransition,
  transitionAuditPatch,
} from './state-machine';
import {
  AI_NOTES_CONSENT_TEXT,
  AI_NOTES_CONSENT_VERSION,
} from './consent-copy';
import {
  canActorAnswerConsent,
  canApplyConsentDecision,
  isConsentDecisionIdempotent,
  nextStatusAfterConsent,
  type ConsentDecision,
} from './consent-policy';
import {
  startAiNotesRecordingSystem,
  stopAiNotesRecordings,
} from './recording';
import type { LiveKitSessionControl } from './livekit-session-control';
import { cancelAiProcessingJobsForSession } from './processing';
import { canUseAiNotesForAthlete } from '@/lib/core/guardians';

export {
  AiNotesDomainError,
  assertAiNotesTransition,
  canTransitionAiNotesSession,
  transitionAuditPatch,
  type AiNotesErrorCode,
} from './state-machine';
export {
  AI_NOTES_CONSENT_TEXT,
  AI_NOTES_CONSENT_VERSION,
} from './consent-copy';
export {
  authorizeAiNotesStart,
  type StartAuthorizationInput,
  type StartAuthorizationResult,
} from './authorization';
export type { ConsentDecision } from './consent-policy';

const OPEN_STATUSES: AiSessionNoteStatus[] = [
  'waiting_for_consent',
  'active',
  'processing',
  'ready_for_review',
  'approved',
];

const CONSENT_HASH = createHash('sha256')
  .update(AI_NOTES_CONSENT_TEXT, 'utf8')
  .digest('hex');

type BookingParticipants = {
  bookingId: number;
  status: string;
  scheduledFor: Date | null;
  /** Durata concordata: decide fino a quando la sessione è raggiungibile. */
  durationMin: number;
  clientUserId: number;
  coachUserId: number;
};

async function getBookingParticipants(
  executor: DbOrTx,
  bookingId: number
): Promise<BookingParticipants | null> {
  const [row] = await executor
    .select({
      bookingId: bookings.id,
      status: bookings.status,
      scheduledFor: bookings.scheduledFor,
      durationMin: effectiveBookingDurationMin,
      clientUserId: bookings.clientId,
      coachUserId: providerProfiles.userId,
    })
    .from(bookings)
    .innerJoin(
      providerProfiles,
      eq(providerProfiles.id, bookings.providerId)
    )
    .leftJoin(services, eq(services.id, bookings.serviceId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row ?? null;
}

async function actorIsAdmin(
  executor: DbOrTx,
  actorUserId: number
): Promise<boolean> {
  const [role] = await executor
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, actorUserId),
        eq(userRoles.roleKey, 'admin')
      )
    )
    .limit(1);
  return !!role;
}

function startError(result: Exclude<StartAuthorizationResult, { allowed: true }>) {
  switch (result.reason) {
    case 'unauthenticated':
      return new AiNotesDomainError('FORBIDDEN', 'Non autenticato.');
    case 'not_found':
      return new AiNotesDomainError('NOT_FOUND', 'Appuntamento non trovato.');
    case 'not_participant':
      return new AiNotesDomainError('NOT_FOUND', 'Appuntamento non trovato.');
    case 'coach_only':
      return new AiNotesDomainError(
        'FORBIDDEN',
        'Non puoi avviare Appunti AI per questa sessione.'
      );
    case 'booking_not_accepted':
      return new AiNotesDomainError(
        'BOOKING_NOT_ACCEPTED',
        'La sessione deve essere confermata.'
      );
    case 'invalid_room':
      return new AiNotesDomainError(
        'INVALID_ROOM',
        'Stanza LiveKit non valida.'
      );
    case 'video_not_configured':
      return new AiNotesDomainError(
        'VIDEO_NOT_CONFIGURED',
        'Videochiamata non configurata.'
      );
    case 'outside_call_window':
      return new AiNotesDomainError(
        'OUTSIDE_CALL_WINDOW',
        'Appunti AI può essere avviato solo durante la videochiamata.'
      );
    case 'already_active':
      return new AiNotesDomainError(
        'ALREADY_ACTIVE',
        'Esiste già una sessione Appunti AI per questo appuntamento.'
      );
    case 'not_entitled':
      return new AiNotesDomainError(
        'NOT_ENTITLED',
        'Funzionalità non abilitata per questo utente.'
      );
  }
}

async function audit(
  executor: DbOrTx,
  params: {
    sessionId?: number | null;
    eventType: AiAuditEventType;
    actorUserId: number;
    previousStatus?: AiSessionNoteStatus | null;
    newStatus?: AiSessionNoteStatus | null;
    metadata?: Record<string, unknown>;
  }
) {
  await executor.insert(sessionAiAuditEvents).values({
    sessionAiNotesId: params.sessionId ?? null,
    eventType: params.eventType,
    actorUserId: params.actorUserId,
    previousStatus: params.previousStatus ?? null,
    newStatus: params.newStatus ?? null,
    eventMetadata: params.metadata ?? {},
    createdBy: params.actorUserId,
    updatedBy: params.actorUserId,
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

/**
 * Atomically verifies entitlement + booking ownership, creates the consent
 * request and consumes one usage. No room name or participant id comes from
 * the browser.
 */
export async function startAiNotesSession(params: {
  bookingId: number;
  actorUserId: number;
}): Promise<{ sessionId: number }> {
  try {
    const outcome = await db.transaction(async (tx) => {
      const booking = await getBookingParticipants(tx, params.bookingId);
      const roomName = `booking-${params.bookingId}`;

      const lockedEntitlements = await tx.execute(sql`
        SELECT id, status, source, starts_at, expires_at, usage_limit, usage_count
        FROM user_feature_entitlements
        WHERE user_id = ${params.actorUserId}
          AND feature_code = ${FEATURE_CODES.AI_SESSION_NOTES}
        FOR UPDATE
      `);
      const locked = (
        lockedEntitlements as unknown as Array<{
          id: number;
          status: FeatureEntitlementStatus;
          source: FeatureEntitlementSource;
          starts_at: Date | null;
          expires_at: Date | null;
          usage_limit: number | null;
          usage_count: number;
        }>
      )[0];
      const featureAccess = evaluateFeatureEntitlement(
        locked
          ? {
              id: locked.id,
              status: locked.status,
              source: locked.source,
              startsAt: locked.starts_at,
              expiresAt: locked.expires_at,
              usageLimit: locked.usage_limit,
              usageCount: locked.usage_count,
            }
          : null
      );

      const [openSession] = booking
        ? await tx
            .select({ id: sessionAiNotes.id })
            .from(sessionAiNotes)
            .where(
              and(
                eq(sessionAiNotes.bookingId, params.bookingId),
                inArray(sessionAiNotes.status, OPEN_STATUSES)
              )
            )
            .limit(1)
        : [];

      const authorization = authorizeAiNotesStart({
        authenticated: true,
        bookingExists: !!booking,
        actorUserId: params.actorUserId,
        clientUserId: booking?.clientUserId,
        coachUserId: booking?.coachUserId,
        bookingStatus: booking?.status,
        roomMatchesBooking:
          parseBookingRoomName(roomName) === params.bookingId,
        videoConfigured: isVideoConfigured(),
        withinCallWindow:
          !!booking &&
          isSessionJoinable(booking.scheduledFor, booking.durationMin) &&
          canJoinVideoNow(booking.scheduledFor, booking.durationMin),
        featureAccess,
        hasOpenSession: !!openSession,
      });

      if (!authorization.allowed) {
        if (authorization.reason === 'not_entitled') {
          await audit(tx, {
            eventType: 'entitlement_denied',
            actorUserId: params.actorUserId,
            metadata: { featureCode: FEATURE_CODES.AI_SESSION_NOTES },
          });
        }
        return { error: startError(authorization) };
      }

      // Only after the caller has been proved to be the entitled coach: doing
      // this earlier would let someone enumerate a minor's guardian status by
      // guessing booking ids.
      const guardianAi = await canUseAiNotesForAthlete(
        booking!.clientUserId,
        tx
      );
      if (!guardianAi.ok) {
        return {
          error: new AiNotesDomainError('FORBIDDEN', guardianAi.error),
        };
      }

      const [session] = await tx
        .insert(sessionAiNotes)
        .values({
          bookingId: params.bookingId,
          livekitRoomName: roomName,
          requestedBy: params.actorUserId,
          status: 'waiting_for_consent',
          featureCode: FEATURE_CODES.AI_SESSION_NOTES,
          consentRequired: true,
          metadata: {
            captureEnabled: true,
            phase: '2A',
            recordingMode: 'livekit_track_egress',
          },
          createdBy: params.actorUserId,
          updatedBy: params.actorUserId,
        })
        .returning({ id: sessionAiNotes.id });

      await tx.insert(sessionAiConsents).values([
        {
          sessionAiNotesId: session.id,
          userId: booking!.coachUserId,
          participantRole: 'coach',
          consentStatus: 'pending',
          consentVersion: AI_NOTES_CONSENT_VERSION,
          consentTextHash: CONSENT_HASH,
          createdBy: params.actorUserId,
          updatedBy: params.actorUserId,
        },
        {
          sessionAiNotesId: session.id,
          userId: booking!.clientUserId,
          participantRole: 'athlete',
          consentStatus: 'pending',
          consentVersion: AI_NOTES_CONSENT_VERSION,
          consentTextHash: CONSENT_HASH,
          createdBy: params.actorUserId,
          updatedBy: params.actorUserId,
        },
      ]);

      await tx
        .update(userFeatureEntitlements)
        .set({
          usageCount: sql`${userFeatureEntitlements.usageCount} + 1`,
          updatedDate: new Date(),
          updatedBy: params.actorUserId,
        })
        .where(eq(userFeatureEntitlements.id, locked.id));

      await audit(tx, {
        sessionId: session.id,
        eventType: 'feature_requested',
        actorUserId: params.actorUserId,
        newStatus: 'waiting_for_consent',
      });
      return { sessionId: session.id };
    });

    if ('error' in outcome) throw outcome.error;
    return outcome;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AiNotesDomainError(
        'ALREADY_ACTIVE',
        'Esiste già una sessione Appunti AI per questo appuntamento.'
      );
    }
    throw error;
  }
}

type LockedSession = {
  id: number;
  booking_id: number;
  requested_by: number;
  status: AiSessionNoteStatus;
};

async function lockSession(
  executor: DbOrTx,
  sessionId: number
): Promise<LockedSession | null> {
  const rows = await executor.execute(sql`
    SELECT id, booking_id, requested_by, status
    FROM session_ai_notes
    WHERE id = ${sessionId}
    FOR UPDATE
  `);
  return (rows as unknown as LockedSession[])[0] ?? null;
}

async function updateStatus(
  executor: DbOrTx,
  params: {
    session: LockedSession;
    nextStatus: AiSessionNoteStatus;
    actorUserId: number;
    eventType: AiAuditEventType;
  }
) {
  assertAiNotesTransition(params.session.status, params.nextStatus);
  const now = new Date();
  await executor
    .update(sessionAiNotes)
    .set(transitionAuditPatch(params.nextStatus, params.actorUserId, now))
    .where(eq(sessionAiNotes.id, params.session.id));
  await audit(executor, {
    sessionId: params.session.id,
    eventType: params.eventType,
    actorUserId: params.actorUserId,
    previousStatus: params.session.status,
    newStatus: params.nextStatus,
  });
  params.session.status = params.nextStatus;
}

/** Manual state transition entry point. Phase 1 exposes only cancellation. */
export async function transitionAiNotesSession(params: {
  sessionId: number;
  nextStatus: AiSessionNoteStatus;
  actorUserId: number;
}, liveKit: LiveKitSessionControl): Promise<void> {
  await db.transaction(async (tx) => {
    const session = await lockSession(tx, params.sessionId);
    if (!session) {
      throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
    }
    const booking = await getBookingParticipants(tx, session.booking_id);
    const admin = await actorIsAdmin(tx, params.actorUserId);
    const participant =
      !!booking &&
      (params.actorUserId === booking.clientUserId ||
        params.actorUserId === booking.coachUserId);
    if (!admin && !participant) {
      throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
    }
    const canCancel =
      admin ||
      (!!booking && params.actorUserId === booking.coachUserId);
    const consentDriven =
      params.nextStatus === 'active' ||
      params.nextStatus === 'consent_rejected';
    const allowed =
      (params.nextStatus === 'cancelled' && canCancel) ||
      (!consentDriven && params.nextStatus !== 'cancelled' && admin);
    if (!allowed) {
      throw new AiNotesDomainError(
        'FORBIDDEN',
        'Transizione non autorizzata.'
      );
    }
    await updateStatus(tx, {
      session,
      nextStatus: params.nextStatus,
      actorUserId: params.actorUserId,
      eventType:
        params.nextStatus === 'cancelled'
          ? 'session_cancelled'
          : 'status_transitioned',
    });
  });
  if (params.nextStatus === 'cancelled') {
    await stopAiNotesRecordings({
      sessionId: params.sessionId,
      actorUserId: params.actorUserId,
      reason: 'session_cancelled',
    }, liveKit);
    await cancelAiProcessingJobsForSession({
      sessionId: params.sessionId,
      actorUserId: params.actorUserId,
      reason: 'session_cancelled',
    });
  }
}

/** Updates only the authenticated actor's consent and reconciles state. */
export async function recordAiNotesConsent(params: {
  sessionId: number;
  actorUserId: number;
  decision: ConsentDecision;
  userAgent?: string | null;
}, liveKit: LiveKitSessionControl): Promise<void> {
  const effect = await db.transaction(async (tx) => {
    const session = await lockSession(tx, params.sessionId);
    if (!session) {
      throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
    }
    const booking = await getBookingParticipants(tx, session.booking_id);
    if (
      !booking ||
      (params.actorUserId !== booking.clientUserId &&
        params.actorUserId !== booking.coachUserId)
    ) {
      throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
    }
    const guardianAi = await canUseAiNotesForAthlete(
      booking.clientUserId,
      tx
    );
    if (!guardianAi.ok) {
      throw new AiNotesDomainError('FORBIDDEN', guardianAi.error);
    }

    const [consent] = await tx
      .select({
        id: sessionAiConsents.id,
        userId: sessionAiConsents.userId,
        status: sessionAiConsents.consentStatus,
      })
      .from(sessionAiConsents)
      .where(
        and(
          eq(sessionAiConsents.sessionAiNotesId, params.sessionId),
          eq(sessionAiConsents.userId, params.actorUserId)
        )
      )
      .limit(1);
    if (!consent) {
      throw new AiNotesDomainError('FORBIDDEN', 'Consenso non autorizzato.');
    }
    if (
      !canActorAnswerConsent({
        actorUserId: params.actorUserId,
        consentUserId: consent.userId,
        clientUserId: booking.clientUserId,
        coachUserId: booking.coachUserId,
      })
    ) {
      throw new AiNotesDomainError('FORBIDDEN', 'Consenso non autorizzato.');
    }
    if (
      isConsentDecisionIdempotent(
        consent.status as AiConsentStatus,
        params.decision
      )
    ) {
      return {
        start:
          params.decision === 'accepted' && session.status === 'active',
        stop:
          params.decision === 'rejected' ||
          params.decision === 'revoked',
      };
    }
    if (
      !canApplyConsentDecision(
        consent.status as AiConsentStatus,
        params.decision
      )
    ) {
      throw new AiNotesDomainError(
        'INVALID_CONSENT',
        'Decisione di consenso non valida.'
      );
    }
    if (
      session.status !== 'waiting_for_consent' &&
      !(session.status === 'active' && params.decision === 'revoked')
    ) {
      throw new AiNotesDomainError(
        'INVALID_TRANSITION',
        'La richiesta di consenso non è più attiva.'
      );
    }

    const now = new Date();
    await tx
      .update(sessionAiConsents)
      .set({
        consentStatus: params.decision,
        consentedAt:
          params.decision === 'accepted' ||
          params.decision === 'rejected'
            ? now
            : null,
        revokedAt: params.decision === 'revoked' ? now : null,
        // Full IP addresses are intentionally not collected.
        ipMetadata: { collected: false },
        userAgentMetadata: params.userAgent
          ? { userAgent: params.userAgent.slice(0, 256) }
          : {},
        updatedDate: now,
        updatedBy: params.actorUserId,
      })
      .where(eq(sessionAiConsents.id, consent.id));

    await audit(tx, {
      sessionId: session.id,
      eventType:
        params.decision === 'accepted'
          ? 'consent_accepted'
          : params.decision === 'rejected'
            ? 'consent_rejected'
            : 'consent_revoked',
      actorUserId: params.actorUserId,
      previousStatus: session.status,
    });

    const consents = await tx
      .select({ status: sessionAiConsents.consentStatus })
      .from(sessionAiConsents)
      .where(eq(sessionAiConsents.sessionAiNotesId, session.id));
    const nextStatus = nextStatusAfterConsent({
      sessionStatus: session.status,
      decision: params.decision,
      allConsentStatuses: consents.map(
        (row) => row.status as AiConsentStatus
      ),
    });
    if (nextStatus) {
      await updateStatus(tx, {
        session,
        nextStatus,
        actorUserId: params.actorUserId,
        eventType:
          nextStatus === 'active'
            ? 'session_activated'
            : nextStatus === 'cancelled'
              ? 'session_cancelled'
              : 'consent_rejected',
      });
    }
    return {
      start: nextStatus === 'active',
      stop:
        params.decision === 'rejected' ||
        params.decision === 'revoked',
    };
  });
  if (effect.stop) {
    await stopAiNotesRecordings({
      sessionId: params.sessionId,
      actorUserId: params.actorUserId,
      reason:
        params.decision === 'revoked'
          ? 'consent_revoked'
          : 'consent_rejected',
    }, liveKit);
    await cancelAiProcessingJobsForSession({
      sessionId: params.sessionId,
      actorUserId: params.actorUserId,
      reason:
        params.decision === 'revoked'
          ? 'consent_revoked'
          : 'consent_rejected',
    });
  } else if (effect.start) {
    await startAiNotesRecordingSystem({
      sessionId: params.sessionId,
      actorUserId: params.actorUserId,
    }, liveKit);
  }
}

export type AiNotesSessionView = {
  id: number;
  bookingId: number;
  status: AiSessionNoteStatus;
  requestedBy: number;
  viewerRole: 'coach' | 'athlete';
  canCancel: boolean;
  consents: Array<{
    participantRole: string;
    status: string;
    isCurrentUser: boolean;
  }>;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
};

async function sessionView(
  sessionId: number,
  actorUserId: number
): Promise<AiNotesSessionView | null> {
  const [row] = await db
    .select({
      id: sessionAiNotes.id,
      bookingId: sessionAiNotes.bookingId,
      requestedBy: sessionAiNotes.requestedBy,
      status: sessionAiNotes.status,
      createdAt: sessionAiNotes.createdDate,
      startedAt: sessionAiNotes.startedAt,
      endedAt: sessionAiNotes.endedAt,
      clientUserId: bookings.clientId,
      coachUserId: providerProfiles.userId,
    })
    .from(sessionAiNotes)
    .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .innerJoin(
      providerProfiles,
      eq(providerProfiles.id, bookings.providerId)
    )
    .where(
      and(
        eq(sessionAiNotes.id, sessionId),
        or(
          eq(bookings.clientId, actorUserId),
          eq(providerProfiles.userId, actorUserId)
        )
      )
    )
    .limit(1);
  if (!row) return null;

  const consents = await db
    .select({
      userId: sessionAiConsents.userId,
      participantRole: sessionAiConsents.participantRole,
      status: sessionAiConsents.consentStatus,
    })
    .from(sessionAiConsents)
    .where(eq(sessionAiConsents.sessionAiNotesId, row.id));

  return {
    id: row.id,
    bookingId: row.bookingId,
    status: row.status as AiSessionNoteStatus,
    requestedBy: row.requestedBy,
    viewerRole: actorUserId === row.coachUserId ? 'coach' : 'athlete',
    canCancel: actorUserId === row.coachUserId,
    consents: consents.map((consent) => ({
      participantRole: consent.participantRole,
      status: consent.status,
      isCurrentUser: consent.userId === actorUserId,
    })),
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

export async function getAiNotesSessionById(
  sessionId: number,
  actorUserId: number
): Promise<AiNotesSessionView | null> {
  return sessionView(sessionId, actorUserId);
}

export async function getAiNotesSessionForBooking(
  bookingId: number,
  actorUserId: number
): Promise<AiNotesSessionView | null> {
  const booking = await getBookingParticipants(db, bookingId);
  if (
    !booking ||
    (actorUserId !== booking.clientUserId &&
      actorUserId !== booking.coachUserId)
  ) {
    return null;
  }
  const [session] = await db
    .select({ id: sessionAiNotes.id })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.bookingId, bookingId))
    .orderBy(desc(sessionAiNotes.createdDate))
    .limit(1);
  return session ? sessionView(session.id, actorUserId) : null;
}
