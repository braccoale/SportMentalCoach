import 'server-only';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  commitmentAttempts,
  sessionAiAuditEvents,
  sessionAiCommitments,
} from '@/lib/db/schema';
import { findPath, type StoredPath } from '@/lib/core/paths/path-store';
import {
  attemptAuditDetail,
  planAttempt,
  planAttemptEdit,
  planPause,
  planResume,
  toAttemptViews,
  type AttemptDecision,
  type AttemptInput,
  type AttemptView,
  type CommitmentForAttempt,
} from './commitment-attempts';

/**
 * Scritture e letture delle prove.
 *
 * Le decisioni stanno tutte in `commitment-attempts.ts`, che è puro: qui si
 * caricano gli ingressi, si applica l'esito e si lascia traccia. Nessuna regola
 * viene ripetuta — se una condizione non è nel modulo puro, non è una regola.
 */

export type AttemptFailure = { ok: false; reason: string; message: string; status: number };
export type AttemptSuccess<T> = { ok: true; value: T };
export type AttemptResult<T> = AttemptSuccess<T> | AttemptFailure;

/** Dal rifiuto del dominio al codice HTTP, in un posto solo. */
const STATUS_BY_REASON: Record<string, number> = {
  NOT_YOUR_COMMITMENT: 403,
  NOT_YOUR_ATTEMPT: 403,
  PATH_MISMATCH: 403,
  PATH_CLOSED: 409,
  CONTRIBUTIONS_REVOKED: 409,
  COMMITMENT_ARCHIVED: 409,
  COMMITMENT_CLOSED: 409,
  ALREADY_PAUSED: 409,
  NOT_PAUSED: 409,
  ATTEMPT_HIDDEN: 409,
  VERSION_CONFLICT: 409,
  NOT_FOUND: 404,
};

function failure(reason: string, message: string): AttemptFailure {
  return { ok: false, reason, message, status: STATUS_BY_REASON[reason] ?? 400 };
}

function fromDecision<T>(decision: AttemptDecision<T>): AttemptFailure {
  return decision.ok
    ? failure('UNEXPECTED', 'Errore imprevisto.')
    : failure(decision.reason, decision.message);
}

type LoadedCommitment = {
  commitment: CommitmentForAttempt;
  path: StoredPath;
};

/**
 * L'azione e il percorso su cui vive.
 *
 * Il percorso si cerca dalla **coppia dell'azione**, non da un identificativo
 * mandato dal client: è così che un'azione concordata con un coach non può
 * essere agganciata al percorso di un altro.
 */
async function loadCommitment(
  commitmentId: number
): Promise<AttemptResult<LoadedCommitment>> {
  const [row] = await db
    .select({
      id: sessionAiCommitments.id,
      sessionAiNotesId: sessionAiCommitments.sessionAiNotesId,
      athleteUserId: sessionAiCommitments.athleteUserId,
      coachUserId: sessionAiCommitments.coachUserId,
      owner: sessionAiCommitments.owner,
      status: sessionAiCommitments.status,
      archivedAt: sessionAiCommitments.archivedAt,
      pausedAt: sessionAiCommitments.pausedAt,
    })
    .from(sessionAiCommitments)
    .where(eq(sessionAiCommitments.id, commitmentId))
    .limit(1);

  if (!row) return failure('NOT_FOUND', 'Azione non trovata.');

  const path = await findPath({
    coachUserId: row.coachUserId,
    athleteUserId: row.athleteUserId,
  });
  if (!path) {
    return failure(
      'PATH_CLOSED',
      'Il percorso con questo coach non è ancora attivo.'
    );
  }

  return {
    ok: true,
    value: {
      commitment: {
        id: row.id,
        sessionAiNotesId: row.sessionAiNotesId,
        athleteUserId: row.athleteUserId,
        coachUserId: row.coachUserId,
        owner: row.owner as 'coach' | 'athlete',
        status: row.status as CommitmentForAttempt['status'],
        archivedAt: row.archivedAt,
        pausedAt: row.pausedAt,
      },
      path,
    },
  };
}

export type RecordedAttempt = AttemptView & {
  /** Vero quando la richiesta era un ritentativo e la riga esisteva già. */
  duplicate: boolean;
};

/**
 * Registra una prova.
 *
 * **Il ritentativo non crea un duplicato.** `client_request_id` arriva dal
 * telefono, generato prima dell'invio: se la richiesta era già passata —
 * l'invio precedente è andato a buon fine ma la risposta si è persa nei quindici
 * secondi di timeout, oppure il pulsante è stato toccato due volte — l'inserimento
 * non fa nulla e si restituisce la riga che c'era, marcata come duplicato.
 *
 * **Non tocca lo stato dell'azione.** Nessuna scrittura su
 * `session_ai_commitments`, nessuna su `athlete_journey_goals`: è la differenza
 * fra provare una cosa e averla conclusa.
 */
export async function recordAttempt(params: {
  commitmentId: number;
  athleteUserId: number;
  input: AttemptInput;
  now: Date;
}): Promise<AttemptResult<RecordedAttempt>> {
  const loaded = await loadCommitment(params.commitmentId);
  if (!loaded.ok) return loaded;

  const decision = planAttempt({
    commitment: loaded.value.commitment,
    path: loaded.value.path,
    athleteUserId: params.athleteUserId,
    input: params.input,
    now: params.now,
  });
  if (!decision.ok) return fromDecision(decision);

  const planned = decision.value;
  const [inserted] = await db
    .insert(commitmentAttempts)
    .values({
      commitmentId: planned.commitmentId,
      athleteUserId: planned.athleteUserId,
      pathId: planned.pathId,
      outcome: planned.outcome,
      note: planned.note,
      occurredOn: planned.occurredOn,
      clientRequestId: planned.clientRequestId,
      createdBy: params.athleteUserId,
    })
    .onConflictDoNothing({
      target: [commitmentAttempts.commitmentId, commitmentAttempts.clientRequestId],
    })
    .returning({ id: commitmentAttempts.id });

  if (!inserted) {
    const existing = await loadAttemptByRequestId(
      planned.commitmentId,
      planned.clientRequestId
    );
    return existing
      ? { ok: true, value: { ...existing, duplicate: true } }
      : failure('NOT_FOUND', 'Prova non trovata.');
  }

  await recordAudit({
    sessionAiNotesId: loaded.value.commitment.sessionAiNotesId,
    eventType: 'commitment_attempt_recorded',
    actorUserId: params.athleteUserId,
    detail: attemptAuditDetail({
      attemptId: inserted.id,
      commitmentId: planned.commitmentId,
      pathId: planned.pathId,
      outcome: planned.outcome,
      version: 1,
      note: planned.note,
    }),
  });

  const view = await loadAttemptById(inserted.id);
  return view
    ? { ok: true, value: { ...view, duplicate: false } }
    : failure('NOT_FOUND', 'Prova non trovata.');
}

/**
 * Corregge una prova, senza conservare il testo precedente.
 *
 * La versione attesa entra nella clausola `where`: se nel frattempo un altro
 * dispositivo ha scritto, l'aggiornamento non trova la riga e la risposta è un
 * conflitto. È la stessa verifica che il dominio fa in anticipo, ripetuta qui
 * perché fra la lettura e la scrittura può passare qualcosa — ed è l'unica delle
 * due che regge davvero contro due scritture simultanee.
 */
export async function editAttempt(params: {
  attemptId: number;
  actorUserId: number;
  expectedVersion: unknown;
  input: Omit<AttemptInput, 'clientRequestId'>;
  now: Date;
}): Promise<AttemptResult<AttemptView>> {
  const [row] = await db
    .select({
      id: commitmentAttempts.id,
      commitmentId: commitmentAttempts.commitmentId,
      athleteUserId: commitmentAttempts.athleteUserId,
      version: commitmentAttempts.version,
      hiddenAt: commitmentAttempts.hiddenAt,
    })
    .from(commitmentAttempts)
    .where(eq(commitmentAttempts.id, params.attemptId))
    .limit(1);

  if (!row) return failure('NOT_FOUND', 'Prova non trovata.');

  const loaded = await loadCommitment(row.commitmentId);
  if (!loaded.ok) return loaded;

  const decision = planAttemptEdit({
    attempt: row,
    actorUserId: params.actorUserId,
    expectedVersion: params.expectedVersion,
    input: params.input,
    now: params.now,
  });
  if (!decision.ok) return fromDecision(decision);

  const planned = decision.value;
  const updated = await db
    .update(commitmentAttempts)
    .set({
      outcome: planned.outcome,
      note: planned.note,
      occurredOn: planned.occurredOn,
      version: planned.nextVersion,
      editedAt: params.now,
      updatedDate: params.now,
      updatedBy: params.actorUserId,
    })
    .where(
      and(
        eq(commitmentAttempts.id, planned.attemptId),
        // Il gettone: senza questa riga, due correzioni simultanee si
        // sovrascriverebbero l'una con l'altra in silenzio.
        eq(commitmentAttempts.version, planned.expectedVersion)
      )
    )
    .returning({ id: commitmentAttempts.id });

  if (updated.length === 0) {
    return failure(
      'VERSION_CONFLICT',
      'Questa prova è cambiata da quando l’hai aperta. Ricaricala e riprova.'
    );
  }

  await recordAudit({
    sessionAiNotesId: loaded.value.commitment.sessionAiNotesId,
    eventType: 'commitment_attempt_edited',
    actorUserId: params.actorUserId,
    detail: attemptAuditDetail({
      attemptId: planned.attemptId,
      commitmentId: row.commitmentId,
      pathId: loaded.value.path.id,
      outcome: planned.outcome,
      version: planned.nextVersion,
      note: planned.note,
    }),
  });

  const view = await loadAttemptById(planned.attemptId);
  return view ? { ok: true, value: view } : failure('NOT_FOUND', 'Prova non trovata.');
}

export type PausedCommitment = {
  commitmentId: number;
  pausedAt: string | null;
  pausedReason: string | null;
};

/**
 * Mette in pausa, o riprende.
 *
 * Tocca **solo** le tre colonne della pausa. `status` resta dov'era, e con esso
 * ogni schermata del prodotto che partiziona i quattro stati in aperto e
 * chiuso: un impegno in pausa continua a essere `pending` o `in_progress`, e
 * chi non conosce la pausa vede esattamente quello che vedeva.
 */
export async function setCommitmentPause(params: {
  commitmentId: number;
  athleteUserId: number;
  paused: boolean;
  reason?: unknown;
  now: Date;
}): Promise<AttemptResult<PausedCommitment>> {
  const loaded = await loadCommitment(params.commitmentId);
  if (!loaded.ok) return loaded;

  /*
   * I due rami restano separati fino in fondo.
   *
   * Unirli in un solo `decision` costringeva a ripescare il motivo da un tipo
   * unione con un `in`, e il compilatore non poteva più garantire che il ramo
   * «riprendi» non ne portasse uno: la ripresa non ha un motivo, e questa è la
   * forma in cui non può averlo per sbaglio.
   */
  let reason: string | null = null;
  if (params.paused) {
    const decision = planPause({
      commitment: loaded.value.commitment,
      path: loaded.value.path,
      athleteUserId: params.athleteUserId,
      reason: params.reason,
    });
    if (!decision.ok) return fromDecision(decision);
    reason = decision.value.reason;
  } else {
    const decision = planResume({
      commitment: loaded.value.commitment,
      path: loaded.value.path,
      athleteUserId: params.athleteUserId,
    });
    if (!decision.ok) return fromDecision(decision);
  }

  await db
    .update(sessionAiCommitments)
    .set({
      pausedAt: params.paused ? params.now : null,
      pausedReason: params.paused ? reason : null,
      pausedBy: params.paused ? params.athleteUserId : null,
      updatedDate: params.now,
      updatedBy: params.athleteUserId,
    })
    .where(eq(sessionAiCommitments.id, params.commitmentId));

  await recordAudit({
    sessionAiNotesId: loaded.value.commitment.sessionAiNotesId,
    eventType: params.paused
      ? 'commitment_paused_by_athlete'
      : 'commitment_resumed_by_athlete',
    actorUserId: params.athleteUserId,
    detail: {
      commitmentId: params.commitmentId,
      pathId: loaded.value.path.id,
      // Il motivo è testo scritto da una persona: nel registro entra solo se
      // c'era, mai che cosa diceva.
      hasReason: reason !== null,
    },
  });

  return {
    ok: true,
    value: {
      commitmentId: params.commitmentId,
      pausedAt: params.paused ? params.now.toISOString() : null,
      pausedReason: params.paused ? reason : null,
    },
  };
}

/** Le prove di più azioni, in un colpo solo, già ordinate e ripulite. */
export async function listAttemptsByCommitmentIds(
  commitmentIds: readonly number[]
): Promise<Map<number, AttemptView[]>> {
  const result = new Map<number, AttemptView[]>();
  if (commitmentIds.length === 0) return result;

  const rows = await db
    .select({
      id: commitmentAttempts.id,
      commitmentId: commitmentAttempts.commitmentId,
      outcome: commitmentAttempts.outcome,
      note: commitmentAttempts.note,
      occurredOn: commitmentAttempts.occurredOn,
      version: commitmentAttempts.version,
      editedAt: commitmentAttempts.editedAt,
      hiddenAt: commitmentAttempts.hiddenAt,
      createdDate: commitmentAttempts.createdDate,
    })
    .from(commitmentAttempts)
    .where(
      and(
        inArray(commitmentAttempts.commitmentId, [...commitmentIds]),
        isNull(commitmentAttempts.hiddenAt)
      )
    )
    .orderBy(asc(commitmentAttempts.occurredOn), asc(commitmentAttempts.createdDate));

  const grouped = new Map<number, typeof rows>();
  for (const row of rows) {
    const bucket = grouped.get(row.commitmentId) ?? [];
    bucket.push(row);
    grouped.set(row.commitmentId, bucket);
  }
  for (const [commitmentId, bucket] of grouped) {
    result.set(commitmentId, toAttemptViews(bucket));
  }
  return result;
}

async function loadAttemptById(attemptId: number): Promise<AttemptView | null> {
  const [row] = await db
    .select({
      id: commitmentAttempts.id,
      outcome: commitmentAttempts.outcome,
      note: commitmentAttempts.note,
      occurredOn: commitmentAttempts.occurredOn,
      version: commitmentAttempts.version,
      editedAt: commitmentAttempts.editedAt,
      hiddenAt: commitmentAttempts.hiddenAt,
      createdDate: commitmentAttempts.createdDate,
    })
    .from(commitmentAttempts)
    .where(eq(commitmentAttempts.id, attemptId))
    .limit(1);
  return row ? (toAttemptViews([row])[0] ?? null) : null;
}

async function loadAttemptByRequestId(
  commitmentId: number,
  clientRequestId: string
): Promise<AttemptView | null> {
  const [row] = await db
    .select({
      id: commitmentAttempts.id,
      outcome: commitmentAttempts.outcome,
      note: commitmentAttempts.note,
      occurredOn: commitmentAttempts.occurredOn,
      version: commitmentAttempts.version,
      editedAt: commitmentAttempts.editedAt,
      hiddenAt: commitmentAttempts.hiddenAt,
      createdDate: commitmentAttempts.createdDate,
    })
    .from(commitmentAttempts)
    .where(
      and(
        eq(commitmentAttempts.commitmentId, commitmentId),
        eq(commitmentAttempts.clientRequestId, clientRequestId)
      )
    )
    .limit(1);
  return row ? (toAttemptViews([row])[0] ?? null) : null;
}

/**
 * Il registro.
 *
 * `detail` accetta soltanto valori non testuali o etichette chiuse: la forma la
 * costruisce `attemptAuditDetail`, che ha un test dedicato a verificare che il
 * testo della nota non ci finisca dentro.
 */
async function recordAudit(params: {
  sessionAiNotesId: number;
  eventType:
    | 'commitment_attempt_recorded'
    | 'commitment_attempt_edited'
    | 'commitment_paused_by_athlete'
    | 'commitment_resumed_by_athlete';
  actorUserId: number;
  detail: Record<string, string | number | boolean>;
}): Promise<void> {
  await db.insert(sessionAiAuditEvents).values({
    sessionAiNotesId: params.sessionAiNotesId,
    eventType: params.eventType,
    actorUserId: params.actorUserId,
    eventMetadata: params.detail,
    createdBy: params.actorUserId,
  });
}
