/**
 * Che cosa può entrare nel registro delle azioni amministrative.
 *
 * Un registro di audit è, per costruzione, il posto dove finiscono le cose
 * quando qualcosa va storto — ed è quindi il posto dove è più facile far
 * finire qualcosa che non doveva uscire. Il campo `detail` è un JSON libero:
 * senza una regola, il primo che ha fretta ci mette dentro il messaggio
 * d'errore del fornitore, che a volte contiene l'URL firmato, e la riga di
 * trascrizione «per capire meglio».
 *
 * Quindi la regola è qui, ed è una sola: **identificativi, conteggi, esiti e
 * codici.** Un valore troppo lungo per essere un codice viene troncato; una
 * chiave che somiglia a un segreto viene rimossa. È la stessa regola di
 * `pipeline-log.ts`, applicata a un registro che, a differenza di un log,
 * non scade mai.
 *
 * Modulo puro: si prova senza database.
 */

import type {
  AdminAuditAction,
  AdminAuditOutcome,
  AdminAuditSubject,
} from '@/lib/db/schema';

/** Oltre questa lunghezza un valore non è più un codice: è un contenuto. */
export const AUDIT_VALUE_MAX_LENGTH = 200;

/** Oltre questo numero di chiavi il dettaglio non si legge più. */
export const AUDIT_DETAIL_MAX_KEYS = 24;

/**
 * Chiavi che non entrano mai, qualunque cosa contengano.
 *
 * Il confronto è su sottostringa e senza distinzione di maiuscole: `authToken`,
 * `AUTHORIZATION`, `signed_url` cadono tutte. Meglio perdere un campo
 * innocuo che conservare per sempre una chiave d'accesso.
 */
const FORBIDDEN_KEY_FRAGMENTS = [
  'token',
  'secret',
  'password',
  'apikey',
  'api_key',
  'authorization',
  'signature',
  'signed',
  'credential',
  'cookie',
  'bearer',
  'transcript',
  'trascrizione',
  'summary',
  'riepilogo',
  'note',
  'body',
  'text',
  'testo',
  'content',
  'contenuto',
];

export type AuditDetailValue = string | number | boolean | null;

function forbidden(key: string): boolean {
  const normalized = key.toLowerCase();
  return FORBIDDEN_KEY_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment)
  );
}

/**
 * Il dettaglio, ripulito.
 *
 * Non solleva: un'azione amministrativa non deve fallire perché il suo
 * registro conteneva un campo di troppo. Il campo se ne va, l'azione resta
 * tracciata.
 */
export function sanitizeAuditDetail(
  detail: Record<string, unknown> | undefined
): Record<string, AuditDetailValue> {
  if (!detail) return {};
  const clean: Record<string, AuditDetailValue> = {};

  for (const [key, value] of Object.entries(detail)) {
    if (Object.keys(clean).length >= AUDIT_DETAIL_MAX_KEYS) break;
    if (forbidden(key)) continue;

    if (value === null || typeof value === 'boolean') {
      clean[key] = value;
      continue;
    }
    if (typeof value === 'number') {
      clean[key] = Number.isFinite(value) ? value : null;
      continue;
    }
    if (typeof value === 'string') {
      clean[key] = value.slice(0, AUDIT_VALUE_MAX_LENGTH);
      continue;
    }
    // Oggetti e array annidati non entrano: un registro con una struttura
    // dentro non si interroga, si legge — e allora tanto vale non averlo.
  }

  return clean;
}

export type AdminAuditEntry = {
  action: AdminAuditAction;
  subjectType: AdminAuditSubject;
  subjectId: number | null;
  outcome: AdminAuditOutcome;
  detail: Record<string, AuditDetailValue>;
};

export function buildAdminAuditEntry(params: {
  action: AdminAuditAction;
  subjectType: AdminAuditSubject;
  subjectId?: number | null;
  outcome?: AdminAuditOutcome;
  detail?: Record<string, unknown>;
}): AdminAuditEntry {
  const subjectId =
    typeof params.subjectId === 'number' && Number.isInteger(params.subjectId)
      ? params.subjectId
      : null;

  return {
    action: params.action,
    subjectType: params.subjectType,
    subjectId,
    outcome: params.outcome ?? 'ok',
    detail: sanitizeAuditDetail(params.detail),
  };
}

export const ADMIN_AUDIT_ACTION_LABEL: Record<AdminAuditAction, string> = {
  coach_approved: 'Coach approvato',
  coach_rejected: 'Coach rifiutato',
  coach_verification_changed: 'Verifica coach modificata',
  user_role_changed: 'Ruolo modificato',
  ai_notes_entitlement_granted: 'Appunti AI abilitati',
  ai_notes_entitlement_revoked: 'Appunti AI revocati',
  ai_notes_session_reopened: 'Seduta AI ripresa',
  ai_notes_worker_run: 'Worker AI eseguito a mano',
  ai_notes_guidelines_saved: 'Linee guida salvate',
  ai_notes_callback_probed: 'Indirizzo di callback verificato',
  sensitive_content_accessed: 'Accesso eccezionale a contenuti',
  data_exported: 'Dati esportati',
  data_deleted: 'Dati cancellati',
  configuration_changed: 'Configurazione modificata',
};

export const ADMIN_AUDIT_OUTCOME_LABEL: Record<AdminAuditOutcome, string> = {
  ok: 'Eseguita',
  rifiutata: 'Rifiutata',
  fallita: 'Fallita',
};
