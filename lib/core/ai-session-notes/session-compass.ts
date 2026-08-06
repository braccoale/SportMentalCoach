/**
 * Session Compass v1 — orchestrazione versionata e idempotente.
 *
 * Il modulo è puro rispetto all'infrastruttura: parla con un `SessionCompassStore`
 * iniettato, così le regole (idempotenza, conservazione della nota del coach,
 * immutabilità del report approvato) sono testabili senza database.
 */

import { createHash } from 'node:crypto';
import {
  SESSION_COMPASS_REPORT_KIND,
  SESSION_COMPASS_SCHEMA_VERSION,
  type Commitment,
  type CommitmentStatus,
  type CompassSourceSegment,
  type CompassSpeaker,
  type SessionCompassReport,
} from './session-compass-contract';
import {
  authorizeSessionCompass,
  canEditCoachNote,
  type SessionCompassAction,
  type SessionCompassAuthorizationResult,
} from './session-compass-authorization';
import {
  listSessionCommitmentsForCoach,
  syncApprovedCommitments,
  updateCommitmentByCoach,
  type SessionCommitmentStore,
  type TrackedCommitment,
  type TrackedCommitmentStatus,
} from './session-commitments';
import {
  generateValidatedSessionCompassReport,
  type SessionCompassContext,
  type SessionCompassPreviousReport,
  type SessionCompassReportProvider,
} from './session-compass-provider';

export const SESSION_COMPASS_STATUSES = [
  'generating',
  'ready_for_review',
  'approved',
  'failed',
] as const;
export type SessionCompassStatus = (typeof SESSION_COMPASS_STATUSES)[number];

export type SessionCompassSessionSource = {
  sessionId: number;
  coachUserId: number;
  athleteUserId: number;
  sessionStatus: string;
  language: string;
  coachName: string;
  coachRole: string;
  athleteSport: string | null;
  pathGoal: string | null;
};

export type StoredSessionCompassReport = {
  id: number;
  sessionId: number;
  reportKind: string;
  reportVersion: number;
  status: SessionCompassStatus;
  sourceFingerprint: string | null;
  promptVersion: string | null;
  generatedReport: SessionCompassReport | null;
  coachEditedReport: SessionCompassReport | null;
  coachNote: string | null;
  approvedBy: number | null;
  approvedAt: Date | null;
  errorCode: string | null;
  updatedDate: Date;
};

export type InsertSessionCompassReport = {
  sessionId: number;
  reportVersion: number;
  status: SessionCompassStatus;
  sourceFingerprint: string;
  promptVersion: string;
  generatedReport: SessionCompassReport | null;
  coachEditedReport: SessionCompassReport | null;
  coachNote: string | null;
  actorUserId: number;
};

export type UpdateSessionCompassReport = {
  reportId: number;
  status?: SessionCompassStatus;
  sourceFingerprint?: string;
  promptVersion?: string;
  generatedReport?: SessionCompassReport | null;
  coachEditedReport?: SessionCompassReport | null;
  coachNote?: string | null;
  approvedBy?: number | null;
  approvedAt?: Date | null;
  errorCode?: string | null;
  actorUserId: number;
};

export type SessionCompassAuditEvent =
  | 'compass_report_generated'
  | 'compass_report_regenerated'
  | 'compass_report_approved'
  | 'compass_report_failed'
  | 'compass_note_updated'
  | 'compass_commitment_updated';

export interface SessionCompassStore {
  loadSession(sessionId: number): Promise<SessionCompassSessionSource | null>;
  loadTimeline(sessionId: number): Promise<CompassSourceSegment[]>;
  loadLatestReport(sessionId: number): Promise<StoredSessionCompassReport | null>;
  loadPreviousApprovedReports(params: {
    coachUserId: number;
    athleteUserId: number;
    excludeSessionId: number;
    limit: number;
  }): Promise<SessionCompassPreviousReport[]>;
  insertReport(input: InsertSessionCompassReport): Promise<StoredSessionCompassReport>;
  updateReport(input: UpdateSessionCompassReport): Promise<StoredSessionCompassReport>;
  recordAudit(params: {
    sessionId: number;
    actorUserId: number;
    eventType: SessionCompassAuditEvent;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export type SessionCompassDependencies = {
  store: SessionCompassStore;
  commitments: SessionCommitmentStore;
  createProvider: () => SessionCompassReportProvider;
  promptVersion: string;
  sourceFingerprint: (segments: readonly CompassSourceSegment[]) => string;
  isAdmin: (actorUserId: number) => Promise<boolean>;
  hasFeatureAccess: (actorUserId: number) => Promise<boolean>;
  now: () => Date;
};

export type SessionCompassErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'FEATURE_NOT_ENABLED'
  | 'SESSION_NOT_ELIGIBLE'
  | 'TRANSCRIPT_UNAVAILABLE'
  | 'REPORT_NOT_FOUND'
  | 'REPORT_APPROVED_IMMUTABLE'
  | 'COMMITMENT_NOT_FOUND'
  | 'COMPASS_UNAVAILABLE'
  | 'COMPASS_TIMEOUT'
  | 'COMPASS_RATE_LIMITED'
  | 'COMPASS_INVALID'
  | 'COMPASS_FAILED';

export class SessionCompassError extends Error {
  constructor(
    public readonly code: SessionCompassErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'SessionCompassError';
  }
}

export type SessionCompassView = {
  reportId: number;
  sessionId: number;
  reportVersion: number;
  status: SessionCompassStatus;
  sourceFingerprint: string | null;
  isApproved: boolean;
  isStale: boolean;
  approvedAt: string | null;
  errorCode: string | null;
  updatedAt: string;
  document: SessionCompassReport | null;
  canEditCoachNote: boolean;
  /**
   * Stato reale degli impegni dopo l'approvazione. Un report in bozza non ne
   * ha ancora: gli impegni diventano operativi solo con l'approvazione.
   */
  trackedCommitments: TrackedCommitment[];
};

/**
 * Stati in cui una bozza si può produrre.
 *
 * `processing` è il primo: è lo stato in cui la trascrizione esiste e il
 * report non ancora, cioè esattamente il momento in cui la bozza va generata.
 * Pretendere `ready_for_review` era un vicolo cieco — a quello stato si arriva
 * solo *generando* la bozza, quindi non se ne generava mai una e il pulsante
 * rispondeva "disponibile quando la trascrizione è pronta" anche con la
 * trascrizione sotto gli occhi.
 */
const ELIGIBLE_SESSION_STATUSES = [
  'processing',
  'ready_for_review',
  'approved',
  'shared',
];

/**
 * Fingerprint dell'intelligence sorgente. Copre il contenuto della timeline e
 * la versione del contratto: una bozza è rigenerabile solo quando questo
 * valore, o la versione prompt, cambia.
 */
export function compassSourceFingerprint(
  segments: readonly CompassSourceSegment[]
): string {
  const payload = segments
    .slice()
    .sort((left, right) => left.transcriptSegmentId - right.transcriptSegmentId)
    .map((segment) =>
      [segment.transcriptSegmentId, segment.startMs, segment.endMs, segment.speaker, segment.text].join('|')
    )
    .join('\n');
  return createHash('sha256')
    .update(`${SESSION_COMPASS_REPORT_KIND}:${SESSION_COMPASS_SCHEMA_VERSION}\n${payload}`)
    .digest('hex');
}

/** Il documento mostrato al coach: bozza AI con sopra le sue modifiche. */
export function effectiveDocument(
  stored: StoredSessionCompassReport
): SessionCompassReport | null {
  const base = stored.coachEditedReport ?? stored.generatedReport;
  if (!base) return null;
  return { ...structuredClone(base), coachNote: stored.coachNote };
}

export async function getSessionCompass(
  params: { sessionId: number; actorUserId: number },
  dependencies: SessionCompassDependencies
): Promise<SessionCompassView | null> {
  const { session, authorization } = await authorizedSession(params, 'read', dependencies);
  const stored = await dependencies.store.loadLatestReport(session.sessionId);
  if (!stored) return null;
  return viewOf(stored, authorization, await currentFingerprint(session.sessionId, dependencies), dependencies);
}

/** Timeline leggibile dal coach, con gli stessi id citati dalle evidenze. */
export async function getSessionCompassTranscript(
  params: { sessionId: number; actorUserId: number },
  dependencies: SessionCompassDependencies
): Promise<CompassSourceSegment[]> {
  const { session } = await authorizedSession(params, 'read', dependencies);
  return dependencies.store.loadTimeline(session.sessionId);
}

/**
 * Idempotente: rigenera solo se non esiste una bozza per il fingerprint e la
 * versione prompt correnti. Se l'ultimo report è approvato, apre una nuova
 * versione bozza invece di modificarlo.
 */
export async function ensureSessionCompassDraft(
  params: { sessionId: number; actorUserId: number },
  dependencies: SessionCompassDependencies
): Promise<{ view: SessionCompassView; regenerated: boolean; reason: 'created' | 'up_to_date' | 'new_version' | 'refreshed' }> {
  const { session, authorization } = await authorizedSession(params, 'regenerate', dependencies);
  const segments = await eligibleTimeline(session, dependencies);
  const fingerprint = dependencies.sourceFingerprint(segments);
  const promptVersion = requiredPromptVersion(dependencies);
  const latest = await dependencies.store.loadLatestReport(session.sessionId);

  if (
    latest &&
    latest.status !== 'approved' &&
    latest.status !== 'failed' &&
    latest.sourceFingerprint === fingerprint &&
    latest.promptVersion === promptVersion &&
    latest.generatedReport
  ) {
    return {
      view: await viewOf(latest, authorization, fingerprint, dependencies),
      regenerated: false,
      reason: 'up_to_date',
    };
  }

  const opensNewVersion = !latest || latest.status === 'approved';
  const document = await generateDocument(
    { session, segments, fingerprint, promptVersion, previous: latest },
    dependencies
  );

  const preserved = latest ? preservedCoachEdits(latest, document) : null;
  const coachNote = latest?.coachNote ?? null;

  const saved = opensNewVersion
    ? await dependencies.store.insertReport({
        sessionId: session.sessionId,
        reportVersion: (latest?.reportVersion ?? 0) + 1,
        status: 'ready_for_review',
        sourceFingerprint: fingerprint,
        promptVersion,
        generatedReport: document,
        coachEditedReport: preserved,
        coachNote,
        actorUserId: params.actorUserId,
      })
    : await dependencies.store.updateReport({
        reportId: latest!.id,
        status: 'ready_for_review',
        sourceFingerprint: fingerprint,
        promptVersion,
        generatedReport: document,
        coachEditedReport: preserved,
        coachNote,
        errorCode: null,
        actorUserId: params.actorUserId,
      });

  await dependencies.store.recordAudit({
    sessionId: session.sessionId,
    actorUserId: params.actorUserId,
    eventType: latest ? 'compass_report_regenerated' : 'compass_report_generated',
    metadata: {
      reportId: saved.id,
      reportVersion: saved.reportVersion,
      sourceFingerprint: fingerprint,
      promptVersion,
    },
  });

  return {
    view: await viewOf(saved, authorization, fingerprint, dependencies),
    regenerated: true,
    reason: !latest ? 'created' : opensNewVersion ? 'new_version' : 'refreshed',
  };
}

/** La nota del coach non è mai prodotta né sovrascritta dall'AI. */
export async function saveCoachNote(
  params: { sessionId: number; actorUserId: number; coachNote: string },
  dependencies: SessionCompassDependencies
): Promise<SessionCompassView> {
  const { session, authorization } = await authorizedSession(params, 'write', dependencies);
  if (!canEditCoachNote(authorization)) {
    throw new SessionCompassError('FORBIDDEN', 'Solo il coach della sessione può modificare la nota.');
  }
  const stored = await requireReport(session.sessionId, dependencies);
  const coachNote = params.coachNote.trim() ? params.coachNote.slice(0, 8000) : null;
  const saved = await dependencies.store.updateReport({
    reportId: stored.id,
    coachNote,
    actorUserId: params.actorUserId,
  });
  await dependencies.store.recordAudit({
    sessionId: session.sessionId,
    actorUserId: params.actorUserId,
    eventType: 'compass_note_updated',
    metadata: { reportId: stored.id, reportVersion: stored.reportVersion },
  });
  return viewOf(saved, authorization, await currentFingerprint(session.sessionId, dependencies), dependencies);
}

export async function updateCommitment(
  params: {
    sessionId: number;
    actorUserId: number;
    commitmentId: string;
    text?: string;
    owner?: CompassSpeaker;
    status?: CommitmentStatus;
  },
  dependencies: SessionCompassDependencies
): Promise<SessionCompassView> {
  const { session, authorization } = await authorizedSession(params, 'write', dependencies);
  const stored = await requireReport(session.sessionId, dependencies);
  if (stored.status === 'approved') {
    throw new SessionCompassError(
      'REPORT_APPROVED_IMMUTABLE',
      'Il report è approvato: rigenera una nuova bozza per modificarlo.'
    );
  }
  const document = effectiveDocument(stored);
  if (!document) {
    throw new SessionCompassError('REPORT_NOT_FOUND', 'Il report non è ancora disponibile.');
  }
  const index = document.commitments.findIndex((item) => item.id === params.commitmentId);
  if (index === -1) {
    throw new SessionCompassError('COMMITMENT_NOT_FOUND', 'Impegno non trovato nel report.');
  }
  const current = document.commitments[index];
  const commitments = [...document.commitments];
  commitments[index] = {
    ...current,
    text: params.text?.trim() ? params.text.trim().slice(0, 1000) : current.text,
    owner: params.owner ?? current.owner,
    status: params.status ?? current.status,
  };
  const saved = await dependencies.store.updateReport({
    reportId: stored.id,
    coachEditedReport: { ...document, commitments, coachNote: null },
    actorUserId: params.actorUserId,
  });
  await dependencies.store.recordAudit({
    sessionId: session.sessionId,
    actorUserId: params.actorUserId,
    eventType: 'compass_commitment_updated',
    metadata: { reportId: stored.id, commitmentId: params.commitmentId },
  });
  return viewOf(saved, authorization, await currentFingerprint(session.sessionId, dependencies), dependencies);
}

/**
 * Modifica di un impegno già operativo. Passa dalla stessa autorizzazione del
 * Compass, ma scrive sull'entità dedicata: il report approvato resta intatto.
 */
export async function updateTrackedCommitmentAsCoach(
  params: {
    sessionId: number;
    actorUserId: number;
    commitmentId: number;
    title?: string;
    owner?: CompassSpeaker;
    status?: TrackedCommitmentStatus;
    dueDate?: string | null;
  },
  dependencies: SessionCompassDependencies
): Promise<SessionCompassView> {
  const { session, authorization } = await authorizedSession(params, 'write', dependencies);
  await updateCommitmentByCoach({
    commitmentId: params.commitmentId,
    sessionId: session.sessionId,
    actorUserId: params.actorUserId,
    title: params.title,
    owner: params.owner,
    status: params.status,
    dueDate: params.dueDate,
    store: dependencies.commitments,
    now: dependencies.now,
  });
  const stored = await requireReport(session.sessionId, dependencies);
  return viewOf(stored, authorization, await currentFingerprint(session.sessionId, dependencies), dependencies);
}

/**
 * L'approvazione è il momento in cui gli impegni diventano operativi: da qui
 * vivono in `session_ai_commitments`. La sincronizzazione è idempotente, quindi
 * una seconda approvazione non duplica nulla.
 */
export async function approveSessionCompass(
  params: { sessionId: number; actorUserId: number },
  dependencies: SessionCompassDependencies
): Promise<SessionCompassView> {
  const { session, authorization } = await authorizedSession(params, 'approve', dependencies);
  const stored = await requireReport(session.sessionId, dependencies);
  const document = effectiveDocument(stored);
  if (!document) {
    throw new SessionCompassError('REPORT_NOT_FOUND', 'Il report non è ancora disponibile.');
  }

  const alreadyApproved = stored.status === 'approved';
  const now = dependencies.now();
  const saved = alreadyApproved
    ? stored
    : await dependencies.store.updateReport({
        reportId: stored.id,
        status: 'approved',
        approvedBy: params.actorUserId,
        approvedAt: now,
        actorUserId: params.actorUserId,
      });
  if (!alreadyApproved) {
    await dependencies.store.recordAudit({
      sessionId: session.sessionId,
      actorUserId: params.actorUserId,
      eventType: 'compass_report_approved',
      metadata: { reportId: stored.id, reportVersion: stored.reportVersion },
    });
  }

  await syncApprovedCommitments({
    document,
    report: { id: stored.id, version: stored.reportVersion },
    session: {
      sessionId: session.sessionId,
      athleteUserId: session.athleteUserId,
      coachUserId: session.coachUserId,
    },
    actorUserId: params.actorUserId,
    store: dependencies.commitments,
    now,
  });

  return viewOf(saved, authorization, await currentFingerprint(session.sessionId, dependencies), dependencies);
}

async function generateDocument(
  input: {
    session: SessionCompassSessionSource;
    segments: CompassSourceSegment[];
    fingerprint: string;
    promptVersion: string;
    previous: StoredSessionCompassReport | null;
  },
  dependencies: SessionCompassDependencies
): Promise<SessionCompassReport> {
  let provider: SessionCompassReportProvider;
  try {
    provider = dependencies.createProvider();
  } catch {
    throw new SessionCompassError('COMPASS_UNAVAILABLE', 'La configurazione di Session Compass non è disponibile.');
  }
  const context = await generationContext(input.session, dependencies);
  try {
    return await generateValidatedSessionCompassReport(
      {
        sessionId: String(input.session.sessionId),
        language: input.session.language,
        promptVersion: input.promptVersion,
        generatedAt: dependencies.now().toISOString(),
        sourceFingerprint: input.fingerprint,
        segments: input.segments,
        context,
      },
      provider
    );
  } catch (error) {
    const failure = generationError(error);
    await dependencies.store.recordAudit({
      sessionId: input.session.sessionId,
      actorUserId: input.session.coachUserId,
      eventType: 'compass_report_failed',
      metadata: { code: failure.code },
    });
    throw failure;
  }
}

async function generationContext(
  session: SessionCompassSessionSource,
  dependencies: SessionCompassDependencies
): Promise<SessionCompassContext> {
  const previousApprovedReports = await dependencies.store.loadPreviousApprovedReports({
    coachUserId: session.coachUserId,
    athleteUserId: session.athleteUserId,
    excludeSessionId: session.sessionId,
    limit: 2,
  });
  return {
    coachName: session.coachName,
    coachRole: session.coachRole,
    athleteSport: session.athleteSport,
    pathGoal: session.pathGoal,
    previousApprovedReports: previousApprovedReports.slice(0, 2),
  };
}

/**
 * Riporta sulla nuova bozza le modifiche manuali agli impegni. Il criterio è
 * l'evidenza: se il segmento e l'estratto coincidono si tratta dello stesso
 * impegno, anche se il coach ne ha riscritto il testo.
 */
function preservedCoachEdits(
  previous: StoredSessionCompassReport,
  document: SessionCompassReport
): SessionCompassReport | null {
  const edited = previous.coachEditedReport;
  const generated = previous.generatedReport;
  if (!edited || !generated) return null;
  const changed = new Map<string, Commitment>();
  for (const commitment of edited.commitments) {
    const original = generated.commitments.find((item) => item.id === commitment.id);
    if (!original) continue;
    if (
      original.text === commitment.text &&
      original.owner === commitment.owner &&
      original.status === commitment.status
    ) {
      continue;
    }
    changed.set(evidenceKey(commitment), commitment);
  }
  if (!changed.size) return null;
  const commitments = document.commitments.map((commitment) => {
    const override = changed.get(evidenceKey(commitment));
    return override
      ? { ...commitment, text: override.text, owner: override.owner, status: override.status }
      : commitment;
  });
  return { ...document, commitments, coachNote: null };
}

function evidenceKey(commitment: Commitment): string {
  return `${commitment.evidence.transcriptSegmentId}|${commitment.evidence.quote}`;
}

async function authorizedSession(
  params: { sessionId: number; actorUserId: number },
  action: SessionCompassAction,
  dependencies: SessionCompassDependencies
): Promise<{
  session: SessionCompassSessionSource;
  authorization: SessionCompassAuthorizationResult;
}> {
  const session = await dependencies.store.loadSession(params.sessionId);
  const [isAdmin, featureEnabled] = await Promise.all([
    dependencies.isAdmin(params.actorUserId),
    dependencies.hasFeatureAccess(params.actorUserId),
  ]);
  const authorization = authorizeSessionCompass({
    authenticated: params.actorUserId > 0,
    sessionExists: session !== null,
    actorUserId: params.actorUserId,
    coachUserId: session?.coachUserId,
    athleteUserId: session?.athleteUserId,
    isAdmin,
    featureEnabled,
    action,
  });
  if (!authorization.allowed) throw authorizationError(authorization.reason);
  return { session: session!, authorization };
}

function authorizationError(
  reason: 'unauthenticated' | 'not_found' | 'athlete_forbidden' | 'not_authorized' | 'feature_not_enabled'
): SessionCompassError {
  if (reason === 'not_found') {
    return new SessionCompassError('SESSION_NOT_FOUND', 'Sessione non trovata.');
  }
  if (reason === 'unauthenticated') {
    return new SessionCompassError('UNAUTHORIZED', 'Non autenticato.');
  }
  if (reason === 'feature_not_enabled') {
    return new SessionCompassError('FEATURE_NOT_ENABLED', 'Appunti AI non è abilitato per questo account.');
  }
  return new SessionCompassError('FORBIDDEN', 'Non sei autorizzato ad accedere a questo report.');
}

async function eligibleTimeline(
  session: SessionCompassSessionSource,
  dependencies: SessionCompassDependencies
): Promise<CompassSourceSegment[]> {
  if (!ELIGIBLE_SESSION_STATUSES.includes(session.sessionStatus)) {
    throw new SessionCompassError(
      'SESSION_NOT_ELIGIBLE',
      'Session Compass è disponibile quando la trascrizione è pronta.'
    );
  }
  const segments = await dependencies.store.loadTimeline(session.sessionId);
  if (!segments.length) {
    throw new SessionCompassError(
      'TRANSCRIPT_UNAVAILABLE',
      'La trascrizione della sessione non è ancora disponibile.'
    );
  }
  return segments;
}

async function currentFingerprint(
  sessionId: number,
  dependencies: SessionCompassDependencies
): Promise<string | null> {
  const segments = await dependencies.store.loadTimeline(sessionId);
  return segments.length ? dependencies.sourceFingerprint(segments) : null;
}

async function requireReport(
  sessionId: number,
  dependencies: SessionCompassDependencies
): Promise<StoredSessionCompassReport> {
  const stored = await dependencies.store.loadLatestReport(sessionId);
  if (!stored) {
    throw new SessionCompassError('REPORT_NOT_FOUND', 'Nessun report Session Compass per questa sessione.');
  }
  return stored;
}

function requiredPromptVersion(dependencies: SessionCompassDependencies): string {
  const promptVersion = dependencies.promptVersion.trim();
  if (!promptVersion) {
    throw new SessionCompassError('COMPASS_UNAVAILABLE', 'La configurazione di Session Compass non è disponibile.');
  }
  return promptVersion;
}

async function viewOf(
  stored: StoredSessionCompassReport,
  authorization: SessionCompassAuthorizationResult,
  fingerprint: string | null,
  dependencies: SessionCompassDependencies
): Promise<SessionCompassView> {
  return {
    trackedCommitments: await listSessionCommitmentsForCoach({
      sessionId: stored.sessionId,
      store: dependencies.commitments,
    }),
    reportId: stored.id,
    sessionId: stored.sessionId,
    reportVersion: stored.reportVersion,
    status: stored.status,
    sourceFingerprint: stored.sourceFingerprint,
    isApproved: stored.status === 'approved',
    isStale:
      (fingerprint !== null &&
        stored.sourceFingerprint !== null &&
        stored.sourceFingerprint !== fingerprint) ||
      stored.promptVersion !== requiredPromptVersion(dependencies),
    approvedAt: stored.approvedAt?.toISOString() ?? null,
    errorCode: stored.errorCode,
    updatedAt: stored.updatedDate.toISOString(),
    document: effectiveDocument(stored),
    canEditCoachNote: canEditCoachNote(authorization),
  };
}

function generationError(error: unknown): SessionCompassError {
  if (error instanceof SessionCompassError) return error;
  const providerCode =
    error && typeof error === 'object' && 'providerErrorCode' in error
      ? (error as { providerErrorCode?: unknown }).providerErrorCode
      : undefined;
  if (providerCode === 'TIMEOUT') {
    return new SessionCompassError('COMPASS_TIMEOUT', 'Session Compass ha impiegato troppo tempo. Riprova.');
  }
  if (providerCode === 'AUTHENTICATION_FAILED' || providerCode === 'CONFIGURATION') {
    return new SessionCompassError('COMPASS_UNAVAILABLE', 'La configurazione di Session Compass non è disponibile.');
  }
  if (providerCode === 'RATE_LIMITED') {
    return new SessionCompassError('COMPASS_RATE_LIMITED', 'Il servizio AI è temporaneamente occupato. Riprova tra poco.');
  }
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (code === 'INVALID_PROVIDER_OUTPUT' || code === 'METADATA_MISMATCH') {
    return new SessionCompassError('COMPASS_INVALID', 'Il report non ha superato i controlli di verifica. Riprova.');
  }
  return new SessionCompassError('COMPASS_FAILED', 'Non è stato possibile generare Session Compass. Riprova.');
}

export { SESSION_COMPASS_REPORT_KIND };
