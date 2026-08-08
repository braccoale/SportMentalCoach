import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import { sessionAiNotes } from '@/lib/db/schema';
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
      })}::jsonb`,
      updatedDate: new Date(),
      updatedBy: actorUserId,
    })
    .where(eq(sessionAiNotes.id, params.sessionId));

  return true;
}
