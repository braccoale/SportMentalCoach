/**
 * Le prove di un'azione concordata, come regola pura.
 *
 * **Il difetto che questo modulo esiste per non ripetere.** La prima stesura
 * faceva corrispondere «Provata» a `completed`: l'azione si chiudeva alla prima
 * prova. Ma una routine mentale si prova più volte, ed è nella differenza fra
 * le occasioni che sta quello di cui si parla in seduta — provata mercoledì in
 * allenamento, non adatta sabato in partita, sotto 22 pari. Con la chiusura
 * automatica, sabato non c'era più niente da riprendere.
 *
 * Da qui i tre livelli, con tre proprietari diversi e nessun automatismo fra
 * loro:
 *
 * | Livello | Dove vive | Chi scrive |
 * |---|---|---|
 * | azione assegnata | `session_ai_commitments` | l'AI in bozza, poi il coach approvando |
 * | **prova** | `commitment_attempts` | **solo l'atleta** |
 * | chiusura | `session_ai_commitments.status` | **solo il coach**, in v1 |
 *
 * Una prova non chiude un'azione. Una pausa non è una chiusura. Né l'una né
 * l'altra toccano lo stato di un obiettivo del percorso, che resta un giudizio
 * del coach.
 *
 * Modulo puro: nessun `server-only`, nessun accesso al database.
 */

import { formatRomeDateValue } from '../format';
import type { PathState } from '../paths/path-policy';
import { authorizeNewContribution } from '../paths/path-policy';

export const ATTEMPT_OUTCOMES = ['provata', 'non_ancora', 'non_adatta'] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

/** Le tre parole che l'atleta legge sui pulsanti. Il client non traduce nulla. */
export const ATTEMPT_OUTCOME_LABELS: Record<AttemptOutcome, string> = {
  provata: 'Provata',
  non_ancora: 'Non ancora',
  non_adatta: 'Non era adatta al momento',
};

export function isAttemptOutcome(value: unknown): value is AttemptOutcome {
  return (ATTEMPT_OUTCOMES as readonly unknown[]).includes(value);
}

/** Oltre, non è più una nota: è un racconto, e va in un momento. */
export const MAX_ATTEMPT_NOTE_CHARS = 1000;
export const MAX_PAUSE_REASON_CHARS = 500;

/**
 * Quanto indietro può stare la data dichiarata.
 *
 * Serve a distinguere «ieri me ne sono dimenticato» da un dito scivolato su un
 * selettore di date. Un mese copre abbondantemente l'intervallo fra due sedute;
 * oltre, quello che si vuole segnare non è più una prova ma un ricordo, e la
 * data smette di dire qualcosa di utile al coach.
 */
export const MAX_ATTEMPT_BACKDATE_DAYS = 31;

export type AttemptRefusal =
  | 'INVALID_OUTCOME'
  | 'INVALID_DATE'
  | 'FUTURE_DATE'
  | 'TOO_OLD'
  | 'NOTE_TOO_LONG'
  | 'INVALID_REQUEST_ID'
  | 'NOT_YOUR_COMMITMENT'
  | 'COMMITMENT_ARCHIVED'
  | 'COMMITMENT_CLOSED'
  | 'PATH_MISMATCH'
  | 'PATH_CLOSED'
  | 'CONTRIBUTIONS_REVOKED'
  | 'NOT_YOUR_ATTEMPT'
  | 'ATTEMPT_HIDDEN'
  | 'VERSION_CONFLICT'
  | 'ALREADY_PAUSED'
  | 'NOT_PAUSED'
  | 'REASON_TOO_LONG';

const MESSAGES: Record<AttemptRefusal, string> = {
  INVALID_OUTCOME: 'Esito non valido.',
  INVALID_DATE: 'La data non è valida.',
  FUTURE_DATE: 'Non puoi segnare una prova per un giorno che non è ancora arrivato.',
  TOO_OLD: 'Questa data è troppo indietro nel tempo.',
  NOTE_TOO_LONG: 'La nota è troppo lunga.',
  INVALID_REQUEST_ID: 'Richiesta non valida.',
  NOT_YOUR_COMMITMENT: 'Questa azione non è tua.',
  COMMITMENT_ARCHIVED: 'Questa azione non è più attiva. Parlane con il tuo coach.',
  COMMITMENT_CLOSED: 'Questa azione è stata chiusa dal tuo coach.',
  PATH_MISMATCH: 'Questa azione appartiene a un altro percorso.',
  PATH_CLOSED: 'Il percorso è chiuso: non puoi aggiungere prove.',
  CONTRIBUTIONS_REVOKED: 'Hai smesso di condividere i tuoi contributi in questo percorso.',
  NOT_YOUR_ATTEMPT: 'Puoi correggere solo le prove che hai scritto tu.',
  ATTEMPT_HIDDEN: 'Questa prova non è più visibile.',
  VERSION_CONFLICT:
    'Questa prova è cambiata da quando l’hai aperta. Ricaricala e riprova.',
  ALREADY_PAUSED: 'Questa azione è già in pausa.',
  NOT_PAUSED: 'Questa azione non è in pausa.',
  REASON_TOO_LONG: 'Il motivo è troppo lungo.',
};

export type AttemptDecision<T> =
  | { ok: true; value: T }
  | { ok: false; reason: AttemptRefusal; message: string };

function refuse<T>(reason: AttemptRefusal): AttemptDecision<T> {
  return { ok: false, reason, message: MESSAGES[reason] };
}

function accept<T>(value: T): AttemptDecision<T> {
  return { ok: true, value };
}

/** L'azione assegnata, ridotta a ciò che serve per decidere su una prova. */
export type CommitmentForAttempt = {
  id: number;
  sessionAiNotesId: number;
  athleteUserId: number;
  coachUserId: number;
  owner: 'coach' | 'athlete';
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  archivedAt: Date | null;
  pausedAt: Date | null;
};

export type AttemptInput = {
  outcome: unknown;
  note?: unknown;
  /** «AAAA-MM-GG», il giorno dichiarato dall'atleta. */
  occurredOn: unknown;
  clientRequestId: unknown;
};

export type PlannedAttempt = {
  commitmentId: number;
  athleteUserId: number;
  pathId: number;
  outcome: AttemptOutcome;
  note: string | null;
  occurredOn: string;
  clientRequestId: string;
};

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Decide se una prova si può registrare, e con quali valori.
 *
 * Nessuna delle verifiche riguarda lo stato dell'azione **se non** per
 * escludere quelle archiviate o già chiuse dal coach: un'azione in pausa
 * accetta prove, perché mettere in pausa e poi riprovare è esattamente ciò che
 * la pausa deve permettere.
 */
export function planAttempt(params: {
  commitment: CommitmentForAttempt;
  path: PathState;
  athleteUserId: number;
  input: AttemptInput;
  now: Date;
}): AttemptDecision<PlannedAttempt> {
  const { commitment, path, athleteUserId, input } = params;

  if (commitment.owner !== 'athlete' || commitment.athleteUserId !== athleteUserId) {
    return refuse('NOT_YOUR_COMMITMENT');
  }
  if (commitment.archivedAt) return refuse('COMMITMENT_ARCHIVED');
  if (commitment.status === 'completed' || commitment.status === 'skipped') {
    return refuse('COMMITMENT_CLOSED');
  }
  /*
   * Il coach dell'azione e quello del percorso devono essere la stessa persona.
   *
   * Senza questo controllo, un identificativo di azione preso da un altro
   * percorso farebbe arrivare al destinatario sbagliato il testo di una prova
   * su un'azione concordata con qualcun altro.
   */
  if (
    path.coachUserId !== commitment.coachUserId ||
    path.athleteUserId !== commitment.athleteUserId
  ) {
    return refuse('PATH_MISMATCH');
  }

  const contribution = authorizeNewContribution({ path, athleteUserId });
  if (!contribution.allowed) {
    return refuse(
      contribution.reason === 'CONTRIBUTIONS_REVOKED'
        ? 'CONTRIBUTIONS_REVOKED'
        : contribution.reason === 'PATH_CLOSED'
          ? 'PATH_CLOSED'
          : 'NOT_YOUR_COMMITMENT'
    );
  }

  if (!isAttemptOutcome(input.outcome)) return refuse('INVALID_OUTCOME');

  const date = normalizeOccurredOn(input.occurredOn, params.now);
  if (!date.ok) return refuse(date.reason);

  const note = normalizeNote(input.note, MAX_ATTEMPT_NOTE_CHARS);
  if (!note.ok) return refuse('NOTE_TOO_LONG');

  if (typeof input.clientRequestId !== 'string' || !UUID.test(input.clientRequestId)) {
    return refuse('INVALID_REQUEST_ID');
  }

  return accept({
    commitmentId: commitment.id,
    athleteUserId,
    pathId: path.id,
    outcome: input.outcome,
    note: note.value,
    occurredOn: date.value,
    clientRequestId: input.clientRequestId.toLowerCase(),
  });
}

/** Una prova già scritta, per decidere se si può correggere. */
export type StoredAttempt = {
  id: number;
  commitmentId: number;
  athleteUserId: number;
  version: number;
  hiddenAt: Date | null;
};

export type PlannedAttemptEdit = {
  attemptId: number;
  /** La versione attesa: l'aggiornamento la usa nella clausola `where`. */
  expectedVersion: number;
  nextVersion: number;
  outcome: AttemptOutcome;
  note: string | null;
  occurredOn: string;
};

/**
 * Correggere una prova.
 *
 * **Sostituisce il testo, non ne conserva la storia.** Il coach vede il
 * contenuto corrente con l'indicazione «Modificato»: tenere le versioni
 * precedenti per non mostrarle sarebbe un archivio senza uno scopo dichiarato,
 * e su contenuti scritti spesso da minori un archivio così non si tiene.
 *
 * **Concorrenza.** `expectedVersion` è il gettone che il client ha letto.
 * L'aggiornamento lo mette nella clausola `where`: se nel frattempo un altro
 * dispositivo ha scritto, non trova la riga e la risposta è un conflitto — mai
 * una sovrascrittura silenziosa. Qui si verifica anche in anticipo, per dare
 * un messaggio invece di un errore di scrittura.
 */
export function planAttemptEdit(params: {
  attempt: StoredAttempt;
  actorUserId: number;
  expectedVersion: unknown;
  input: Omit<AttemptInput, 'clientRequestId'>;
  now: Date;
}): AttemptDecision<PlannedAttemptEdit> {
  const { attempt, actorUserId, input } = params;

  if (attempt.athleteUserId !== actorUserId) return refuse('NOT_YOUR_ATTEMPT');
  if (attempt.hiddenAt) return refuse('ATTEMPT_HIDDEN');

  if (
    typeof params.expectedVersion !== 'number' ||
    !Number.isInteger(params.expectedVersion) ||
    params.expectedVersion !== attempt.version
  ) {
    return refuse('VERSION_CONFLICT');
  }

  if (!isAttemptOutcome(input.outcome)) return refuse('INVALID_OUTCOME');

  const date = normalizeOccurredOn(input.occurredOn, params.now);
  if (!date.ok) return refuse(date.reason);

  const note = normalizeNote(input.note, MAX_ATTEMPT_NOTE_CHARS);
  if (!note.ok) return refuse('NOTE_TOO_LONG');

  return accept({
    attemptId: attempt.id,
    expectedVersion: attempt.version,
    nextVersion: attempt.version + 1,
    outcome: input.outcome,
    note: note.value,
    occurredOn: date.value,
  });
}

// ---------------------------------------------------------------------------
// Pausa
// ---------------------------------------------------------------------------

export type PlannedPause = { commitmentId: number; reason: string | null };
export type PlannedResume = { commitmentId: number };

/**
 * Mettere in pausa.
 *
 * **Non è una chiusura, e non è un abbandono.** Non tocca `status`, non tocca
 * `completed_at`, non tocca l'obiettivo del percorso. L'unica conseguenza è che
 * «Oggi» smette di proporla come azione principale: resta nell'elenco, con il
 * pulsante per riprenderla, e il coach la vede in preparazione.
 */
export function planPause(params: {
  commitment: CommitmentForAttempt;
  path: PathState;
  athleteUserId: number;
  reason?: unknown;
}): AttemptDecision<PlannedPause> {
  const guard = guardCommitmentForAthlete(params);
  if (!guard.ok) return guard as AttemptDecision<PlannedPause>;
  if (params.commitment.pausedAt) return refuse('ALREADY_PAUSED');

  const reason = normalizeNote(params.reason, MAX_PAUSE_REASON_CHARS);
  if (!reason.ok) return refuse('REASON_TOO_LONG');

  return accept({ commitmentId: params.commitment.id, reason: reason.value });
}

export function planResume(params: {
  commitment: CommitmentForAttempt;
  path: PathState;
  athleteUserId: number;
}): AttemptDecision<PlannedResume> {
  const guard = guardCommitmentForAthlete(params);
  if (!guard.ok) return guard as AttemptDecision<PlannedResume>;
  if (!params.commitment.pausedAt) return refuse('NOT_PAUSED');
  return accept({ commitmentId: params.commitment.id });
}

function guardCommitmentForAthlete(params: {
  commitment: CommitmentForAttempt;
  path: PathState;
  athleteUserId: number;
}): AttemptDecision<true> {
  const { commitment, path, athleteUserId } = params;
  if (commitment.owner !== 'athlete' || commitment.athleteUserId !== athleteUserId) {
    return refuse('NOT_YOUR_COMMITMENT');
  }
  if (commitment.archivedAt) return refuse('COMMITMENT_ARCHIVED');
  if (commitment.status === 'completed' || commitment.status === 'skipped') {
    return refuse('COMMITMENT_CLOSED');
  }
  if (
    path.coachUserId !== commitment.coachUserId ||
    path.athleteUserId !== commitment.athleteUserId
  ) {
    return refuse('PATH_MISMATCH');
  }
  if (path.status !== 'active') return refuse('PATH_CLOSED');
  if (path.contributionsRevokedAt) return refuse('CONTRIBUTIONS_REVOKED');
  return accept(true);
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/**
 * Cosa finisce nel registro quando si scrive una prova.
 *
 * **Mai il testo**, né quello nuovo né quello sostituito: identificativi,
 * esito, versione e un booleano che dice soltanto *se* una nota c'era. È la
 * regola già scritta in `pipeline-log.ts`, e qui conta doppio perché la nota è
 * scritta da chi si allena, spesso minorenne.
 *
 * È una funzione, e non un oggetto costruito nel punto in cui si scrive,
 * proprio per poterla mettere sotto test: il test guarda i valori prodotti e
 * fallisce se uno di essi contiene il testo della nota.
 */
export function attemptAuditDetail(params: {
  attemptId: number;
  commitmentId: number;
  pathId: number;
  outcome: AttemptOutcome;
  version: number;
  note: string | null;
}): Record<string, string | number | boolean> {
  return {
    attemptId: params.attemptId,
    commitmentId: params.commitmentId,
    pathId: params.pathId,
    outcome: params.outcome,
    version: params.version,
    hasNote: params.note !== null,
  };
}

// ---------------------------------------------------------------------------
// Lettura
// ---------------------------------------------------------------------------

/** Una prova come la leggono l'atleta e il coach: stesso contenuto, stesso ordine. */
export type AttemptView = {
  id: number;
  outcome: AttemptOutcome;
  outcomeLabel: string;
  note: string | null;
  occurredOn: string;
  /** Vero quando è stata corretta dopo la scrittura. */
  edited: boolean;
  version: number;
};

export type AttemptRow = {
  id: number;
  outcome: string;
  note: string | null;
  occurredOn: string;
  version: number;
  editedAt: Date | null;
  hiddenAt: Date | null;
  createdDate: Date;
};

/**
 * Dalle righe alla vista: nascoste fuori, ordine cronologico, esito già in
 * italiano.
 *
 * L'ordine è **crescente** perché il coach le legge come una sequenza — prima
 * l'allenamento, poi la partita — e non come una cronologia di notifiche.
 */
export function toAttemptViews(rows: readonly AttemptRow[]): AttemptView[] {
  return rows
    .filter((row) => !row.hiddenAt && isAttemptOutcome(row.outcome))
    .slice()
    .sort((left, right) => {
      if (left.occurredOn !== right.occurredOn) {
        return left.occurredOn < right.occurredOn ? -1 : 1;
      }
      return left.createdDate.getTime() - right.createdDate.getTime();
    })
    .map((row) => ({
      id: row.id,
      outcome: row.outcome as AttemptOutcome,
      outcomeLabel: ATTEMPT_OUTCOME_LABELS[row.outcome as AttemptOutcome],
      note: row.note,
      occurredOn: row.occurredOn,
      edited: row.editedAt !== null,
      version: row.version,
    }));
}

// ---------------------------------------------------------------------------

type Normalized<T> = { ok: true; value: T } | { ok: false; reason: AttemptRefusal };

function normalizeNote(
  note: unknown,
  max: number
): Normalized<string | null> {
  if (note === undefined || note === null) return { ok: true, value: null };
  if (typeof note !== 'string') return { ok: false, reason: 'NOTE_TOO_LONG' };
  const trimmed = note.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false, reason: 'NOTE_TOO_LONG' };
  return { ok: true, value: trimmed };
}

/**
 * La data dichiarata dall'atleta, verificata contro il giorno di oggi.
 *
 * Il confronto è fra stringhe «AAAA-MM-GG», non fra istanti: un `Date`
 * costruito da una data senza ora vive a mezzanotte UTC, e in Italia da fine
 * marzo a fine ottobre quella mezzanotte è già il giorno prima. Confrontare
 * testo con testo toglie di mezzo il fuso orario invece di doverlo indovinare.
 */
function normalizeOccurredOn(value: unknown, now: Date): Normalized<string> {
  if (typeof value !== 'string' || !CALENDAR_DATE.test(value)) {
    return { ok: false, reason: 'INVALID_DATE' };
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) return { ok: false, reason: 'INVALID_DATE' };

  const today = romeCalendarDay(now);
  if (value > today) return { ok: false, reason: 'FUTURE_DATE' };

  const earliest = Date.parse(`${today}T00:00:00Z`) -
    MAX_ATTEMPT_BACKDATE_DAYS * 86_400_000;
  if (parsed < earliest) return { ok: false, reason: 'TOO_OLD' };

  return { ok: true, value };
}

/**
 * Che giorno è, in Italia.
 *
 * Riusa `formatRomeDateValue`, che nel repository fa già esattamente questo: il
 * prodotto vive su un fuso solo, e una seconda funzione che risponde alla
 * stessa domanda è il modo in cui due parti dell'applicazione finiscono per
 * dire due giorni diversi. Una prova segnata alle 23:30 di sabato resta di
 * sabato anche se il server sta a Londra.
 */
export function romeCalendarDay(now: Date): string {
  return formatRomeDateValue(now);
}
