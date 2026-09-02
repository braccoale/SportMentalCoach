'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/core/auth';
import { db } from '@/lib/db/drizzle';
import { sessionAiNotes, sessionTranscriptSegments } from '@/lib/db/schema';
import { advanceAiNotesSessionStatus } from '@/lib/core/ai-session-notes/session-status';
import {
  enqueueNormalizationIfReady,
  requeueFailedReportJob,
} from '@/lib/core/ai-session-notes/processing';
import { retryAvailability } from '@/lib/core/admin/ai-console-policy';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * Riprende una seduta il cui riepilogo non è mai arrivato.
 *
 * **Non è un «riprova» generico.** È esattamente l'operazione di
 * `npm run ai-notes:reopen`, portata dentro l'interfaccia: la macchina a
 * stati ammette una sola transizione all'indietro — `report_failed →
 * processing` — e questa azione non ne inventa altre. Un pulsante «riprova»
 * che rimette in coda qualunque cosa è il modo in cui una pipeline comincia a
 * contenere stati che nessuno ha progettato.
 *
 * Le quattro garanzie richieste, e dove stanno:
 *
 * - **Idempotente.** `enqueueNormalizationIfReady` usa una chiave di
 *   idempotenza (`normalization:<sessione>:<impronta>`) su cui esiste un
 *   vincolo di unicità: un secondo clic non crea un secondo lavoro.
 *   `requeueFailedReportJob` risveglia il job già esistente e si rifiuta se
 *   ce n'è uno vivo. Premere due volte non produce due riepiloghi.
 * - **Autorizzata sul server.** `requireRole('admin')` qui dentro, non solo
 *   nella pagina: una server action è un endpoint, e chi la invoca non è
 *   necessariamente passato dalla pagina che la mostra.
 * - **Confermata.** `ActionForm` con `confirmMessage` nel componente.
 * - **Registrata.** Una riga in `admin_audit_events`, e l'evento di
 *   riapertura in `session_ai_audit_events` con `{ automatic: false }` —
 *   così fra un anno una seduta rimessa in moto a mano resta distinguibile da
 *   una che ci è arrivata da sola.
 *
 * La disponibilità la decide `retryAvailability`, che è pura e provata, e
 * viene **ricontrollata qui**: quello che decide il pulsante disabilitato non
 * è quello che protegge i dati.
 */
export async function retryAiSessionAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const sessionId = Number(formData.get('sessionId'));

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return { error: 'Sessione non valida.' };
  }

  const [session] = await db
    .select({
      id: sessionAiNotes.id,
      status: sessionAiNotes.status,
      requestedBy: sessionAiNotes.requestedBy,
    })
    .from(sessionAiNotes)
    .where(eq(sessionAiNotes.id, sessionId))
    .limit(1);

  if (!session) {
    return { error: 'Sessione non trovata.' };
  }

  const [{ segmenti }] = (await db
    .select({ segmenti: sql<number>`count(*)::int` })
    .from(sessionTranscriptSegments)
    .where(eq(sessionTranscriptSegments.sessionAiNotesId, sessionId))) as [
    { segmenti: number },
  ];

  const availability = retryAvailability(session.status, Number(segmenti));
  if (!availability.allowed) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'ai_notes_session_reopened',
      subjectType: 'ai_session',
      subjectId: sessionId,
      outcome: 'rifiutata',
      detail: { stato: session.status, segmenti: Number(segmenti) },
    });
    return { error: availability.reason };
  }

  try {
    const reopened =
      session.status === 'processing'
        ? true
        : await advanceAiNotesSessionStatus({
            sessionId,
            nextStatus: 'processing',
            actorUserId: session.requestedBy,
            auditMetadata: {
              automatic: false,
              reopened: true,
              reason: 'ripresa manuale dalla console amministrativa',
              adminUserId: admin.id,
            },
          });

    if (!reopened) {
      await recordAdminAudit({
        actor: { id: admin.id, email: admin.email },
        action: 'ai_notes_session_reopened',
        subjectType: 'ai_session',
        subjectId: sessionId,
        outcome: 'rifiutata',
        detail: { stato: session.status, motivo: 'INVALID_TRANSITION' },
      });
      return {
        error:
          'La macchina a stati ha rifiutato la riapertura: la seduta è cambiata nel frattempo. Ricarica la pagina.',
      };
    }

    /*
     * Le stesse dipendenze minime dello script di riapertura, e per la stessa
     * ragione: `enqueueNormalizationIfReady` legge il database e l'orologio,
     * mentre la fabbrica di produzione costruisce anche la configurazione
     * dell'audio. Costruirla qui farebbe fallire la riapertura in ogni
     * ambiente senza chiavi S3, lasciando la seduta viva e ferma — che è
     * peggio di dove stava.
     */
    const queued = await enqueueNormalizationIfReady(sessionId, {
      db,
      clock: { now: () => new Date() },
    } as unknown as Parameters<typeof enqueueNormalizationIfReady>[1]);

    // Quando la normalizzazione è già fatta — cioè ogni volta che la seduta è
    // morta *dopo* la trascrizione, che è il caso per cui questa azione
    // esiste — non c'è nulla da accodare: si risveglia il job che c'è già.
    const report = queued
      ? null
      : await requeueFailedReportJob({
          sessionId,
          actorUserId: session.requestedBy,
        });

    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'ai_notes_session_reopened',
      subjectType: 'ai_session',
      subjectId: sessionId,
      outcome: 'ok',
      detail: {
        statoPrecedente: session.status,
        segmenti: Number(segmenti),
        normalizzazioneAccodata: queued,
        riepilogoRimessoInCoda: report,
      },
    });

    revalidatePath('/dashboard/admin/ai');
    revalidatePath(`/dashboard/admin/ai/${sessionId}`);

    if (!queued && report === null) {
      return {
        success:
          'Seduta riportata in lavorazione, ma nessun lavoro è stato accodato: il worker la rivaluterà. Vale la pena guardare il dettaglio dei job.',
      };
    }

    return {
      success: queued
        ? 'Seduta riportata in lavorazione: la normalizzazione è in coda.'
        : `Seduta riportata in lavorazione: il riepilogo (job ${report}) è di nuovo in coda.`,
    };
  } catch (error) {
    console.error('[admin] ripresa seduta fallita', {
      sessionId,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'ai_notes_session_reopened',
      subjectType: 'ai_session',
      subjectId: sessionId,
      outcome: 'fallita',
      detail: { stato: session.status },
    });
    return {
      error:
        'La ripresa si è interrotta. Il dettaglio è nei log del server; la seduta non è stata lasciata a metà.',
    };
  }
}
