import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  sessionAiNotes,
  sessionAudioRecordings,
  sessionTranscriptSegments,
  sessionTranscriptionRequests,
} from '@/lib/db/schema';
import {
  buildSessionCoverage,
  type CoverageCloseReason,
  type CoverageSegmentInput,
  type CoverageTranscriptionState,
  type SessionCoverage,
} from './session-coverage';

const CLOSE_REASONS: CoverageCloseReason[] = [
  'coach_closed',
  'room_finished',
  'closed_by_timeout',
];

function closeReasonOf(metadata: unknown): CoverageCloseReason {
  const value = (metadata as { closeReason?: unknown } | null)?.closeReason;
  return typeof value === 'string' &&
    (CLOSE_REASONS as string[]).includes(value)
    ? (value as CoverageCloseReason)
    : 'unknown';
}

function stopReasonOf(metadata: unknown): string | null {
  const value = (metadata as { stopReason?: unknown } | null)?.stopReason;
  return typeof value === 'string' ? value : null;
}

/**
 * Carica la copertura di una sessione.
 *
 * Una query per tabella, non una per segmento: questa lettura avviene a ogni
 * apertura del riepilogo e non deve costare N interrogazioni.
 */
export async function loadSessionCoverage(
  sessionId: number,
  executor: DbOrTx = db
): Promise<SessionCoverage | null> {
  const [session] = await executor
    .select({
      id: sessionAiNotes.id,
      startedAt: sessionAiNotes.startedAt,
      endedAt: sessionAiNotes.endedAt,
      metadata: sessionAiNotes.metadata,
    })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.id, sessionId))
    .limit(1);
  if (!session) return null;

  const recordings = await executor
    .select({
      id: sessionAudioRecordings.id,
      participantRole: sessionAudioRecordings.participantRole,
      startedAt: sessionAudioRecordings.startedAt,
      endedAt: sessionAudioRecordings.endedAt,
      status: sessionAudioRecordings.status,
      errorCode: sessionAudioRecordings.errorCode,
      metadata: sessionAudioRecordings.metadata,
    })
    .from(sessionAudioRecordings)
    .where(eq(sessionAudioRecordings.sessionAiNotesId, sessionId));

  // Senza alcuna riga di registrazione la copertura non è misurabile, e non
  // va inventata: sessioni più vecchie del modello a segmenti, o con l'audio
  // già passato per la retention, hanno una trascrizione completa e nessuna
  // riga. Dichiararle «non registrate» sarebbe un allarme falso proprio su
  // una sessione andata bene — l'opposto di ciò che questa card esiste per
  // fare. Chi chiama non mostra nulla.
  if (recordings.length === 0) return null;

  const recordingIds = recordings.map((row) => row.id);

  const transcribed = recordingIds.length
    ? await executor
        .select({
          physicalRecordingId: sessionTranscriptSegments.physicalRecordingId,
        })
        .from(sessionTranscriptSegments)
        .where(
          inArray(sessionTranscriptSegments.physicalRecordingId, recordingIds)
        )
    : [];

  const requests = recordingIds.length
    ? await executor
        .select({
          physicalRecordingId: sessionTranscriptionRequests.physicalRecordingId,
          status: sessionTranscriptionRequests.status,
        })
        .from(sessionTranscriptionRequests)
        .where(
          inArray(
            sessionTranscriptionRequests.physicalRecordingId,
            recordingIds
          )
        )
    : [];

  const transcribedIds = new Set(
    transcribed
      .map((row) => row.physicalRecordingId)
      .filter((value): value is number => typeof value === 'number')
  );

  function transcriptionStateOf(
    recordingId: number
  ): CoverageTranscriptionState {
    if (transcribedIds.has(recordingId)) return 'done';
    const own = requests.filter(
      (row) => row.physicalRecordingId === recordingId
    );
    if (own.some((row) => row.status === 'submitted')) return 'pending';
    if (own.some((row) => row.status === 'failed')) return 'failed';
    return 'not_requested';
  }

  const segments: CoverageSegmentInput[] = recordings.flatMap((row) => {
    if (row.participantRole !== 'coach' && row.participantRole !== 'athlete') {
      return [];
    }
    return [
      {
        participantRole: row.participantRole,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        status: row.status,
        stopReason: stopReasonOf(row.metadata),
        errorCode: row.errorCode,
        transcriptionState: transcriptionStateOf(row.id),
      },
    ];
  });

  return buildSessionCoverage({
    sessionStartedAt: session.startedAt,
    sessionEndedAt: session.endedAt,
    closeReason: closeReasonOf(session.metadata),
    segments,
    now: new Date(),
  });
}
