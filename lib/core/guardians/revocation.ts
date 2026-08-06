import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  athleteGuardians,
  bookings,
  guardianAuthorizationEvents,
  guardianInvitations,
  providerProfiles,
  sessionAiAuditEvents,
  sessionAiConsents,
  sessionAiNotes,
  users,
  type AiSessionNoteStatus,
} from '@/lib/db/schema';
import { sendNotificationEmail } from '@/lib/core/email';
import { notify } from '@/lib/core/notifications';
import { cancelAiProcessingJobsForSession } from '@/lib/core/ai-session-notes/processing';
import { stopAiNotesRecordings } from '@/lib/core/ai-session-notes/recording';
import type { LiveKitSessionControl } from '@/lib/core/ai-session-notes/livekit-session-control';
import type { Result } from '@/lib/core/result';
import { normalizeSignatureName, signatureMatchesInvite } from './policy';
import { hashGuardianToken } from './tokens';

const REVOCABLE_AI_STATUSES: AiSessionNoteStatus[] = [
  'waiting_for_consent',
  'active',
  'processing',
  'ready_for_review',
  'approved',
];

export type GuardianManagementView = {
  athleteName: string;
  guardianName: string;
  status: 'confirmed' | 'revoked';
  aiRecordingAuthorized: boolean;
  confirmedAt: Date;
  revokedAt: Date | null;
};

export async function getGuardianManagementByToken(
  token: string
): Promise<GuardianManagementView | null> {
  if (!token || token.length > 256) return null;
  const [row] = await db
    .select({
      guardianName: athleteGuardians.guardianName,
      status: athleteGuardians.status,
      confirmedAt: athleteGuardians.confirmedAt,
      revokedAt: athleteGuardians.revokedAt,
      aiRecordingAuthorized: athleteGuardians.aiRecordingAuthorized,
      athleteName: users.name,
      athleteLastName: users.lastName,
      athleteEmail: users.email,
    })
    .from(athleteGuardians)
    .innerJoin(users, eq(users.id, athleteGuardians.athleteUserId))
    .where(
      eq(athleteGuardians.managementTokenHash, hashGuardianToken(token))
    )
    .limit(1);
  if (!row?.confirmedAt || (row.status !== 'confirmed' && row.status !== 'revoked')) {
    return null;
  }
  return {
    athleteName:
      [row.athleteName, row.athleteLastName].filter(Boolean).join(' ').trim() ||
      row.athleteEmail,
    guardianName: row.guardianName,
    status: row.status,
    aiRecordingAuthorized: row.aiRecordingAuthorized,
    confirmedAt: row.confirmedAt,
    revokedAt: row.revokedAt,
  };
}

export async function revokeGuardianAuthorization(
  params: {
    token: string;
    signatureName: string;
    reason?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
  liveKit?: LiveKitSessionControl | null
): Promise<Result<{ athleteName: string; alreadyRevoked: boolean }>> {
  if (!params.token || params.token.length > 256) {
    return { ok: false, error: 'Collegamento non valido.' };
  }
  const signatureName = normalizeSignatureName(params.signatureName);
  const tokenHash = hashGuardianToken(params.token);
  const ip = params.ip?.slice(0, 64) ?? null;
  const userAgent = params.userAgent?.slice(0, 1000) ?? null;
  const reason = params.reason?.trim().slice(0, 500) || 'Revoca del tutore';
  const now = new Date();

  const outcome = await db.transaction(async (tx) => {
    const locked = await tx.execute(sql`
      SELECT
        g.id,
        g.athlete_user_id,
        g.guardian_name,
        g.guardian_email,
        g.signature_name,
        g.status,
        g.confirmed_at,
        g.revoked_at,
        g.active_acceptance_id,
        u.name AS athlete_first_name,
        u.last_name AS athlete_last_name,
        u.email AS athlete_email
      FROM athlete_guardians g
      JOIN users u ON u.id = g.athlete_user_id
      WHERE g.management_token_hash = ${tokenHash}
      FOR UPDATE OF g
    `);
    const guardian = (locked as unknown as Array<{
      id: number;
      athlete_user_id: number;
      guardian_name: string;
      guardian_email: string;
      signature_name: string | null;
      status: string;
      confirmed_at: Date | null;
      revoked_at: Date | null;
      active_acceptance_id: number | null;
      athlete_first_name: string | null;
      athlete_last_name: string | null;
      athlete_email: string;
    }>)[0];

    if (!guardian?.confirmed_at || !guardian.signature_name) {
      return { error: 'Collegamento non valido.' } as const;
    }
    if (!signatureMatchesInvite(signatureName, guardian.signature_name)) {
      return {
        error: 'Il nome digitato non coincide con la firma dell’autorizzazione.',
      } as const;
    }
    const athleteName = [
      guardian.athlete_first_name,
      guardian.athlete_last_name,
    ]
      .filter(Boolean)
      .join(' ')
      .trim() || guardian.athlete_email;
    if (guardian.status === 'revoked' || guardian.revoked_at) {
      return {
        athleteName,
        guardianEmail: guardian.guardian_email,
        alreadyRevoked: true,
        bookingRecipients: [],
        aiSessionIds: [],
        bookingIds: [],
      } as const;
    }
    if (guardian.status !== 'confirmed' || !guardian.active_acceptance_id) {
      return { error: 'Non esiste un’autorizzazione attiva.' } as const;
    }

    const bookingRecipients = await tx
      .select({
        bookingId: bookings.id,
        coachUserId: providerProfiles.userId,
      })
      .from(bookings)
      .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
      .where(
        and(
          eq(bookings.clientId, guardian.athlete_user_id),
          inArray(bookings.status, ['requested', 'accepted'])
        )
      );
    const bookingIds = bookingRecipients.map((row) => row.bookingId);

    const aiSessions = await tx
      .select({ id: sessionAiNotes.id, status: sessionAiNotes.status })
      .from(sessionAiNotes)
      .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
      .where(
        and(
          eq(bookings.clientId, guardian.athlete_user_id),
          inArray(sessionAiNotes.status, REVOCABLE_AI_STATUSES)
        )
      );
    const aiSessionIds = aiSessions.map((row) => row.id);

    const [event] = await tx
      .insert(guardianAuthorizationEvents)
      .values({
        athleteUserId: guardian.athlete_user_id,
        athleteGuardianId: guardian.id,
        acceptanceId: guardian.active_acceptance_id,
        eventType: 'authorization_revoked',
        actorType: 'guardian',
        reason,
        ipAddress: ip,
        userAgent,
        eventMetadata: {
          cancelledBookingIds: bookingIds,
          cancelledAiSessionIds: aiSessionIds,
        },
      })
      .returning({ id: guardianAuthorizationEvents.id });

    await tx
      .update(athleteGuardians)
      .set({
        status: 'revoked',
        revokedAt: now,
        revokedReason: reason,
        aiRecordingAuthorized: false,
        updatedAt: now,
      })
      .where(eq(athleteGuardians.id, guardian.id));
    await tx
      .update(guardianInvitations)
      .set({ invalidatedAt: now })
      .where(
        and(
          eq(guardianInvitations.athleteGuardianId, guardian.id),
          isNull(guardianInvitations.consumedAt),
          isNull(guardianInvitations.invalidatedAt)
        )
      );

    if (bookingIds.length) {
      await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          updatedAt: now,
          updatedBy: guardian.athlete_user_id,
        })
        .where(inArray(bookings.id, bookingIds));
    }
    if (aiSessionIds.length) {
      await tx
        .update(sessionAiConsents)
        .set({
          consentStatus: 'revoked',
          revokedAt: now,
          updatedDate: now,
          updatedBy: guardian.athlete_user_id,
          userAgentMetadata: {
            source: 'guardian_authorization_revoked',
            guardianAuthorizationEventId: event.id,
          },
        })
        .where(
          and(
            inArray(sessionAiConsents.sessionAiNotesId, aiSessionIds),
            eq(sessionAiConsents.userId, guardian.athlete_user_id),
            inArray(sessionAiConsents.consentStatus, ['pending', 'accepted'])
          )
        );
      for (const session of aiSessions) {
        await tx.insert(sessionAiAuditEvents).values({
          sessionAiNotesId: session.id,
          eventType: 'consent_revoked',
          actorUserId: null,
          previousStatus: session.status,
          newStatus: 'cancelled',
          eventMetadata: {
            source: 'guardian_authorization_revoked',
            guardianAuthorizationEventId: event.id,
          },
          createdBy: null,
          updatedBy: null,
        });
      }
      await tx
        .update(sessionAiNotes)
        .set({
          status: 'cancelled',
          endedAt: now,
          updatedDate: now,
          updatedBy: guardian.athlete_user_id,
        })
        .where(inArray(sessionAiNotes.id, aiSessionIds));
    }

    return {
      athleteName,
      guardianEmail: guardian.guardian_email,
      athleteUserId: guardian.athlete_user_id,
      alreadyRevoked: false,
      bookingRecipients,
      bookingIds,
      aiSessionIds,
    } as const;
  });

  if ('error' in outcome && typeof outcome.error === 'string') {
    return { ok: false, error: outcome.error };
  }
  if (!outcome.alreadyRevoked) {
    for (const sessionId of outcome.aiSessionIds) {
      await cancelAiProcessingJobsForSession({
        sessionId,
        actorUserId: outcome.athleteUserId,
        reason: 'guardian_authorization_revoked',
      }).catch((error) =>
        console.error('[guardians] failed to cancel AI processing:', error)
      );
      if (liveKit) {
        await stopAiNotesRecordings(
          {
            sessionId,
            actorUserId: outcome.athleteUserId,
            reason: 'guardian_authorization_revoked',
          },
          liveKit
        ).catch((error) =>
          console.error('[guardians] failed to stop AI recording:', error)
        );
      }
    }
    if (liveKit) {
      for (const bookingId of outcome.bookingIds) {
        await liveKit.closeRoom(`booking-${bookingId}`).catch((error) =>
          console.error('[guardians] failed to close LiveKit room:', error)
        );
      }
    }
    for (const booking of outcome.bookingRecipients) {
      await notify('booking_cancelled', booking.coachUserId, {
        bookingId: booking.bookingId,
        actorUserId: outcome.athleteUserId,
        idempotencyScope: `guardian-revocation:${booking.bookingId}`,
      });
    }
    await sendNotificationEmail({
      to: outcome.guardianEmail,
      title: `Autorizzazione revocata per ${outcome.athleteName}`,
      body:
        'La revoca è stata registrata. Le sessioni non concluse sono state annullate, le chat collegate sono ora di sola lettura e registrazioni o elaborazioni AI ancora in corso sono state interrotte. Per una nuova autorizzazione il giovane atleta dovrà inviare un nuovo invito.',
    });
  }

  return {
    ok: true,
    athleteName: outcome.athleteName,
    alreadyRevoked: outcome.alreadyRevoked,
  };
}
