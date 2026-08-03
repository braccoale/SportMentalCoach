/**
 * Follow-through degli impegni concordati in sessione.
 *
 * Un impegno smette di essere testo dentro il JSON del report nel momento in
 * cui il coach approva: da lì vive come entità con stato proprio, mentre il
 * report approvato resta immutabile. Il modulo è puro rispetto
 * all'infrastruttura e lavora su uno store iniettato.
 */

import { createHash } from 'node:crypto';
import type {
  Commitment,
  CommitmentStatus,
  CompassSpeaker,
  SessionCompassReport,
} from './session-compass-contract';

export type CommitmentOwner = CompassSpeaker;

export const TRACKED_COMMITMENT_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'skipped',
] as const;
export type TrackedCommitmentStatus = (typeof TRACKED_COMMITMENT_STATUSES)[number];

export type TrackedCommitment = {
  id: number;
  sessionId: number;
  sourceReportId: number;
  sourceReportVersion: number;
  athleteUserId: number;
  coachUserId: number;
  commitmentKey: string;
  title: string;
  owner: CommitmentOwner;
  status: TrackedCommitmentStatus;
  dueDate: string | null;
  completedAt: Date | null;
  athleteNote: string | null;
  sourceTranscriptSegmentId: number | null;
  sourceTimestampMs: number;
  sourceExcerpt: string;
  manuallyEdited: boolean;
  archivedAt: Date | null;
};

/**
 * Proiezione per l'atleta. È un tipo separato, non un sottoinsieme opzionale,
 * perché l'estratto del transcript e il resto del Compass non devono avere
 * alcun percorso verso la UI atleta.
 */
export type AthleteCommitmentView = {
  id: number;
  title: string;
  status: TrackedCommitmentStatus;
  dueDate: string | null;
  completedAt: string | null;
  athleteNote: string | null;
  coachName: string;
  bookingId: number;
  sessionDate: string | null;
};

export type AthleteCommitmentSource = TrackedCommitment & {
  coachName: string;
  bookingId: number;
  sessionDate: Date | null;
};

export type NewTrackedCommitment = {
  sessionId: number;
  sourceReportId: number;
  sourceReportVersion: number;
  athleteUserId: number;
  coachUserId: number;
  commitmentKey: string;
  title: string;
  owner: CommitmentOwner;
  status: TrackedCommitmentStatus;
  /**
   * Invariante condivisa con il database: `completed` implica `completedAt`.
   * Il coach può portare un impegno a "fatto" già nella bozza, quindi la
   * sincronizzazione deve valorizzare l'istante, non lasciarlo nullo.
   */
  completedAt: Date | null;
  dueDate: string | null;
  sourceTranscriptSegmentId: number;
  sourceTimestampMs: number;
  sourceExcerpt: string;
};

export type TrackedCommitmentChanges = {
  sourceReportId?: number;
  sourceReportVersion?: number;
  title?: string;
  owner?: CommitmentOwner;
  status?: TrackedCommitmentStatus;
  dueDate?: string | null;
  completedAt?: Date | null;
  athleteNote?: string | null;
  sourceTranscriptSegmentId?: number;
  sourceTimestampMs?: number;
  sourceExcerpt?: string;
  manuallyEdited?: boolean;
  archivedAt?: Date | null;
};

export type CommitmentSyncPlan = {
  inserts: NewTrackedCommitment[];
  updates: Array<{ id: number; changes: TrackedCommitmentChanges }>;
  archives: number[];
};

export type CommitmentAuditEvent =
  | 'commitment_synced'
  | 'commitment_archived'
  | 'commitment_updated_by_coach'
  | 'commitment_updated_by_athlete';

export interface SessionCommitmentStore {
  listBySession(sessionId: number): Promise<TrackedCommitment[]>;
  listForAthlete(athleteUserId: number): Promise<AthleteCommitmentSource[]>;
  loadById(commitmentId: number): Promise<TrackedCommitment | null>;
  applySync(plan: CommitmentSyncPlan, actorUserId: number): Promise<void>;
  update(
    commitmentId: number,
    changes: TrackedCommitmentChanges,
    actorUserId: number
  ): Promise<TrackedCommitment>;
  recordAudit(params: {
    sessionId: number;
    actorUserId: number;
    eventType: CommitmentAuditEvent;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export type SessionCommitmentErrorCode =
  | 'COMMITMENT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATUS'
  | 'COMMITMENT_ARCHIVED';

export class SessionCommitmentError extends Error {
  constructor(
    public readonly code: SessionCommitmentErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'SessionCommitmentError';
  }
}

/**
 * Identità stabile di un impegno fra versioni successive del report. È
 * derivata dall'evidenza, non dal testo: se il coach riscrive l'impegno resta
 * lo stesso impegno.
 */
export function commitmentKey(commitment: Commitment): string {
  const quote = commitment.evidence.quote
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256')
    .update(`${commitment.evidence.transcriptSegmentId}|${quote}`)
    .digest('hex');
}

/** Il Compass parla di `done`/`dropped`, il follow-through di stati operativi. */
export function trackedStatusFrom(status: CommitmentStatus): TrackedCommitmentStatus {
  if (status === 'done') return 'completed';
  if (status === 'dropped') return 'skipped';
  return status;
}

/** Uno stato raggiunto o deciso non viene più riscritto da una bozza AI. */
export function isProtectedFromSync(commitment: TrackedCommitment): boolean {
  return (
    commitment.manuallyEdited ||
    commitment.status === 'completed' ||
    commitment.status === 'skipped'
  );
}

/**
 * Calcola la sincronizzazione di un report approvato. È deliberatamente una
 * funzione pura: l'idempotenza e la protezione delle modifiche umane sono
 * verificabili senza database.
 */
export function planCommitmentSync(params: {
  document: SessionCompassReport;
  existing: readonly TrackedCommitment[];
  report: { id: number; version: number };
  session: { sessionId: number; athleteUserId: number; coachUserId: number };
  now: Date;
}): CommitmentSyncPlan {
  const plan: CommitmentSyncPlan = { inserts: [], updates: [], archives: [] };
  const byKey = new Map(params.existing.map((item) => [item.commitmentKey, item]));
  const seen = new Set<string>();

  for (const commitment of params.document.commitments) {
    const key = commitmentKey(commitment);
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = byKey.get(key);
    const evidence = commitment.evidence;

    if (!existing) {
      const status = trackedStatusFrom(commitment.status);
      plan.inserts.push({
        sessionId: params.session.sessionId,
        sourceReportId: params.report.id,
        sourceReportVersion: params.report.version,
        athleteUserId: params.session.athleteUserId,
        coachUserId: params.session.coachUserId,
        commitmentKey: key,
        title: commitment.text,
        owner: commitment.owner,
        status,
        completedAt: status === 'completed' ? params.now : null,
        dueDate: commitment.dueDate,
        sourceTranscriptSegmentId: evidence.transcriptSegmentId,
        sourceTimestampMs: evidence.startMs,
        sourceExcerpt: evidence.quote,
      });
      continue;
    }

    // La tracciabilità al report più recente vale sempre; il contenuto solo
    // quando nessuna decisione umana lo ha già toccato. Lo stato operativo non
    // viene mai riscritto dal report.
    const changes: TrackedCommitmentChanges = {
      sourceReportId: params.report.id,
      sourceReportVersion: params.report.version,
      ...(existing.archivedAt ? { archivedAt: null } : {}),
    };
    if (!isProtectedFromSync(existing)) {
      changes.title = commitment.text;
      changes.owner = commitment.owner;
      changes.dueDate = commitment.dueDate;
      changes.sourceTranscriptSegmentId = evidence.transcriptSegmentId;
      changes.sourceTimestampMs = evidence.startMs;
      changes.sourceExcerpt = evidence.quote;
    }
    if (hasEffect(existing, changes)) {
      plan.updates.push({ id: existing.id, changes });
    }
  }

  for (const existing of params.existing) {
    if (seen.has(existing.commitmentKey)) continue;
    if (existing.archivedAt || isProtectedFromSync(existing)) continue;
    plan.archives.push(existing.id);
  }

  return plan;
}

export function isEmptySyncPlan(plan: CommitmentSyncPlan): boolean {
  return !plan.inserts.length && !plan.updates.length && !plan.archives.length;
}

/** Applica il piano allo store e lascia traccia audit di ogni scrittura. */
export async function syncApprovedCommitments(params: {
  document: SessionCompassReport;
  report: { id: number; version: number };
  session: { sessionId: number; athleteUserId: number; coachUserId: number };
  actorUserId: number;
  store: SessionCommitmentStore;
  now: Date;
}): Promise<CommitmentSyncPlan> {
  const existing = await params.store.listBySession(params.session.sessionId);
  const plan = planCommitmentSync({
    document: params.document,
    existing,
    report: params.report,
    session: params.session,
    now: params.now,
  });
  if (isEmptySyncPlan(plan)) return plan;

  await params.store.applySync(plan, params.actorUserId);
  await params.store.recordAudit({
    sessionId: params.session.sessionId,
    actorUserId: params.actorUserId,
    eventType: 'commitment_synced',
    metadata: {
      reportId: params.report.id,
      reportVersion: params.report.version,
      inserted: plan.inserts.length,
      updated: plan.updates.length,
      archived: plan.archives.length,
    },
  });
  if (plan.archives.length) {
    await params.store.recordAudit({
      sessionId: params.session.sessionId,
      actorUserId: params.actorUserId,
      eventType: 'commitment_archived',
      metadata: { commitmentIds: plan.archives },
    });
  }
  return plan;
}

export async function listSessionCommitmentsForCoach(
  params: { sessionId: number; store: SessionCommitmentStore }
): Promise<TrackedCommitment[]> {
  const commitments = await params.store.listBySession(params.sessionId);
  return commitments.filter((commitment) => !commitment.archivedAt);
}

/**
 * "I tuoi prossimi passi": solo gli impegni di cui l'atleta è owner, ordinati
 * per scadenza e poi per sessione più recente.
 */
export async function listAthleteCommitments(params: {
  athleteUserId: number;
  store: SessionCommitmentStore;
}): Promise<AthleteCommitmentView[]> {
  const rows = await params.store.listForAthlete(params.athleteUserId);
  return sortAthleteCommitments(
    rows.filter(
      (row) =>
        row.owner === 'athlete' &&
        row.athleteUserId === params.athleteUserId &&
        !row.archivedAt
    )
  ).map(athleteView);
}

export function sortAthleteCommitments(
  rows: readonly AthleteCommitmentSource[]
): AthleteCommitmentSource[] {
  return rows.slice().sort((left, right) => {
    const openness = openFirst(left) - openFirst(right);
    if (openness !== 0) return openness;
    const due = dueOrder(left.dueDate) - dueOrder(right.dueDate);
    if (due !== 0) return due;
    return sessionOrder(right) - sessionOrder(left);
  });
}

/** L'atleta dichiara l'esito; la nota è ammessa solo quando non ci è riuscito. */
export async function recordAthleteCommitmentOutcome(params: {
  commitmentId: number;
  actorUserId: number;
  status: 'completed' | 'skipped';
  note?: string;
  store: SessionCommitmentStore;
  now: () => Date;
}): Promise<TrackedCommitment> {
  if (params.status !== 'completed' && params.status !== 'skipped') {
    throw new SessionCommitmentError('INVALID_STATUS', 'Stato non consentito.');
  }
  const commitment = await requireCommitment(params.commitmentId, params.store);
  if (commitment.owner !== 'athlete' || commitment.athleteUserId !== params.actorUserId) {
    throw new SessionCommitmentError(
      'FORBIDDEN',
      'Non sei autorizzato ad aggiornare questo impegno.'
    );
  }
  if (commitment.archivedAt) {
    throw new SessionCommitmentError('COMMITMENT_ARCHIVED', 'Questo impegno non è più attivo.');
  }

  const note = params.status === 'skipped' ? trimmedNote(params.note) : null;
  const updated = await params.store.update(
    commitment.id,
    {
      status: params.status,
      completedAt: params.status === 'completed' ? params.now() : null,
      athleteNote: note,
    },
    params.actorUserId
  );
  await params.store.recordAudit({
    sessionId: commitment.sessionId,
    actorUserId: params.actorUserId,
    eventType: 'commitment_updated_by_athlete',
    metadata: { commitmentId: commitment.id, status: params.status, hasNote: note !== null },
  });
  return updated;
}

/** Una modifica del coach prevale sulla bozza AI e lo dichiara nel dato. */
export async function updateCommitmentByCoach(params: {
  commitmentId: number;
  sessionId: number;
  actorUserId: number;
  title?: string;
  owner?: CommitmentOwner;
  status?: TrackedCommitmentStatus;
  dueDate?: string | null;
  store: SessionCommitmentStore;
  now: () => Date;
}): Promise<TrackedCommitment> {
  const commitment = await requireCommitment(params.commitmentId, params.store);
  if (commitment.sessionId !== params.sessionId) {
    throw new SessionCommitmentError('COMMITMENT_NOT_FOUND', 'Impegno non trovato per questa sessione.');
  }
  if (params.status !== undefined && !TRACKED_COMMITMENT_STATUSES.includes(params.status)) {
    throw new SessionCommitmentError('INVALID_STATUS', 'Stato non consentito.');
  }
  if (params.dueDate !== undefined && params.dueDate !== null && !isCalendarDate(params.dueDate)) {
    throw new SessionCommitmentError('INVALID_STATUS', 'La scadenza deve essere una data valida.');
  }

  const title = params.title?.trim();
  const changes: TrackedCommitmentChanges = {
    ...(title ? { title: title.slice(0, 1000) } : {}),
    ...(params.owner ? { owner: params.owner } : {}),
    ...(params.dueDate === undefined ? {} : { dueDate: params.dueDate }),
    ...(params.status === undefined
      ? {}
      : {
          status: params.status,
          completedAt: params.status === 'completed' ? params.now() : null,
        }),
    manuallyEdited: true,
  };
  const updated = await params.store.update(commitment.id, changes, params.actorUserId);
  await params.store.recordAudit({
    sessionId: commitment.sessionId,
    actorUserId: params.actorUserId,
    eventType: 'commitment_updated_by_coach',
    metadata: { commitmentId: commitment.id, fields: Object.keys(changes) },
  });
  return updated;
}

async function requireCommitment(
  commitmentId: number,
  store: SessionCommitmentStore
): Promise<TrackedCommitment> {
  const commitment = await store.loadById(commitmentId);
  if (!commitment) {
    throw new SessionCommitmentError('COMMITMENT_NOT_FOUND', 'Impegno non trovato.');
  }
  return commitment;
}

function athleteView(row: AthleteCommitmentSource): AthleteCommitmentView {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    dueDate: row.dueDate,
    completedAt: row.completedAt?.toISOString() ?? null,
    athleteNote: row.athleteNote,
    coachName: row.coachName,
    bookingId: row.bookingId,
    sessionDate: row.sessionDate?.toISOString() ?? null,
  };
}

/** Gli impegni ancora aperti vengono prima di quelli chiusi. */
function openFirst(row: AthleteCommitmentSource): number {
  return row.status === 'completed' || row.status === 'skipped' ? 1 : 0;
}

function dueOrder(dueDate: string | null): number {
  return dueDate ? Date.parse(`${dueDate}T00:00:00Z`) : Number.MAX_SAFE_INTEGER;
}

function sessionOrder(row: AthleteCommitmentSource): number {
  return row.sessionDate?.getTime() ?? row.sessionId;
}

function trimmedNote(note: string | undefined): string | null {
  const value = note?.trim();
  return value ? value.slice(0, 1000) : null;
}

function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function hasEffect(
  existing: TrackedCommitment,
  changes: TrackedCommitmentChanges
): boolean {
  return Object.entries(changes).some(([field, value]) => {
    const current = existing[field as keyof TrackedCommitment];
    if (current instanceof Date || value instanceof Date) {
      return (current as Date | null)?.getTime() !== (value as Date | null)?.getTime();
    }
    return current !== value;
  });
}
