/**
 * Mental Journey v1 — memoria del percorso, riservata al coach.
 *
 * È una proiezione read-only e deterministica: legge soltanto report Session
 * Compass *approvati* e lo stato reale degli impegni. Non rilegge transcript,
 * audio o bozze, non chiama modelli, non produce punteggi psicologici, non
 * attribuisce miglioramenti o cause. Dove il dato non basta, tace.
 */

import { SESSION_COMPASS_REPORT_KIND } from './session-compass-contract';
import type {
  KeyMomentCategory,
  MetricConfidence,
  SessionCompassReport,
  SessionMetricKey,
} from './session-compass-contract';
import type {
  CommitmentOwner,
  TrackedCommitment,
  TrackedCommitmentStatus,
} from './session-commitments';

/** Sotto questa soglia una percentuale racconterebbe più rumore che percorso. */
export const MIN_COMMITMENTS_FOR_RATE = 5;
/** Finestra di "recente" per follow-through e punti da riprendere. */
export const RECENT_SESSION_WINDOW = 3;
export const MAX_POINTS_TO_REVISIT = 6;
const MIN_OCCURRENCES_FOR_RECURRING_THEME = 2;

export type ApprovedSessionRecord = {
  /**
   * `false` quando il riepilogo è pronto ma il coach non l'ha ancora
   * validato. Entra comunque nella cronistoria — una seduta si è svolta a
   * prescindere da chi ha premuto approva — ma non nei conteggi che parlano
   * di materiale validato.
   */
  isApproved: boolean;
  sessionId: number;
  bookingId: number;
  reportId: number;
  reportVersion: number;
  approvedAt: Date;
  /** Quando il coach lo ha consegnato all'atleta, se lo ha fatto. */
  sharedAt: Date | null;
  sessionDate: Date | null;
  coachUserId: number;
  coachName: string;
  document: SessionCompassReport;
};

export type JourneyCommitment = {
  commitmentId: number;
  title: string;
  owner: CommitmentOwner;
  status: TrackedCommitmentStatus;
  dueDate: string | null;
  isOverdue: boolean;
};

export type JourneyKeyMoment = {
  id: string;
  title: string;
  explanation: string;
  minute: number;
  speaker: 'coach' | 'athlete';
  transcriptSegmentId: number;
  category?: KeyMomentCategory;
  theme?: string | null;
  relevance?: 1 | 2 | 3;
};

export type JourneyMetric = {
  key: SessionMetricKey;
  value: number;
  confidence: MetricConfidence;
  transcriptSegmentId: number;
};

export type JourneyPrepItem = {
  id: string;
  text: string;
  origin: 'theme' | 'commitment' | 'open_question';
};

export type MentalJourneyEntry = {
  sessionId: number;
  bookingId: number;
  reportId: number;
  reportVersion: number;
  sessionDate: string | null;
  approvedAt: string;
  /**
   * Quando il coach ha consegnato il riepilogo all'atleta, se lo ha fatto.
   *
   * Serve al coach, non all'atleta: la domanda «di questo percorso, che cosa
   * ha letto lui?» non si puo' rispondere aprendo le sedute una per una.
   */
  sharedAt: string | null;
  coachName: string;
  summary: string;
  focus: string | null;
  themes: string[];
  emergingResource: string | null;
  /**
   * Il filo che quel riepilogo traccia fra la sua seduta e le precedenti.
   * È già un pensiero sul percorso, e un coach l'ha già approvato.
   */
  throughLine: string | null;
  metrics?: JourneyMetric[];
  keyMoments: JourneyKeyMoment[];
  nextSessionPrep: JourneyPrepItem[];
  commitments: JourneyCommitment[];
  compassHref: string;
  /** `false` quando il riepilogo aspetta ancora la validazione del coach. */
  isApproved: boolean;
};

export type RecurringTheme = {
  key: string;
  label: string;
  occurrences: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sessionIds: number[];
  /** Formulazione prudente, senza giudizio di direzione. */
  description: string;
};

export type FollowThroughItem = JourneyCommitment & {
  sessionId: number;
  bookingId: number;
  sessionDate: string | null;
};

export type PointToRevisitSource =
  | 'recurring_theme'
  | 'open_commitment'
  | 'missed_commitment'
  | 'next_session_prep';

export type PointToRevisit = {
  id: string;
  text: string;
  source: PointToRevisitSource;
  /** Provenienza esplicita: nessun punto compare senza dire da dove viene. */
  sourceLabel: string;
  sessionId: number | null;
  bookingId: number | null;
};

export type JourneySummary = {
  firstSessionDate: string | null;
  lastSessionDate: string | null;
  approvedSessionCount: number;
  /** Sedute con un riepilogo pronto ma non ancora validato. */
  draftSessionCount: number;
  commitments: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    skipped: number;
  };
  /** `null` quando gli impegni sono troppo pochi perché una quota significhi qualcosa. */
  completionRate: number | null;
};

export type MentalJourney = {
  athleteUserId: number;
  summary: JourneySummary;
  timeline: MentalJourneyEntry[];
  recurringThemes: RecurringTheme[];
  followThrough: FollowThroughItem[];
  pointsToRevisit: PointToRevisit[];
};

/**
 * Il solo criterio di ammissione allo storico. Vive qui, e non solo nella
 * clausola SQL dell'adapter, così la regola è verificabile senza database e
 * l'adapter la riapplica come seconda barriera.
 */
export function isApprovedCompassReport(row: {
  status: string;
  reportKind: string;
  document: unknown;
}): boolean {
  return (
    row.status === 'approved' &&
    row.reportKind === SESSION_COMPASS_REPORT_KIND &&
    row.document !== null &&
    row.document !== undefined
  );
}

/**
 * Gli stati che entrano nella cronistoria.
 *
 * `ready_for_review` c'è perché una seduta si è svolta comunque: nasconderla
 * finché qualcuno non preme «approva» significa raccontare al coach un
 * percorso più corto di quello reale. Resta però marcata, e resta fuori da
 * ogni conteggio che dichiara di parlare di materiale validato.
 */
export const JOURNEY_REPORT_STATUSES = ['approved', 'ready_for_review'] as const;

export function isJourneyCompassReport(row: {
  status: string;
  reportKind: string;
  document: unknown;
}): boolean {
  return (
    (JOURNEY_REPORT_STATUSES as readonly string[]).includes(row.status) &&
    row.reportKind === SESSION_COMPASS_REPORT_KIND &&
    row.document !== null &&
    row.document !== undefined
  );
}

export interface MentalJourneyStore {
  coachHasRelationship(params: {
    coachUserId: number;
    athleteUserId: number;
  }): Promise<boolean>;
  /** `coachUserId: null` legge tutti i coach dell'atleta: solo per admin. */
  loadApprovedSessions(params: {
    athleteUserId: number;
    coachUserId: number | null;
  }): Promise<ApprovedSessionRecord[]>;
  loadCommitments(params: {
    athleteUserId: number;
    coachUserId: number | null;
  }): Promise<TrackedCommitment[]>;
}

export type MentalJourneyDependencies = {
  store: MentalJourneyStore;
  isAdmin: (actorUserId: number) => Promise<boolean>;
  hasFeatureAccess: (actorUserId: number) => Promise<boolean>;
  now: () => Date;
};

export type MentalJourneyAuthorizationInput = {
  authenticated: boolean;
  actorUserId: number;
  athleteUserId: number;
  isAdmin: boolean;
  isCoachOfAthlete: boolean;
  featureEnabled: boolean;
};

export type MentalJourneyAuthorizationResult =
  | { allowed: true; actorKind: 'coach' | 'admin' }
  | {
      allowed: false;
      reason:
        | 'unauthenticated'
        | 'athlete_forbidden'
        | 'not_authorized'
        | 'feature_not_enabled';
    };

/**
 * Ordinata e restrittiva. L'atleta è negato esplicitamente: in questa fase la
 * Mental Journey non è una superficie che gli appartiene.
 */
export function authorizeMentalJourney(
  input: MentalJourneyAuthorizationInput
): MentalJourneyAuthorizationResult {
  if (!input.authenticated) return { allowed: false, reason: 'unauthenticated' };
  if (input.isAdmin) return { allowed: true, actorKind: 'admin' };
  if (input.actorUserId === input.athleteUserId) {
    return { allowed: false, reason: 'athlete_forbidden' };
  }
  if (!input.isCoachOfAthlete) return { allowed: false, reason: 'not_authorized' };
  if (!input.featureEnabled) return { allowed: false, reason: 'feature_not_enabled' };
  return { allowed: true, actorKind: 'coach' };
}

export type MentalJourneyErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'FEATURE_NOT_ENABLED'
  | 'INVALID_ATHLETE';

export class MentalJourneyError extends Error {
  constructor(
    public readonly code: MentalJourneyErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'MentalJourneyError';
  }
}

/**
 * Restringe gli ingressi della proiezione alla finestra.
 *
 * Le sedute si collocano con `sessionPlacementDate`, la stessa regola che
 * ordina la timeline: una seduta senza data vale per quando è stata approvata,
 * qui come là. Due regole di collocamento diverse metterebbero una seduta
 * dentro la finestra e fuori dall'ordinamento.
 *
 * Gli impegni seguono la loro seduta. Un impegno preso otto mesi fa non
 * appartiene agli «ultimi 3 mesi» solo perché è ancora aperto: il riquadro si
 * chiama «azioni concordate», e quando sono state concordate è il fatto che
 * conta.
 */
export function windowJourneyInputs(params: {
  sessions: readonly ApprovedSessionRecord[];
  commitments: readonly TrackedCommitment[];
  since: Date | null;
}): {
  sessions: ApprovedSessionRecord[];
  commitments: TrackedCommitment[];
} {
  if (!params.since) {
    return {
      sessions: [...params.sessions],
      commitments: [...params.commitments],
    };
  }

  const from = params.since.getTime();
  const sessions = params.sessions.filter(
    (session) => sessionPlacementDate(session).getTime() >= from
  );
  const kept = new Set(sessions.map((session) => session.sessionId));

  return {
    sessions,
    commitments: params.commitments.filter((commitment) =>
      kept.has(commitment.sessionId)
    ),
  };
}

export async function getMentalJourney(
  params: {
    athleteUserId: number;
    actorUserId: number;
    /** Solo le sedute da qui in poi. Assente o `null`: il percorso intero. */
    since?: Date | null;
  },
  dependencies: MentalJourneyDependencies
): Promise<MentalJourney> {
  if (!Number.isInteger(params.athleteUserId) || params.athleteUserId <= 0) {
    throw new MentalJourneyError('INVALID_ATHLETE', 'Atleta non valido.');
  }
  const [isAdmin, featureEnabled] = await Promise.all([
    dependencies.isAdmin(params.actorUserId),
    dependencies.hasFeatureAccess(params.actorUserId),
  ]);
  const isCoachOfAthlete =
    !isAdmin &&
    params.actorUserId !== params.athleteUserId &&
    (await dependencies.store.coachHasRelationship({
      coachUserId: params.actorUserId,
      athleteUserId: params.athleteUserId,
    }));

  const authorization = authorizeMentalJourney({
    authenticated: params.actorUserId > 0,
    actorUserId: params.actorUserId,
    athleteUserId: params.athleteUserId,
    isAdmin,
    isCoachOfAthlete,
    featureEnabled,
  });
  if (!authorization.allowed) throw authorizationError(authorization.reason);

  const scope = {
    athleteUserId: params.athleteUserId,
    coachUserId: authorization.actorKind === 'admin' ? null : params.actorUserId,
  };
  const [sessions, commitments] = await Promise.all([
    dependencies.store.loadApprovedSessions(scope),
    dependencies.store.loadCommitments(scope),
  ]);

  // La finestra si applica agli ingressi, non alle uscite: `buildMentalJourney`
  // ricalcola sintesi, temi e impegni con le regole che ha già.
  const windowed = windowJourneyInputs({
    sessions,
    commitments,
    since: params.since ?? null,
  });

  return buildMentalJourney({
    athleteUserId: params.athleteUserId,
    sessions: windowed.sessions,
    commitments: windowed.commitments,
    now: dependencies.now(),
  });
}

/**
 * Il cuore della proiezione, puro e senza I/O: date, conteggi e aggregazioni
 * derivano soltanto dagli input.
 */
export function buildMentalJourney(params: {
  athleteUserId: number;
  sessions: readonly ApprovedSessionRecord[];
  commitments: readonly TrackedCommitment[];
  now: Date;
}): MentalJourney {
  const sessions = params.sessions
    .slice()
    .sort((left, right) => sessionOrder(right) - sessionOrder(left));
  const active = params.commitments.filter((commitment) => !commitment.archivedAt);
  const bySession = new Map<number, TrackedCommitment[]>();
  for (const commitment of active) {
    const bucket = bySession.get(commitment.sessionId) ?? [];
    bucket.push(commitment);
    bySession.set(commitment.sessionId, bucket);
  }

  const timeline = sessions.map((session): MentalJourneyEntry => {
    const overview = session.document.sessionOverview;
    return {
      sessionId: session.sessionId,
      bookingId: session.bookingId,
      reportId: session.reportId,
      reportVersion: session.reportVersion,
      sessionDate: session.sessionDate?.toISOString() ?? null,
      approvedAt: session.approvedAt.toISOString(),
      sharedAt: session.sharedAt?.toISOString() ?? null,
      coachName: session.coachName,
      summary: overview.summary,
      focus: overview.themes[0]?.text ?? null,
      throughLine: session.document.story?.throughLine ?? null,
      themes: overview.themes.map((theme) => theme.text),
      emergingResource: overview.emergingResource?.text ?? null,
      metrics: (overview.metrics ?? []).map((metric) => ({
        key: metric.key,
        value: metric.value,
        confidence: metric.confidence,
        transcriptSegmentId: metric.evidence.transcriptSegmentId,
      })),
      keyMoments: session.document.keyMoments.map((moment) => ({
        id: moment.id,
        title: moment.title,
        explanation: moment.explanation,
        minute: moment.evidence.minute,
        speaker: moment.speaker,
        transcriptSegmentId: moment.evidence.transcriptSegmentId,
        category: moment.category,
        theme: moment.theme,
        relevance: moment.relevance,
      })),
      nextSessionPrep: session.document.nextSessionPrep.map((item) => ({
        id: item.id,
        text: item.text,
        origin: item.origin,
      })),
      commitments: (bySession.get(session.sessionId) ?? []).map((commitment) =>
        journeyCommitment(commitment, params.now)
      ),
      compassHref: `/dashboard/appointments/${session.bookingId}`,
      isApproved: session.isApproved,
    };
  });

  // I temi restano un'affermazione sul materiale validato: un tema «ricorrente»
  // costruito su bozze direbbe che una cosa torna, quando torna soltanto in
  // qualcosa che nessuno ha ancora letto.
  const approved = sessions.filter((session) => session.isApproved);

  return {
    athleteUserId: params.athleteUserId,
    summary: summaryOf(sessions, active),
    timeline,
    recurringThemes: aggregateThemes(approved),
    followThrough: followThroughOf(timeline),
    pointsToRevisit: derivePointsToRevisit({
      sessions,
      timeline,
      commitments: active,
      now: params.now,
    }),
  };
}

function summaryOf(
  sessions: readonly ApprovedSessionRecord[],
  commitments: readonly TrackedCommitment[]
): JourneySummary {
  const counts = {
    total: commitments.length,
    completed: commitments.filter((item) => item.status === 'completed').length,
    inProgress: commitments.filter((item) => item.status === 'in_progress').length,
    pending: commitments.filter((item) => item.status === 'pending').length,
    skipped: commitments.filter((item) => item.status === 'skipped').length,
  };
  const dates = sessions
    .map((session) => session.sessionDate ?? session.approvedAt)
    .sort((left, right) => left.getTime() - right.getTime());
  return {
    firstSessionDate: dates[0]?.toISOString() ?? null,
    lastSessionDate: dates.at(-1)?.toISOString() ?? null,
    // Chi dichiara di contare sedute validate ne conta solo di validate.
    approvedSessionCount: sessions.filter((session) => session.isApproved).length,
    draftSessionCount: sessions.filter((session) => !session.isApproved).length,
    commitments: counts,
    completionRate:
      counts.total >= MIN_COMMITMENTS_FOR_RATE
        ? Math.round((counts.completed / counts.total) * 100)
        : null,
  };
}

/**
 * Aggrega solo i temi scritti nei report approvati. Nessun tema viene dedotto,
 * riformulato o interpretato: la normalizzazione serve unicamente a
 * riconoscere la stessa etichetta scritta in modo leggermente diverso.
 */
export function aggregateThemes(
  sessions: readonly ApprovedSessionRecord[]
): RecurringTheme[] {
  const groups = new Map<
    string,
    { label: string; sessionIds: number[]; dates: Date[] }
  >();
  for (const session of sessions) {
    const when = session.sessionDate ?? session.approvedAt;
    const seenInSession = new Set<string>();
    for (const theme of session.document.sessionOverview.themes) {
      const key = themeKey(theme.text);
      if (!key || seenInSession.has(key)) continue;
      seenInSession.add(key);
      const group = groups.get(key) ?? { label: theme.text, sessionIds: [], dates: [] };
      group.sessionIds.push(session.sessionId);
      group.dates.push(when);
      groups.set(key, group);
    }
  }

  return [...groups.entries()]
    .filter(([, group]) => group.sessionIds.length >= MIN_OCCURRENCES_FOR_RECURRING_THEME)
    .map(([key, group]) => {
      const sorted = group.dates.slice().sort((left, right) => left.getTime() - right.getTime());
      return {
        key,
        label: group.label,
        occurrences: group.sessionIds.length,
        firstSeenAt: sorted[0]?.toISOString() ?? null,
        lastSeenAt: sorted.at(-1)?.toISOString() ?? null,
        sessionIds: group.sessionIds,
        description: `Tema emerso in ${group.sessionIds.length} sessioni`,
      };
    })
    .sort(
      (left, right) =>
        right.occurrences - left.occurrences ||
        (Date.parse(right.lastSeenAt ?? '') || 0) - (Date.parse(left.lastSeenAt ?? '') || 0) ||
        left.label.localeCompare(right.label)
    );
}

/** Impegni ancora aperti, più quelli chiusi nelle sessioni recenti. */
function followThroughOf(timeline: readonly MentalJourneyEntry[]): FollowThroughItem[] {
  const recentSessionIds = new Set(
    timeline.slice(0, RECENT_SESSION_WINDOW).map((entry) => entry.sessionId)
  );
  return timeline
    .flatMap((entry) =>
      entry.commitments.map((commitment) => ({
        ...commitment,
        sessionId: entry.sessionId,
        bookingId: entry.bookingId,
        sessionDate: entry.sessionDate,
      }))
    )
    .filter(
      (item) =>
        item.status === 'pending' ||
        item.status === 'in_progress' ||
        recentSessionIds.has(item.sessionId)
    )
    .sort(
      (left, right) =>
        closedLast(left) - closedLast(right) ||
        Number(right.isOverdue) - Number(left.isOverdue) ||
        dueOrder(left.dueDate) - dueOrder(right.dueDate)
    );
}

/**
 * Nessun modello, nessuna inferenza: ogni punto nasce da un dato approvato o
 * da uno stato reale, e porta con sé la propria provenienza.
 */
export function derivePointsToRevisit(params: {
  sessions: readonly ApprovedSessionRecord[];
  timeline: readonly MentalJourneyEntry[];
  commitments: readonly TrackedCommitment[];
  now: Date;
}): PointToRevisit[] {
  const points: PointToRevisit[] = [];
  const recent = params.timeline.slice(0, RECENT_SESSION_WINDOW);
  const recentSessionIds = new Set(recent.map((entry) => entry.sessionId));

  for (const theme of aggregateThemes(
    params.sessions.filter((session) => recentSessionIds.has(session.sessionId))
  )) {
    points.push({
      id: `theme:${theme.key}`,
      text: theme.label,
      source: 'recurring_theme',
      sourceLabel: `Tema emerso in ${theme.occurrences} sessioni recenti`,
      sessionId: theme.sessionIds.at(-1) ?? null,
      bookingId:
        params.timeline.find((entry) => entry.sessionId === theme.sessionIds.at(-1))?.bookingId ??
        null,
    });
  }

  const entryBySession = new Map(params.timeline.map((entry) => [entry.sessionId, entry]));
  const athleteCommitments = params.commitments.filter(
    (commitment) => commitment.owner === 'athlete'
  );
  for (const commitment of athleteCommitments) {
    const entry = entryBySession.get(commitment.sessionId);
    const when = formatDay(entry?.sessionDate ?? null);
    if (commitment.status === 'skipped') {
      points.push({
        id: `commitment:${commitment.id}`,
        text: commitment.title,
        source: 'missed_commitment',
        sourceLabel: `Impegno non completato${when ? ` — dalla sessione del ${when}` : ''}`,
        sessionId: commitment.sessionId,
        bookingId: entry?.bookingId ?? null,
      });
      continue;
    }
    if (commitment.status === 'pending' || commitment.status === 'in_progress') {
      points.push({
        id: `commitment:${commitment.id}`,
        text: commitment.title,
        source: 'open_commitment',
        sourceLabel: `Impegno ancora aperto${when ? ` — dalla sessione del ${when}` : ''}`,
        sessionId: commitment.sessionId,
        bookingId: entry?.bookingId ?? null,
      });
    }
  }

  const latest = params.timeline[0];
  const latestSession = params.sessions.find(
    (session) => session.sessionId === latest?.sessionId
  );
  for (const item of latestSession?.document.nextSessionPrep ?? []) {
    points.push({
      id: `prep:${latestSession!.sessionId}:${item.id}`,
      text: item.text,
      source: 'next_session_prep',
      sourceLabel: `Dal report del ${formatDay(latest?.sessionDate ?? latest?.approvedAt ?? null) ?? 'percorso'}`,
      sessionId: latestSession!.sessionId,
      bookingId: latest?.bookingId ?? null,
    });
  }

  return points.slice(0, MAX_POINTS_TO_REVISIT);
}

function journeyCommitment(
  commitment: TrackedCommitment,
  now: Date
): JourneyCommitment {
  const open = commitment.status === 'pending' || commitment.status === 'in_progress';
  return {
    commitmentId: commitment.id,
    title: commitment.title,
    owner: commitment.owner,
    status: commitment.status,
    dueDate: commitment.dueDate,
    isOverdue:
      open &&
      commitment.dueDate !== null &&
      Date.parse(`${commitment.dueDate}T23:59:59Z`) < now.getTime(),
  };
}

function authorizationError(
  reason: 'unauthenticated' | 'athlete_forbidden' | 'not_authorized' | 'feature_not_enabled'
): MentalJourneyError {
  if (reason === 'unauthenticated') {
    return new MentalJourneyError('UNAUTHORIZED', 'Non autenticato.');
  }
  if (reason === 'feature_not_enabled') {
    return new MentalJourneyError(
      'FEATURE_NOT_ENABLED',
      'Appunti AI non è abilitato per questo account.'
    );
  }
  return new MentalJourneyError(
    'FORBIDDEN',
    'Non sei autorizzato a consultare questo percorso.'
  );
}

/** Accorpa la stessa etichetta scritta in modo leggermente diverso. */
export function themeKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dove cade una seduta nel tempo. Senza `sessionDate` vale la data di
 * approvazione: è l'unica altra prova di quando quella seduta è entrata nel
 * percorso. Esportata perché la finestra temporale deve collocare le sedute
 * esattamente come le colloca l'ordinamento — due regole diverse metterebbero
 * la stessa seduta dentro la finestra e fuori dalla timeline.
 */
function sessionPlacementDate(session: ApprovedSessionRecord): Date {
  return session.sessionDate ?? session.approvedAt;
}

function sessionOrder(session: ApprovedSessionRecord): number {
  return sessionPlacementDate(session).getTime();
}

function closedLast(item: FollowThroughItem): number {
  return item.status === 'completed' || item.status === 'skipped' ? 1 : 0;
}

function dueOrder(dueDate: string | null): number {
  return dueDate ? Date.parse(`${dueDate}T00:00:00Z`) : Number.MAX_SAFE_INTEGER;
}

function formatDay(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat('it-IT', {
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Rome',
      }).format(date);
}
