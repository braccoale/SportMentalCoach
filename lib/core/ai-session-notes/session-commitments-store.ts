import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  sessionAiAuditEvents,
  sessionAiCommitments,
  sessionAiNotes,
  users,
} from '@/lib/db/schema';
import type {
  AthleteCommitmentSource,
  CommitmentOwner,
  CommitmentSyncPlan,
  SessionCommitmentStore,
  TrackedCommitment,
  TrackedCommitmentChanges,
  TrackedCommitmentStatus,
} from './session-commitments';

/**
 * Adapter Drizzle degli impegni. Le regole di sincronizzazione e le
 * autorizzazioni restano nel modulo puro: qui si legge e si scrive soltanto.
 */
export function createSessionCommitmentStore(): SessionCommitmentStore {
  return {
    async listBySession(sessionId) {
      const rows = await db
        .select()
        .from(sessionAiCommitments)
        .where(eq(sessionAiCommitments.sessionAiNotesId, sessionId))
        .orderBy(asc(sessionAiCommitments.id));
      return rows.map(tracked);
    },

    async listForAthlete(athleteUserId) {
      const rows = await db
        .select({
          commitment: sessionAiCommitments,
          bookingId: bookings.id,
          sessionDate: bookings.scheduledFor,
          coachFirstName: users.name,
          coachLastName: users.lastName,
        })
        .from(sessionAiCommitments)
        .innerJoin(sessionAiNotes, eq(sessionAiNotes.id, sessionAiCommitments.sessionAiNotesId))
        .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
        .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
        .innerJoin(users, eq(users.id, providerProfiles.userId))
        .where(
          and(
            eq(sessionAiCommitments.athleteUserId, athleteUserId),
            eq(sessionAiCommitments.owner, 'athlete')
          )
        );
      return rows.map(
        (row): AthleteCommitmentSource => ({
          ...tracked(row.commitment),
          bookingId: row.bookingId,
          sessionDate: row.sessionDate,
          coachName:
            [row.coachFirstName, row.coachLastName].filter(Boolean).join(' ').trim() || 'Coach',
        })
      );
    },

    async loadById(commitmentId) {
      const [row] = await db
        .select()
        .from(sessionAiCommitments)
        .where(eq(sessionAiCommitments.id, commitmentId))
        .limit(1);
      return row ? tracked(row) : null;
    },

    async applySync(plan: CommitmentSyncPlan, actorUserId: number) {
      await db.transaction(async (tx) => {
        if (plan.inserts.length) {
          await tx
            .insert(sessionAiCommitments)
            .values(
              plan.inserts.map((input) => ({
                sessionAiNotesId: input.sessionId,
                sourceReportId: input.sourceReportId,
                sourceReportVersion: input.sourceReportVersion,
                athleteUserId: input.athleteUserId,
                coachUserId: input.coachUserId,
                commitmentKey: input.commitmentKey,
                title: input.title,
                owner: input.owner,
                status: input.status,
                dueDate: input.dueDate,
                completedAt: input.completedAt,
                sourceTranscriptSegmentId: input.sourceTranscriptSegmentId,
                sourceTimestampMs: input.sourceTimestampMs,
                sourceExcerpt: input.sourceExcerpt,
                createdBy: actorUserId,
                updatedBy: actorUserId,
              }))
            )
            // Una seconda approvazione concorrente non deve duplicare nulla.
            .onConflictDoNothing({
              target: [
                sessionAiCommitments.sessionAiNotesId,
                sessionAiCommitments.commitmentKey,
              ],
            });
        }
        for (const update of plan.updates) {
          await tx
            .update(sessionAiCommitments)
            .set({ ...columnsFor(update.changes), updatedBy: actorUserId })
            .where(eq(sessionAiCommitments.id, update.id));
        }
        if (plan.archives.length) {
          await tx
            .update(sessionAiCommitments)
            .set({ archivedAt: new Date(), updatedBy: actorUserId })
            .where(inArray(sessionAiCommitments.id, plan.archives));
        }
      });
    },

    async update(commitmentId, changes, actorUserId) {
      const [row] = await db
        .update(sessionAiCommitments)
        .set({ ...columnsFor(changes), updatedBy: actorUserId })
        .where(eq(sessionAiCommitments.id, commitmentId))
        .returning();
      return tracked(row);
    },

    async recordAudit(params) {
      await db.insert(sessionAiAuditEvents).values({
        sessionAiNotesId: params.sessionId,
        eventType: params.eventType,
        actorUserId: params.actorUserId,
        eventMetadata: params.metadata,
        createdBy: params.actorUserId,
        updatedBy: params.actorUserId,
      });
    },
  };
}

function columnsFor(changes: TrackedCommitmentChanges) {
  return {
    ...(changes.sourceReportId === undefined ? {} : { sourceReportId: changes.sourceReportId }),
    ...(changes.sourceReportVersion === undefined
      ? {}
      : { sourceReportVersion: changes.sourceReportVersion }),
    ...(changes.title === undefined ? {} : { title: changes.title }),
    ...(changes.owner === undefined ? {} : { owner: changes.owner }),
    ...(changes.status === undefined ? {} : { status: changes.status }),
    ...(changes.dueDate === undefined ? {} : { dueDate: changes.dueDate }),
    ...(changes.completedAt === undefined ? {} : { completedAt: changes.completedAt }),
    ...(changes.athleteNote === undefined ? {} : { athleteNote: changes.athleteNote }),
    ...(changes.sourceTranscriptSegmentId === undefined
      ? {}
      : { sourceTranscriptSegmentId: changes.sourceTranscriptSegmentId }),
    ...(changes.sourceTimestampMs === undefined
      ? {}
      : { sourceTimestampMs: changes.sourceTimestampMs }),
    ...(changes.sourceExcerpt === undefined ? {} : { sourceExcerpt: changes.sourceExcerpt }),
    ...(changes.manuallyEdited === undefined ? {} : { manuallyEdited: changes.manuallyEdited }),
    ...(changes.archivedAt === undefined ? {} : { archivedAt: changes.archivedAt }),
    updatedDate: new Date(),
  };
}

function tracked(row: typeof sessionAiCommitments.$inferSelect): TrackedCommitment {
  return {
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
  };
}
