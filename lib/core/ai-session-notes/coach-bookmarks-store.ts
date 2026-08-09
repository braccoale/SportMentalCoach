import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  sessionAiNotes,
  sessionCoachBookmarks,
} from '@/lib/db/schema';
import {
  bookmarkPositionMs,
  isDuplicateBookmark,
} from './coach-bookmarks';
import { AiNotesDomainError } from './state-machine';

export type CoachBookmark = {
  id: number;
  atMs: number;
  note: string | null;
};

async function coachSession(sessionId: number, executor: DbOrTx) {
  const [row] = await executor
    .select({
      id: sessionAiNotes.id,
      startedAt: sessionAiNotes.startedAt,
      status: sessionAiNotes.status,
      coachUserId: providerProfiles.userId,
    })
    .from(sessionAiNotes)
    .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
    .where(eq(sessionAiNotes.id, sessionId))
    .limit(1);
  return row ?? null;
}

/**
 * Posa un segnalibro sulla sessione in corso.
 *
 * Solo il coach titolare: il segnalibro è un suo appunto di lavoro, e
 * l'atleta non lo vede né lo mette.
 */
export async function addCoachBookmark(
  params: { sessionId: number; actorUserId: number; now?: Date },
  executor: DbOrTx = db
): Promise<CoachBookmark | null> {
  const session = await coachSession(params.sessionId, executor);
  // 404 e non 403: chi sonda dall'esterno non deve poter distinguere una
  // sessione altrui da una inesistente.
  if (!session || session.coachUserId !== params.actorUserId) {
    throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
  }

  const atMs = bookmarkPositionMs({
    pressedAt: params.now ?? new Date(),
    sessionStartedAt: session.startedAt,
  });
  if (atMs === null) {
    throw new AiNotesDomainError(
      'RECORDING_NOT_READY',
      'La sessione non è ancora iniziata.'
    );
  }

  const existing = await executor
    .select({ atMs: sessionCoachBookmarks.atMs })
    .from(sessionCoachBookmarks)
    .where(eq(sessionCoachBookmarks.sessionAiNotesId, params.sessionId));
  // Premere due volte per sicurezza è normale: non si crea un secondo rombo
  // che indica lo stesso momento.
  if (isDuplicateBookmark(atMs, existing.map((row) => row.atMs))) return null;

  const [inserted] = await executor
    .insert(sessionCoachBookmarks)
    .values({
      sessionAiNotesId: params.sessionId,
      atMs,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    })
    .returning({
      id: sessionCoachBookmarks.id,
      atMs: sessionCoachBookmarks.atMs,
      note: sessionCoachBookmarks.note,
    });
  return inserted ?? null;
}

export async function listCoachBookmarks(
  sessionId: number,
  actorUserId: number,
  executor: DbOrTx = db
): Promise<CoachBookmark[]> {
  const session = await coachSession(sessionId, executor);
  if (!session || session.coachUserId !== actorUserId) return [];
  return executor
    .select({
      id: sessionCoachBookmarks.id,
      atMs: sessionCoachBookmarks.atMs,
      note: sessionCoachBookmarks.note,
    })
    .from(sessionCoachBookmarks)
    .where(and(eq(sessionCoachBookmarks.sessionAiNotesId, sessionId)))
    .orderBy(asc(sessionCoachBookmarks.atMs));
}

/**
 * I segnalibri della sessione, senza controllo di titolarità.
 *
 * Serve alla generazione del report, che gira nel worker e non ha un utente
 * dietro: l'autorizzazione l'ha già fatta chi ha accodato il lavoro.
 */
export async function listSessionBookmarksMs(
  sessionId: number,
  executor: DbOrTx = db
): Promise<number[]> {
  const rows = await executor
    .select({ atMs: sessionCoachBookmarks.atMs })
    .from(sessionCoachBookmarks)
    .where(eq(sessionCoachBookmarks.sessionAiNotesId, sessionId))
    .orderBy(asc(sessionCoachBookmarks.atMs));
  return rows.map((row) => row.atMs);
}
