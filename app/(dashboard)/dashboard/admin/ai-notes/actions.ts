'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  FEATURE_CODES,
  revokeFeatureEntitlement,
  setFeatureEntitlement,
} from '@/lib/core/features';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';
import {
  processAiNotesBatch,
  recoverStaleAiProcessingJobs,
} from '@/lib/core/ai-session-notes/processing';
import { closeStuckProcessingSessions } from '@/lib/core/ai-session-notes/stuck-sessions';
import { probeCallbackEndpoint } from '@/lib/core/ai-session-notes/callback-probe';
import { saveHouseGuidelines } from '@/lib/core/ai-session-notes/house-guidelines';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * Esegue il worker Appunti AI su richiesta dell'amministratore.
 *
 * Perché una server action e non una chiamata alla rotta interna. La rotta
 * `/api/internal/ai-notes/process` esiste per gli scheduler ed è protetta da
 * `CRON_SECRET`: farla invocare a mano significa procurarsi il segreto,
 * copiarlo in un terminale e sperare di non lasciarlo nella cronologia. Qui
 * siamo già dentro il server, con un amministratore già autenticato: il worker
 * si chiama direttamente, senza HTTP e senza segreti in giro.
 *
 * Serve a due cose, e resteranno entrambe valide: sbloccare una coda ferma
 * senza aspettare lo scheduler, e misurare quanto impiega davvero una
 * trascrizione — dato che finora non abbiamo mai avuto.
 */
export async function runAiNotesWorkerAction(
  _previous: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');

  const startedAt = Date.now();
  try {
    const dependencies = createProductionAiSessionNotesDependencies();
    const recovered = await recoverStaleAiProcessingJobs({ limit: 10 });
    const result = await processAiNotesBatch(
      { workerId: `admin-${Date.now().toString(36)}`, limit: 5 },
      dependencies
    );
    // Anche a coda vuota c'e' del lavoro: una sessione oltre la scadenza va
    // chiusa, altrimenti il pulsante dice «nessun job» e lascia il coach a
    // guardare la rotellina — che e' esattamente il caso in cui lo si preme.
    const expired = await closeStuckProcessingSessions({ limit: 20 }, dependencies);
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

    // Una corsa a mano del worker e' un'azione amministrativa: cambia lo stato
    // di sedute vere, e senza traccia non e' distinguibile da una corsa dello
    // scheduler quando fra un mese si chiede perche' una seduta e' ripartita.
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'ai_notes_worker_run',
      subjectType: 'system',
      outcome: 'ok',
      detail: {
        secondi: Number(seconds),
        presi: result.claimed,
        completati: result.completed,
        falliti: result.failed,
        annullati: result.cancelled,
        recuperati: recovered,
        scaduteChiuse: expired,
      },
    });

    revalidatePath('/dashboard/admin/ai-notes');

    if (result.claimed === 0) {
      return {
        success:
          `Nessun job da elaborare (${seconds}s). Job recuperati: ${recovered}, ` +
          `sessioni scadute chiuse: ${expired}.`,
      };
    }
    return {
      success:
        `Eseguito in ${seconds}s — presi ${result.claimed}, completati ${result.completed}, ` +
        `falliti ${result.failed}, annullati ${result.cancelled}, recuperati ${recovered}, ` +
        `sessioni scadute chiuse: ${expired}.`,
    };
  } catch (error) {
    // Il messaggio del provider non arriva mai al browser: resta nei log.
    console.error('[admin] esecuzione worker fallita', error);
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'ai_notes_worker_run',
      subjectType: 'system',
      outcome: 'fallita',
      detail: { secondi: Number(seconds) },
    });
    return {
      error: `Il worker si è interrotto dopo ${seconds}s. Il dettaglio è nei log del server.`,
    };
  }
}

export async function updateAiNotesEntitlementAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const targetUserId = Number(formData.get('userId'));
  const operation = String(formData.get('operation') ?? '');
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return { error: 'Utente non valido.' };
  }

  try {
    if (operation === 'revoke') {
      const dependencies = createProductionAiSessionNotesDependencies();
      await revokeFeatureEntitlement({
        actorUserId: admin.id,
        targetUserId,
        featureCode: FEATURE_CODES.AI_SESSION_NOTES,
      }, dependencies.liveKit);
    } else if (operation === 'trial') {
      const expiresAt = new Date();
      expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);
      await setFeatureEntitlement({
        actorUserId: admin.id,
        targetUserId,
        featureCode: FEATURE_CODES.AI_SESSION_NOTES,
        status: 'trial',
        source: 'trial',
        startsAt: new Date(),
        expiresAt,
      });
    } else if (operation === 'enable') {
      await setFeatureEntitlement({
        actorUserId: admin.id,
        targetUserId,
        featureCode: FEATURE_CODES.AI_SESSION_NOTES,
        status: 'enabled',
        source: 'admin',
      });
    } else {
      return { error: 'Operazione non valida.' };
    }
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action:
        operation === 'revoke'
          ? 'ai_notes_entitlement_revoked'
          : 'ai_notes_entitlement_granted',
      subjectType: 'user',
      subjectId: targetUserId,
      outcome: 'fallita',
      detail: { operazione: operation },
    });
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
      return { error: 'Utente non trovato.' };
    }
    return { error: 'Impossibile aggiornare l’abilitazione.' };
  }

  await recordAdminAudit({
    actor: { id: admin.id, email: admin.email },
    action:
      operation === 'revoke'
        ? 'ai_notes_entitlement_revoked'
        : 'ai_notes_entitlement_granted',
    subjectType: 'user',
    subjectId: targetUserId,
    outcome: 'ok',
    detail: { operazione: operation },
  });

  revalidatePath('/dashboard/admin/ai-notes');
  return {
    success:
      operation === 'revoke'
        ? 'Funzionalità revocata.'
        : 'Funzionalità abilitata.',
  };
}

/**
 * Verifica che il provider possa davvero richiamarci.
 *
 * L'indirizzo di callback e' l'unico pezzo che non si puo' controllare
 * lavorando: lo si consegna al provider e si spera. Un valore sbagliato e'
 * rimasto invisibile per giorni. Questa prova ci mette tre secondi e
 * risponde per sempre alla domanda «l'indirizzo e' giusto?».
 */
export async function probeCallbackAction(
  _previous: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const result = await probeCallbackEndpoint();
  await recordAdminAudit({
    actor: { id: admin.id, email: admin.email },
    action: 'ai_notes_callback_probed',
    subjectType: 'configuration',
    outcome: result.reachable ? 'ok' : 'fallita',
    detail: { origine: result.origin ?? null },
  });
  revalidatePath('/dashboard/admin/ai-notes');
  return result.reachable
    ? { success: `${result.origin} — ${result.detail}` }
    : { error: `${result.origin ?? 'nessun indirizzo'} — ${result.detail}` };
}

/**
 * Salva una versione nuova delle linee guida del metodo.
 *
 * Non sovrascrive: il riepilogo di una seduta e' stato scritto con una certa
 * versione, e fra sei mesi deve restare possibile sapere quale. La versione
 * entra nella versione del prompt, quindi salvare fa rigenerare le bozze non
 * ancora approvate — quelle approvate restano com'erano.
 */
export async function saveHouseGuidelinesAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const body = String(formData.get('body') ?? '');
  try {
    const saved = await saveHouseGuidelines({ body, actorUserId: admin.id });
    // Il prompt e' un pezzo di prodotto: cambia cio' che un coach legge su una
    // persona vera, e la versione salvata entra nella versione del prompt.
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'ai_notes_guidelines_saved',
      subjectType: 'configuration',
      outcome: 'ok',
      detail: { versione: saved.version, lunghezza: body.length },
    });
    revalidatePath('/dashboard/admin/ai-notes');
    return { success: `Linee guida salvate: versione ${saved.version}.` };
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'ai_notes_guidelines_saved',
      subjectType: 'configuration',
      outcome: 'fallita',
      detail: { lunghezza: body.length },
    });
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Non e’ stato possibile salvare le linee guida.',
    };
  }
}
