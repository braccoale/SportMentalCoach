import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  sessionAiNotes,
  sessionTranscriptTimelineSegments,
} from '@/lib/db/schema';
import {
  buildConversationMap,
  type ConversationMap,
  type ConversationMomentInput,
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

  return buildConversationMap({
    segments: rows.flatMap((row) =>
      row.role === 'coach' || row.role === 'athlete'
        ? [{ startMs: row.startMs, endMs: row.endMs, role: row.role, text: row.text }]
        : []
    ),
    moments,
    durationMs,
  });
}
