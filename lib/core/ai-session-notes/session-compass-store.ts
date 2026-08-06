import 'server-only';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  clientProfiles,
  providerProfiles,
  profiles,
  sessionAiAuditEvents,
  sessionAiNotes,
  sessionAiReports,
  sessionTranscriptTimelineSegments,
  users,
} from '@/lib/db/schema';
import { SESSION_COMPASS_REPORT_KIND } from './session-compass-contract';
import type { SessionCompassReport } from './session-compass-contract';
import type { SessionCompassPreviousReport } from './session-compass-provider';
import {
  type InsertSessionCompassReport,
  type SessionCompassStatus,
  type SessionCompassStore,
  type StoredSessionCompassReport,
  type UpdateSessionCompassReport,
} from './session-compass';

/**
 * Adapter Drizzle del `SessionCompassStore`. Tutte le regole di dominio
 * restano nel modulo puro: qui si legge e si scrive, senza decidere nulla.
 */
export function createSessionCompassStore(): SessionCompassStore {
  return {
    async loadSession(sessionId) {
      const [row] = await db
        .select({
          sessionId: sessionAiNotes.id,
          sessionStatus: sessionAiNotes.status,
          coachUserId: providerProfiles.userId,
          coachHeadline: providerProfiles.headline,
          coachFirstName: users.name,
          coachLastName: users.lastName,
          coachLocale: profiles.locale,
          athleteUserId: bookings.clientId,
        })
        .from(sessionAiNotes)
        .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
        .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
        .innerJoin(users, eq(users.id, providerProfiles.userId))
        .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
        .where(eq(sessionAiNotes.id, sessionId))
        .limit(1);
      if (!row) return null;

      const [athlete] = await db
        .select({ sport: clientProfiles.category, goals: clientProfiles.goals })
        .from(clientProfiles)
        .where(eq(clientProfiles.userId, row.athleteUserId))
        .limit(1);

      return {
        sessionId: row.sessionId,
        coachUserId: row.coachUserId,
        athleteUserId: row.athleteUserId,
        sessionStatus: row.sessionStatus,
        // La sessione non ha ancora una lingua propria: usa la preferenza del
        // coach e ricade sull'italiano, lingua dell'interfaccia KaiPai.
        language: compassLanguage(row.coachLocale),
        coachName: [row.coachFirstName, row.coachLastName].filter(Boolean).join(' ').trim() || 'Coach',
        coachRole: row.coachHeadline?.trim() || 'Mental coach sportivo',
        athleteSport: athlete?.sport?.trim() || null,
        pathGoal: athlete?.goals?.trim() || null,
      };
    },

    async loadTimeline(sessionId) {
      const rows = await db
        .select({
          transcriptSegmentId: sessionTranscriptTimelineSegments.sourceTranscriptSegmentId,
          startMs: sessionTranscriptTimelineSegments.startMs,
          endMs: sessionTranscriptTimelineSegments.endMs,
          speaker: sessionTranscriptTimelineSegments.participantRole,
          text: sessionTranscriptTimelineSegments.normalizedText,
        })
        .from(sessionTranscriptTimelineSegments)
        .where(eq(sessionTranscriptTimelineSegments.sessionAiNotesId, sessionId))
        .orderBy(asc(sessionTranscriptTimelineSegments.globalSequence));
      return rows.flatMap((row) =>
        row.speaker === 'coach' || row.speaker === 'athlete'
          ? [{ ...row, speaker: row.speaker }]
          : []
      );
    },

    async loadLatestReport(sessionId) {
      const [row] = await db
        .select()
        .from(sessionAiReports)
        .where(
          and(
            eq(sessionAiReports.sessionAiNotesId, sessionId),
            eq(sessionAiReports.reportKind, SESSION_COMPASS_REPORT_KIND)
          )
        )
        .orderBy(desc(sessionAiReports.reportVersion))
        .limit(1);
      return row ? storedReport(row) : null;
    },

    async loadPreviousApprovedReports(params) {
      const rows = await db
        .select({
          reportVersion: sessionAiReports.reportVersion,
          approvedAt: sessionAiReports.approvedAt,
          generated: sessionAiReports.generatedReportJson,
          edited: sessionAiReports.coachEditedReportJson,
        })
        .from(sessionAiReports)
        .innerJoin(sessionAiNotes, eq(sessionAiNotes.id, sessionAiReports.sessionAiNotesId))
        .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
        .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
        .where(
          and(
            eq(sessionAiReports.reportKind, SESSION_COMPASS_REPORT_KIND),
            eq(sessionAiReports.status, 'approved'),
            eq(providerProfiles.userId, params.coachUserId),
            eq(bookings.clientId, params.athleteUserId),
            ne(sessionAiReports.sessionAiNotesId, params.excludeSessionId)
          )
        )
        .orderBy(desc(sessionAiReports.approvedAt))
        .limit(Math.max(0, Math.min(params.limit, 2)));

      return rows.flatMap((row) => {
        const document = (row.edited ?? row.generated) as SessionCompassReport | null;
        if (!document) return [];
        return [summaryOf(document, row.reportVersion, row.approvedAt)];
      });
    },

    async insertReport(input: InsertSessionCompassReport) {
      const [row] = await db
        .insert(sessionAiReports)
        .values({
          sessionAiNotesId: input.sessionId,
          reportKind: SESSION_COMPASS_REPORT_KIND,
          reportVersion: input.reportVersion,
          status: input.status,
          sourceFingerprint: input.sourceFingerprint,
          promptVersion: input.promptVersion,
          generatedByProvider: input.generatedReport?.generation.provider ?? null,
          generatedByModel: input.generatedReport?.generation.model ?? null,
          generatedReportJson: asJson(input.generatedReport),
          coachEditedReportJson: asJson(input.coachEditedReport),
          privateCoachNotes: input.coachNote,
          createdBy: input.actorUserId,
          updatedBy: input.actorUserId,
        })
        .returning();
      return storedReport(row);
    },

    async updateReport(input: UpdateSessionCompassReport) {
      const [row] = await db
        .update(sessionAiReports)
        .set({
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.sourceFingerprint === undefined
            ? {}
            : { sourceFingerprint: input.sourceFingerprint }),
          ...(input.promptVersion === undefined ? {} : { promptVersion: input.promptVersion }),
          ...(input.generatedReport === undefined
            ? {}
            : {
                generatedReportJson: asJson(input.generatedReport),
                generatedByProvider: input.generatedReport?.generation.provider ?? null,
                generatedByModel: input.generatedReport?.generation.model ?? null,
              }),
          ...(input.coachEditedReport === undefined
            ? {}
            : { coachEditedReportJson: asJson(input.coachEditedReport) }),
          ...(input.coachNote === undefined ? {} : { privateCoachNotes: input.coachNote }),
          ...(input.approvedBy === undefined ? {} : { approvedBy: input.approvedBy }),
          ...(input.approvedAt === undefined ? {} : { approvedAt: input.approvedAt }),
          ...(input.errorCode === undefined
            ? {}
            : { metadata: input.errorCode ? { errorCode: input.errorCode } : {} }),
          updatedDate: new Date(),
          updatedBy: input.actorUserId,
        })
        .where(eq(sessionAiReports.id, input.reportId))
        .returning();
      return storedReport(row);
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

function compassLanguage(locale: string | null): string {
  const language = locale?.trim().toLocaleLowerCase() ?? '';
  if (language.startsWith('en')) return 'en';
  if (language.startsWith('es')) return 'es';
  if (language.startsWith('fr')) return 'fr';
  return 'it';
}

/** Estratto minimo del report approvato: nessuno storico grezzo di sessione. */
function summaryOf(
  document: SessionCompassReport,
  reportVersion: number,
  approvedAt: Date | null
): SessionCompassPreviousReport {
  return {
    version: reportVersion,
    approvedAt: (approvedAt ?? new Date(0)).toISOString(),
    summary: document.sessionOverview.summary,
    themes: document.sessionOverview.themes.map((theme) => theme.text),
    openCommitments: document.commitments
      .filter((commitment) => commitment.status !== 'done' && commitment.status !== 'dropped')
      .map((commitment) => ({
        text: commitment.text,
        owner: commitment.owner,
        status: commitment.status,
      })),
  };
}

function storedReport(
  row: typeof sessionAiReports.$inferSelect
): StoredSessionCompassReport {
  return {
    id: row.id,
    sessionId: row.sessionAiNotesId,
    reportKind: row.reportKind,
    reportVersion: row.reportVersion,
    status: row.status as SessionCompassStatus,
    sourceFingerprint: row.sourceFingerprint,
    promptVersion: row.promptVersion,
    generatedReport: (row.generatedReportJson ?? null) as SessionCompassReport | null,
    coachEditedReport: (row.coachEditedReportJson ?? null) as SessionCompassReport | null,
    coachNote: row.privateCoachNotes,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    errorCode:
      typeof row.metadata?.errorCode === 'string' ? row.metadata.errorCode : null,
    updatedDate: row.updatedDate,
  };
}

function asJson(
  report: SessionCompassReport | null | undefined
): Record<string, unknown> | null {
  return report ? (report as unknown as Record<string, unknown>) : null;
}
