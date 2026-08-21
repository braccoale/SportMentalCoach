import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  sessionAiCommitments,
  sessionAiNotes,
  sessionAiReports,
  users,
} from '@/lib/db/schema';
import { SESSION_COMPASS_REPORT_KIND } from './session-compass-contract';
import type { SessionCompassReport } from './session-compass-contract';
import type {
  CommitmentOwner,
  TrackedCommitment,
  TrackedCommitmentStatus,
} from './session-commitments';
import { hasRole } from '@/lib/core/auth/roles';
import { FEATURE_CODES, hasFeatureEntitlement } from '@/lib/core/features';
import { JOURNEY_REPORT_STATUSES, isJourneyCompassReport } from './mental-journey';
import type {
  ApprovedSessionRecord,
  MentalJourneyDependencies,
  MentalJourneyStore,
} from './mental-journey';

/**
 * Adapter read-only della Mental Journey.
 *
 * Legge i report `approved` e `ready_for_review`: una seduta si è svolta a
 * prescindere da chi ha premuto approva, e nasconderla finché non è validata
 * racconterebbe al coach un percorso più corto di quello reale. Ogni riga
 * porta con sé `isApproved`, e il dominio tiene le bozze fuori da tutti i
 * conteggi che dichiarano di parlare di materiale validato.
 *
 * Restano fuori: report falliti, bozze non ancora pronte, e qualunque altro
 * stato. La cronistoria non è un cestino.
 */
export function createMentalJourneyStore(): MentalJourneyStore {
  return {
    async coachHasRelationship({ coachUserId, athleteUserId }) {
      const [row] = await db
        .select({ id: bookings.id })
        .from(bookings)
        .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
        .where(
          and(
            eq(bookings.clientId, athleteUserId),
            eq(providerProfiles.userId, coachUserId)
          )
        )
        .limit(1);
      return row !== undefined;
    },

    async loadApprovedSessions({ athleteUserId, coachUserId }) {
      const rows = await db
        .select({
          sessionId: sessionAiNotes.id,
          bookingId: bookings.id,
          reportId: sessionAiReports.id,
          reportVersion: sessionAiReports.reportVersion,
          status: sessionAiReports.status,
          reportKind: sessionAiReports.reportKind,
          approvedAt: sessionAiReports.approvedAt,
          updatedDate: sessionAiReports.updatedDate,
          sessionDate: bookings.scheduledFor,
          coachUserId: providerProfiles.userId,
          coachFirstName: users.name,
          coachLastName: users.lastName,
          generated: sessionAiReports.generatedReportJson,
          edited: sessionAiReports.coachEditedReportJson,
        })
        .from(sessionAiReports)
        .innerJoin(sessionAiNotes, eq(sessionAiNotes.id, sessionAiReports.sessionAiNotesId))
        .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
        .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
        .innerJoin(users, eq(users.id, providerProfiles.userId))
        .where(
          and(
            inArray(sessionAiReports.status, [...JOURNEY_REPORT_STATUSES]),
            eq(sessionAiReports.reportKind, SESSION_COMPASS_REPORT_KIND),
            eq(bookings.clientId, athleteUserId),
            ...(coachUserId === null ? [] : [eq(providerProfiles.userId, coachUserId)])
          )
        );

      return rows.flatMap((row): ApprovedSessionRecord[] => {
        const document = (row.edited ?? row.generated) as SessionCompassReport | null;
        // Seconda barriera oltre alla clausola SQL: la stessa regola pura.
        if (document === null || !isJourneyCompassReport({ ...row, document })) return [];
        return [
          {
            isApproved: row.status === 'approved',
            sessionId: row.sessionId,
            bookingId: row.bookingId,
            reportId: row.reportId,
            reportVersion: row.reportVersion,
            approvedAt: row.approvedAt ?? row.updatedDate,
            sessionDate: row.sessionDate,
            coachUserId: row.coachUserId,
            coachName:
              [row.coachFirstName, row.coachLastName].filter(Boolean).join(' ').trim() || 'Coach',
            document,
          },
        ];
      });
    },

    async loadCommitments({ athleteUserId, coachUserId }) {
      const rows = await db
        .select()
        .from(sessionAiCommitments)
        .where(
          and(
            eq(sessionAiCommitments.athleteUserId, athleteUserId),
            ...(coachUserId === null
              ? []
              : [eq(sessionAiCommitments.coachUserId, coachUserId)])
          )
        );
      return rows.map(
        (row): TrackedCommitment => ({
          id: row.id,
          sessionId: row.sessionAiNotesId,
          sourceReportId: row.sourceReportId,
          sourceReportVersion: row.sourceReportVersion,
          athleteUserId: row.athleteUserId,
          coachUserId: row.coachUserId,
          commitmentKey: row.commitmentKey,
          title: row.title,
          owner: row.owner as CommitmentOwner,
          status: row.status as TrackedCommitmentStatus,
          dueDate: row.dueDate,
          completedAt: row.completedAt,
          athleteNote: row.athleteNote,
          sourceTranscriptSegmentId: row.sourceTranscriptSegmentId,
          sourceTimestampMs: row.sourceTimestampMs,
          sourceExcerpt: row.sourceExcerpt,
          manuallyEdited: row.manuallyEdited,
          archivedAt: row.archivedAt,
        })
      );
    },
  };
}

/** Composizione di produzione. I test compongono le proprie dipendenze. */
export function mentalJourneyDependencies(): MentalJourneyDependencies {
  return {
    store: createMentalJourneyStore(),
    isAdmin: (actorUserId: number) => hasRole(actorUserId, 'admin'),
    hasFeatureAccess: (actorUserId: number) =>
      hasFeatureEntitlement(actorUserId, FEATURE_CODES.AI_SESSION_NOTES),
    now: () => new Date(),
  };
}
