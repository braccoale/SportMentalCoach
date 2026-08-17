import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  sessionAiNotes,
  sessionCoachBookmarks,
  sessionParticipantRecordings,
  sessionTranscriptTimelineSegments,
} from '@/lib/db/schema';
import {
  buildConversationMap,
  type ConversationMap,
  type ConversationMomentInput,
  type ConversationRole,
} from './conversation-map';

/**
 * Carica la mappa della conversazione di una sessione.
 *
 * Legge inizio, fine, ruolo e testo; il testo serve solo a contare le
 * domande del coach e non viene mai restituito al browser. È ciò che permette di
 * caricarla insieme alla pagina invece che su richiesta — la fascia deve
 * esserci al primo colpo d'occhio, e uno spinner in cima alla Panoramica
 * annullerebbe l'effetto che deve produrre.
 */
export async function loadConversationMap(
  sessionId: number,
  moments: ConversationMomentInput[] = [],
  executor: DbOrTx = db
): Promise<ConversationMap | null> {
  // I segnalibri del coach entrano fra i momenti: sono istanti che lui ha
  // marcato dal vivo, e sulla mappa valgono quanto quelli trovati dall'AI.
  const bookmarks = await executor
    .select({
      atMs: sessionCoachBookmarks.atMs,
      note: sessionCoachBookmarks.note,
    })
    .from(sessionCoachBookmarks)
    .where(eq(sessionCoachBookmarks.sessionAiNotesId, sessionId));
  const rows = await executor
    .select({
      startMs: sessionTranscriptTimelineSegments.startMs,
      endMs: sessionTranscriptTimelineSegments.endMs,
      role: sessionTranscriptTimelineSegments.participantRole,
      // Serve solo a contare le domande: non lascia mai il server.
      text: sessionTranscriptTimelineSegments.normalizedText,
    })
    .from(sessionTranscriptTimelineSegments)
    .where(eq(sessionTranscriptTimelineSegments.sessionAiNotesId, sessionId))
    .orderBy(asc(sessionTranscriptTimelineSegments.startMs));
  if (rows.length === 0) return null;

  const [session] = await executor
    .select({
      startedAt: sessionAiNotes.startedAt,
      endedAt: sessionAiNotes.endedAt,
    })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.id, sessionId))
    .limit(1);

  const durationMs =
    session?.startedAt && session?.endedAt
      ? session.endedAt.getTime() - session.startedAt.getTime()
      : undefined;

  /*
   * Chi non e' stato registrato affatto.
   *
   * E' l'unica differenza fra «non ha parlato» e «non l'abbiamo sentito», e
   * si vede solo da qui: nella timeline le due cose sono la stessa assenza.
   * Senza, la mappa attribuisce il 100% del tempo a chi resta e il coach
   * legge un giudizio sul proprio lavoro dove c'e' un microfono perso.
   */
  const partecipanti = await executor
    .select({
      role: sessionParticipantRecordings.participantRole,
      status: sessionParticipantRecordings.status,
    })
    .from(sessionParticipantRecordings)
    .where(eq(sessionParticipantRecordings.sessionAiNotesId, sessionId));

  const rolesWithoutRecording = partecipanti
    .filter((p) => p.status === 'failed' || p.status === 'deleted')
    .map((p) => p.role)
    .filter((role): role is ConversationRole =>
      role === 'coach' || role === 'athlete'
    );

  return buildConversationMap({
    rolesWithoutRecording,
    segments: rows.flatMap((row) =>
      row.role === 'coach' || row.role === 'athlete'
        ? [{ startMs: row.startMs, endMs: row.endMs, role: row.role, text: row.text }]
        : []
    ),
    moments: [
      ...moments,
      ...bookmarks.map((bookmark) => ({
        atMs: bookmark.atMs,
        label: bookmark.note ?? 'Momento segnato da te',
      })),
    ],
    durationMs,
  });
}
