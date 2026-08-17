import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  sessionAiAuditEvents,
  sessionAiNotes,
  type AiSessionNoteStatus,
} from '@/lib/db/schema';
import {
  canTransitionAiNotesSession,
  transitionAuditPatch,
} from './state-machine';

/**
 * Avanzamento di stato deciso dal trattamento, non da una persona.
 *
 * Le transizioni della sessione esistevano solo come richieste esplicite, e
 * nessuna parte della pipeline le eseguiva: una sessione restava `active` per
 * sempre. Il Session Compass richiede almeno `processing`, quindi non era
 * generabile — il percorso si fermava a metà senza che nulla lo dicesse, con
 * la trascrizione sotto gli occhi e un pulsante che rispondeva "disponibile
 * quando la trascrizione è pronta".
 *
 * Vive in un modulo proprio, e non accanto alle transizioni manuali, perché
 * `index.ts` importa già il trattamento: metterlo lì creerebbe un ciclo fra i
 * due moduli.
 *
 * È deliberatamente indulgente. Se lo stato non consente il passaggio —
 * sessione annullata, o già avanzata da un'altra esecuzione del worker — non
 * fa nulla e non solleva: un lavoro di trattamento non deve fallire per una
 * corsa già vinta da qualcun altro.
 */
export async function advanceAiNotesSessionStatus(params: {
  sessionId: number;
  nextStatus: AiSessionNoteStatus;
  actorUserId: number;
  executor?: DbOrTx;
  /**
   * Che cosa scrivere nel registro oltre al passaggio.
   *
   * Serve a distinguere un avanzamento deciso dalla pipeline da una
   * riapertura decisa da qualcuno: nel registro devono restare due cose
   * diverse, altrimenti fra un anno una sessione tornata in lavorazione a
   * mano è indistinguibile da una che ci è arrivata da sola.
   */
  auditMetadata?: Record<string, unknown>;
}): Promise<boolean> {
  const run = async (tx: DbOrTx): Promise<boolean> => {
    const locked = (await tx.execute(sql`
      SELECT id, status, requested_by
      FROM session_ai_notes
      WHERE id = ${params.sessionId}
      FOR UPDATE
    `)) as unknown as Array<{
      id: number;
      status: AiSessionNoteStatus;
      requested_by: number;
    }>;
    const session = locked[0];
    if (!session) return false;
    if (session.status === params.nextStatus) return false;
    if (!canTransitionAiNotesSession(session.status, params.nextStatus)) {
      return false;
    }

    // Il worker può non avere un utente dietro: l'autore resta chi ha chiesto
    // la funzione, che è l'unica attribuzione onesta per un passaggio
    // automatico.
    const actorUserId = params.actorUserId || session.requested_by;
    const now = new Date();
    await tx
      .update(sessionAiNotes)
      .set(transitionAuditPatch(params.nextStatus, actorUserId, now))
      .where(eq(sessionAiNotes.id, params.sessionId));
    await tx.insert(sessionAiAuditEvents).values({
      sessionAiNotesId: params.sessionId,
      eventType: 'status_transitioned',
      actorUserId,
      previousStatus: session.status,
      newStatus: params.nextStatus,
      eventMetadata: { automatic: true, ...params.auditMetadata },
      createdBy: actorUserId,
      updatedBy: actorUserId,
    });
    return true;
  };

  return params.executor ? run(params.executor) : db.transaction(run);
}
