import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  sessionAiAuditEvents,
  sessionAiNotes,
  sessionAiProcessingJobs,
  sessionAiReports,
  sessionAudioRecordings,
  sessionTranscriptSegments,
  users,
} from '@/lib/db/schema';
import { assessRecordingCoverage } from './recording-coverage';
import {
  buildOutcomeReport,
  outcomeSubject,
  type SessionOutcomeSnapshot,
} from './session-outcome-report';
import { sendSessionOutcomeEmail } from '@/lib/core/email';
import { claimDelivery, markDeliveryFailed, markDeliverySent } from '@/lib/core/email/deliveries';
import { logPipeline } from './pipeline-log';

/**
 * Il rapporto d'esito di ogni seduta, spedito a chi tiene su il sistema.
 *
 * Vive nel worker e non nella transizione di stato, per una ragione precisa:
 * una mail lenta, o un rifiuto di Resend, non devono poter far tornare
 * indietro il passaggio di stato di una seduta. Lo stato è il dato; la mail è
 * il racconto. Il worker gira ogni cinque minuti, quindi il racconto arriva
 * subito dopo il fatto, e sopravvive a un processo che muore nel mezzo.
 *
 * L'unicità è affidata a `notification_email_deliveries`, che ha già un
 * vincolo sulla chiave di idempotenza: due esecuzioni sovrapposte del worker
 * non producono due mail, e non serve una tabella nuova né una migrazione su
 * un database che è anche la produzione.
 */

/** A chi arriva. Una sola casella: è posta di servizio, non di prodotto. */
export const OUTCOME_RECIPIENT =
  process.env.AI_NOTES_OUTCOME_EMAIL?.trim() || 'bracco.ale@gmail.com';

/**
 * Gli stati che chiudono una seduta.
 *
 * `cancelled` c'è, ma solo per le sedute davvero iniziate: un pannello di
 * consenso aperto e richiuso ne produce una a vuoto, e l'appuntamento 167 ne
 * ha generate due nello stesso pomeriggio. Una mail su niente insegna solo a
 * ignorare le mail.
 */
const TERMINAL_STATUSES = [
  'ready_for_review',
  'approved',
  'shared',
  'report_failed',
  'transcription_failed',
  'consent_rejected',
  'cancelled',
];

function sessionSeconds(startedAt: Date | null, endedAt: Date | null): number {
  if (!startedAt || !endedAt) return 0;
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
}

async function loadSnapshot(
  sessionId: number
): Promise<SessionOutcomeSnapshot | null> {
  const [row] = await db
    .select({
      sessionId: sessionAiNotes.id,
      bookingId: sessionAiNotes.bookingId,
      status: sessionAiNotes.status,
      errorCode: sessionAiNotes.errorCode,
      startedAt: sessionAiNotes.startedAt,
      endedAt: sessionAiNotes.endedAt,
      processingCompletedAt: sessionAiNotes.processingCompletedAt,
      scheduledFor: bookings.scheduledFor,
      athleteUserId: bookings.clientId,
      coachName: users.name,
    })
    .from(sessionAiNotes)
    .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .leftJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
    .leftJoin(users, eq(users.id, providerProfiles.userId))
    .where(eq(sessionAiNotes.id, sessionId))
    .limit(1);
  if (!row) return null;

  const recordings = await db
    .select({
      id: sessionAudioRecordings.id,
      role: sessionAudioRecordings.participantRole,
      segment: sessionAudioRecordings.segmentOrder,
      status: sessionAudioRecordings.status,
      errorCode: sessionAudioRecordings.errorCode,
      errorMessage: sessionAudioRecordings.errorMessageSanitized,
      sizeBytes: sessionAudioRecordings.sizeBytes,
      durationSeconds: sessionAudioRecordings.durationSeconds,
    })
    .from(sessionAudioRecordings)
    .where(eq(sessionAudioRecordings.sessionAiNotesId, sessionId))
    .orderBy(asc(sessionAudioRecordings.id));

  const jobs = await db
    .select({
      id: sessionAiProcessingJobs.id,
      type: sessionAiProcessingJobs.jobType,
      status: sessionAiProcessingJobs.status,
      attempts: sessionAiProcessingJobs.attemptCount,
      errorCode: sessionAiProcessingJobs.errorCode,
      errorMessage: sessionAiProcessingJobs.errorMessageSanitized,
    })
    .from(sessionAiProcessingJobs)
    .where(eq(sessionAiProcessingJobs.sessionAiNotesId, sessionId))
    .orderBy(asc(sessionAiProcessingJobs.id));

  const audit = await db
    .select({
      at: sessionAiAuditEvents.createdDate,
      eventType: sessionAiAuditEvents.eventType,
      previousStatus: sessionAiAuditEvents.previousStatus,
      newStatus: sessionAiAuditEvents.newStatus,
      metadata: sql<string>`${sessionAiAuditEvents.eventMetadata}::text`,
    })
    .from(sessionAiAuditEvents)
    .where(eq(sessionAiAuditEvents.sessionAiNotesId, sessionId))
    .orderBy(asc(sessionAiAuditEvents.id));

  const [segments] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(sessionTranscriptSegments)
    .where(eq(sessionTranscriptSegments.sessionAiNotesId, sessionId));

  const [report] = await db
    .select({ id: sessionAiReports.id })
    .from(sessionAiReports)
    .where(eq(sessionAiReports.sessionAiNotesId, sessionId))
    .limit(1);

  const seconds = sessionSeconds(row.startedAt, row.endedAt);
  const coverage = assessRecordingCoverage({
    sessionSeconds: seconds,
    recorded: recordings
      .filter(
        (recording) =>
          recording.status === 'recorded' &&
          (recording.role === 'coach' || recording.role === 'athlete')
      )
      .map((recording) => ({
        role: recording.role as 'coach' | 'athlete',
        seconds: recording.durationSeconds ?? 0,
      })),
  });

  return {
    sessionId: row.sessionId,
    bookingId: row.bookingId,
    athleteUserId: row.athleteUserId,
    coachName: row.coachName ?? '—',
    status: row.status,
    errorCode: row.errorCode,
    scheduledFor: row.scheduledFor,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    processingCompletedAt: row.processingCompletedAt,
    sessionSeconds: seconds,
    coverage: coverage.participants,
    transcriptSegments: Number(segments?.total ?? 0),
    reportId: report?.id ?? null,
    recordings,
    jobs,
    audit,
  };
}

/**
 * Spedisce il rapporto per le sedute chiuse che non l'hanno ancora avuto.
 *
 * Isolata per costruzione: ogni seduta è indipendente dalle altre, e un
 * fallimento di invio non deve impedire il rapporto delle successive né
 * fermare la coda. È la stessa lezione della sessione che teneva ferma tutta
 * la lavorazione perché sollevava un'eccezione prima che qualcun altro
 * potesse essere servito.
 */
export async function sendPendingSessionOutcomes(params: {
  limit: number;
}): Promise<{ sent: number; skipped: number; failed: number }> {
  const result = { sent: 0, skipped: 0, failed: 0 };

  const candidates = await db
    .select({
      id: sessionAiNotes.id,
      status: sessionAiNotes.status,
      startedAt: sessionAiNotes.startedAt,
    })
    .from(sessionAiNotes)
    .where(
      and(
        inArray(sessionAiNotes.status, TERMINAL_STATUSES),
        // Solo sedute davvero iniziate: vedi TERMINAL_STATUSES.
        sql`${sessionAiNotes.startedAt} is not null or ${sessionAiNotes.status} = 'consent_rejected'`,
        /*
         * Solo le chiusure recenti.
         *
         * Senza questo, la prima esecuzione dopo il rilascio spedirebbe il
         * rapporto di ogni seduta mai esistita: decine di mail su fatti
         * vecchi settimane, che e' il modo piu' rapido di far spostare
         * l'indirizzo in una cartella che nessuno apre.
         */
        sql`${sessionAiNotes.updatedDate} > now() - interval '2 hours'`
      )
    )
    .orderBy(asc(sessionAiNotes.id))
    .limit(params.limit);

  for (const candidate of candidates) {
    /*
     * La chiave include lo stato, non solo la sessione: una seduta riaperta
     * a mano e portata a buon fine merita il suo rapporto, e non deve essere
     * silenziata da quello della volta in cui era fallita.
     */
    const idempotencyKey = `ai-notes-outcome:${candidate.id}:${candidate.status}`;
    const claim = await claimDelivery({
      idempotencyKey,
      recipientEmail: OUTCOME_RECIPIENT,
      recipientUserId: null,
      templateKey: 'ai_notes_session_outcome',
    });
    if (!claim) {
      result.skipped += 1;
      continue;
    }

    try {
      const snapshot = await loadSnapshot(candidate.id);
      if (!snapshot) {
        await markDeliveryFailed(claim.id, 'snapshot_not_found');
        result.failed += 1;
        continue;
      }

      const sent = await sendSessionOutcomeEmail({
        to: OUTCOME_RECIPIENT,
        subject: outcomeSubject(snapshot),
        report: buildOutcomeReport(snapshot),
      });

      if (sent.ok) {
        await markDeliverySent(claim.id, sent.messageId);
        result.sent += 1;
      } else {
        await markDeliveryFailed(
          claim.id,
          sent.skipped ? sent.reason : sent.error
        );
        result.failed += 1;
      }
    } catch (error) {
      await markDeliveryFailed(
        claim.id,
        error instanceof Error ? error.message.slice(0, 300) : 'unknown'
      );
      result.failed += 1;
      logPipeline({
        phase: 'queue_run',
        outcome: 'failed',
        sessionId: candidate.id,
        errorCode: 'OUTCOME_EMAIL_FAILED',
      });
    }
  }

  return result;
}
