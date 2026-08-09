import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import { bookings, providerProfiles, sessionAiNotes } from '@/lib/db/schema';
import { advanceAiNotesSessionStatus } from './session-status';
import { stopAiNotesRecordings } from './recording';
import {
  AiNotesDomainError,
  isClosableSessionStatus,
  type AiNotesCloseReason,
} from './state-machine';
import type { LiveKitSessionControl } from './livekit-session-control';

export type { AiNotesCloseReason };

/**
 * L'unico percorso che porta una sessione a `processing`.
 *
 * Prima esistevano due avanzamenti impliciti — alla chiusura del primo
 * egress e al completamento delle trascrizioni — e nessuno dei due
 * corrispondeva alla fine della sessione. Bastava una disconnessione perché
 * la sessione risultasse conclusa mentre coach e atleta stavano ancora
 * parlando, e da lì la registrazione non ripartiva più: tutto il resto
 * dell'incontro finiva senza audio e senza che nulla lo segnalasse.
 *
 * Ferma le tracce ancora aperte e poi chiude. L'ordine conta: chiudere per
 * prima cosa lascerebbe egress vivi su una sessione che nessuno sorveglia
 * più.
 *
 * Restituisce `true` solo se è stata questa chiamata a chiudere: una seconda
 * chiusura non è un errore, è una corsa già vinta da qualcun altro.
 */
export async function closeAiNotesSession(
  params: {
    sessionId: number;
    reason: AiNotesCloseReason;
    actorUserId?: number | null;
    enforceCoach?: boolean;
    /**
     * L'osservazione del coach, scritta chiudendo.
     *
     * E' il momento in cui ha le idee fresche e sta per dimenticarle. Vive
     * nei metadata della sessione e non nel report, che a quest'ora non
     * esiste ancora: il report arriva minuti dopo, a trascrizione fatta.
     */
    closingNote?: string | null;
  },
  liveKit: LiveKitSessionControl,
  executor: DbOrTx = db
): Promise<boolean> {
  const [session] = await executor
    .select({
      id: sessionAiNotes.id,
      status: sessionAiNotes.status,
      requestedBy: sessionAiNotes.requestedBy,
    })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.id, params.sessionId))
    .limit(1);
  if (!session) {
    if (params.enforceCoach) {
      throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
    }
    return false;
  }
  if (!isClosableSessionStatus(session.status)) return false;

  const actorUserId = params.actorUserId ?? session.requestedBy;

  await stopAiNotesRecordings(
    {
      sessionId: params.sessionId,
      actorUserId: params.actorUserId,
      reason: params.reason,
      enforceCoach: params.enforceCoach,
    },
    liveKit,
    executor
  );

  const closed = await advanceAiNotesSessionStatus({
    sessionId: params.sessionId,
    nextStatus: 'processing',
    actorUserId,
    executor,
  });
  if (!closed) return false;

  // Il motivo vive nei metadata e non in una colonna nuova: è un'etichetta
  // descrittiva, non un valore su cui interroghiamo o vincoliamo.
  //
  // Nessun evento di audit viene scritto qui: `advanceAiNotesSessionStatus`
  // ne registra già uno per la transizione. Aggiungerne un secondo
  // produrrebbe due righe per lo stesso fatto, e un registro che conta due
  // volte è peggio di uno scarno.
  await executor
    .update(sessionAiNotes)
    .set({
      metadata: sql`${sessionAiNotes.metadata} || ${JSON.stringify({
        closeReason: params.reason,
        ...(params.closingNote?.trim()
          ? { closingNote: params.closingNote.trim().slice(0, 2000) }
          : {}),
      })}::jsonb`,
      updatedDate: new Date(),
      updatedBy: actorUserId,
    })
    .where(eq(sessionAiNotes.id, params.sessionId));

  return true;
}

/** La nota scritta chiudendo la sessione, se c'è. */
export async function loadClosingNote(
  sessionId: number,
  executor: DbOrTx = db
): Promise<string | null> {
  const [row] = await executor
    .select({ metadata: sessionAiNotes.metadata })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.id, sessionId))
    .limit(1);
  const value = (row?.metadata as { closingNote?: unknown } | undefined)
    ?.closingNote;
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Salva l'osservazione a caldo del coach.
 *
 * Separata dalla chiusura perché il momento in cui il coach ha davvero le
 * idee fresche è quando esce dalla videochiamata, che può avvenire dopo aver
 * già terminato gli Appunti AI. Funziona quindi a sessione chiusa.
 */
export async function setClosingNote(
  params: { sessionId: number; actorUserId: number; note: string },
  executor: DbOrTx = db
): Promise<boolean> {
  const [row] = await executor
    .select({ coachUserId: providerProfiles.userId })
    .from(sessionAiNotes)
    .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
    .where(eq(sessionAiNotes.id, params.sessionId))
    .limit(1);
  if (!row || row.coachUserId !== params.actorUserId) {
    throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
  }
  const note = params.note.trim().slice(0, 2000);
  if (!note) return false;
  await executor
    .update(sessionAiNotes)
    .set({
      metadata: sql`${sessionAiNotes.metadata} || ${JSON.stringify({ closingNote: note })}::jsonb`,
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(eq(sessionAiNotes.id, params.sessionId));
  return true;
}
