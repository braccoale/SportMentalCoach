import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SESSION_COMPASS_REPORT_KIND,
  SESSION_COMPASS_SCHEMA_VERSION,
  type SessionCompassReport,
} from './session-compass-contract';
import type { TrackedCommitment } from './session-commitments';
import {
  MIN_COMMITMENTS_FOR_RATE,
  MentalJourneyError,
  aggregateThemes,
  authorizeMentalJourney,
  buildMentalJourney,
  getMentalJourney,
  isApprovedCompassReport,
  themeKey,
  type ApprovedSessionRecord,
  type MentalJourneyDependencies,
  type MentalJourneyStore,
} from './mental-journey';

const COACH_ID = 10;
const ATHLETE_ID = 20;
const ADMIN_ID = 30;
const OUTSIDER_ID = 40;
const NOW = new Date('2026-08-20T12:00:00.000Z');

function document(overrides: {
  summary?: string;
  themes?: string[];
  emergingResource?: string | null;
  nextSessionPrep?: string[];
  keyMoments?: string[];
} = {}): SessionCompassReport {
  const evidence = {
    transcriptSegmentId: 1,
    startMs: 60_000,
    minute: 1,
    speaker: 'athlete' as const,
    quote: 'estratto',
  };
  return {
    schemaVersion: SESSION_COMPASS_SCHEMA_VERSION,
    reportKind: SESSION_COMPASS_REPORT_KIND,
    sessionId: '1',
    sourceFingerprint: 'fingerprint',
    language: 'it',
    sessionOverview: {
      summary: overrides.summary ?? 'Sintesi approvata della sessione.',
      summaryEvidence: [evidence],
      themes: (overrides.themes ?? ['Attivazione pre-gara']).map((text, index) => ({
        id: `theme-${index + 1}`,
        text,
        evidence,
      })),
      emergingResource:
        overrides.emergingResource === undefined || overrides.emergingResource === null
          ? null
          : { id: 'resource-1', text: overrides.emergingResource, evidence },
    },
    keyMoments: (overrides.keyMoments ?? []).map((title, index) => ({
      id: `moment-${index + 1}`,
      title,
      explanation: 'Spiegazione approvata senza riportare la citazione.',
      speaker: 'athlete' as const,
      evidence,
    })),
    commitments: [],
    nextSessionPrep: (overrides.nextSessionPrep ?? []).map((text, index) => ({
      id: `prep-${index + 1}`,
      text,
      origin: 'theme' as const,
      evidence,
    })),
    coachNote: 'Nota privata del coach',
    generation: {
      provider: 'openai',
      model: 'gpt-5-mini',
      promptVersion: 'compass-v1',
      contractVersion: SESSION_COMPASS_SCHEMA_VERSION,
      generatedAt: '2026-08-01T10:00:00.000Z',
    },
  };
}

function approvedSession(
  overrides: Partial<ApprovedSessionRecord> = {}
): ApprovedSessionRecord {
  return {
    sessionId: 1,
    bookingId: 101,
    reportId: 1001,
    reportVersion: 1,
    approvedAt: new Date('2026-08-02T10:00:00.000Z'),
    sessionDate: new Date('2026-08-01T09:00:00.000Z'),
    coachUserId: COACH_ID,
    coachName: 'Giulia Rossi',
    document: document(),
    ...overrides,
  };
}

function commitment(overrides: Partial<TrackedCommitment> = {}): TrackedCommitment {
  return {
    id: 1,
    sessionId: 1,
    sourceReportId: 1001,
    sourceReportVersion: 1,
    athleteUserId: ATHLETE_ID,
    coachUserId: COACH_ID,
    commitmentKey: 'key-1',
    title: 'Provare una routine di attivazione',
    owner: 'athlete',
    status: 'pending',
    dueDate: null,
    completedAt: null,
    athleteNote: null,
    sourceTranscriptSegmentId: 1,
    sourceTimestampMs: 60_000,
    sourceExcerpt: 'estratto riservato',
    manuallyEdited: false,
    archivedAt: null,
    ...overrides,
  };
}

class InMemoryJourneyStore implements MentalJourneyStore {
  lastSessionScope: { athleteUserId: number; coachUserId: number | null } | null = null;

  constructor(
    private readonly sessions: ApprovedSessionRecord[] = [],
    private readonly commitments: TrackedCommitment[] = [],
    private readonly relationshipCoachIds: number[] = [COACH_ID]
  ) {}

  async coachHasRelationship({ coachUserId }: { coachUserId: number }) {
    return this.relationshipCoachIds.includes(coachUserId);
  }

  async loadApprovedSessions(params: { athleteUserId: number; coachUserId: number | null }) {
    this.lastSessionScope = params;
    return this.sessions.filter(
      (session) => params.coachUserId === null || session.coachUserId === params.coachUserId
    );
  }

  async loadCommitments(params: { athleteUserId: number; coachUserId: number | null }) {
    return this.commitments.filter(
      (item) =>
        item.athleteUserId === params.athleteUserId &&
        (params.coachUserId === null || item.coachUserId === params.coachUserId)
    );
  }
}

function dependencies(store: MentalJourneyStore): MentalJourneyDependencies {
  return {
    store,
    isAdmin: async (actorUserId) => actorUserId === ADMIN_ID,
    hasFeatureAccess: async (actorUserId) => actorUserId !== OUTSIDER_ID,
    now: () => NOW,
  };
}

test('la timeline va dalla sessione più recente alla meno recente', () => {
  const journey = buildMentalJourney({
    athleteUserId: ATHLETE_ID,
    sessions: [
      approvedSession({ sessionId: 1, sessionDate: new Date('2026-07-01T09:00:00.000Z') }),
      approvedSession({ sessionId: 3, sessionDate: new Date('2026-08-10T09:00:00.000Z') }),
      approvedSession({ sessionId: 2, sessionDate: new Date('2026-07-20T09:00:00.000Z') }),
    ],
    commitments: [],
    now: NOW,
  });

  assert.deepEqual(
    journey.timeline.map((entry) => entry.sessionId),
    [3, 2, 1]
  );
  assert.equal(journey.summary.approvedSessionCount, 3);
  assert.equal(journey.summary.firstSessionDate, '2026-07-01T09:00:00.000Z');
  assert.equal(journey.summary.lastSessionDate, '2026-08-10T09:00:00.000Z');
});

test('ogni card porta sintesi, focus, momenti, preparazione e link al Session Compass', () => {
  const journey = buildMentalJourney({
    athleteUserId: ATHLETE_ID,
    sessions: [
      approvedSession({
        document: document({
          summary: 'Sintesi breve già approvata.',
          themes: ['Attivazione pre-gara', 'Routine'],
          emergingResource: 'Costanza negli allenamenti',
          keyMoments: ['Cambio di prospettiva'],
          nextSessionPrep: ['Verificare la routine in gara.'],
        }),
      }),
    ],
    commitments: [commitment()],
    now: NOW,
  });

  const [entry] = journey.timeline;
  assert.equal(entry.summary, 'Sintesi breve già approvata.');
  assert.equal(entry.focus, 'Attivazione pre-gara');
  assert.deepEqual(entry.themes, ['Attivazione pre-gara', 'Routine']);
  assert.equal(entry.emergingResource, 'Costanza negli allenamenti');
  assert.equal(entry.keyMoments[0].title, 'Cambio di prospettiva');
  assert.equal(entry.keyMoments[0].transcriptSegmentId, 1);
  assert.equal(entry.nextSessionPrep[0].text, 'Verificare la routine in gara.');
  assert.equal(entry.compassHref, '/dashboard/appointments/101');
  assert.equal(entry.commitments.length, 1);
  assert.equal(entry.commitments[0].status, 'pending');
});

test('proietta le metriche strutturate senza esporre la citazione della trascrizione', () => {
  const report = document();
  report.sessionOverview.metrics = [{
    id: 'metric-1',
    key: 'confidence',
    value: 4,
    confidence: 'medium',
    evidence: {
      transcriptSegmentId: 1,
      startMs: 60_000,
      minute: 1,
      speaker: 'athlete',
      quote: 'estratto riservato',
    },
  }];
  const journey = buildMentalJourney({
    athleteUserId: ATHLETE_ID,
    sessions: [approvedSession({ document: report })],
    commitments: [],
    now: NOW,
  });

  assert.deepEqual(journey.timeline[0].metrics, [{
    key: 'confidence',
    value: 4,
    confidence: 'medium',
    transcriptSegmentId: 1,
  }]);
  assert.equal(JSON.stringify(journey).includes('estratto riservato'), false);
});

test('non espone estratti di transcript né la nota privata nelle card', () => {
  const journey = buildMentalJourney({
    athleteUserId: ATHLETE_ID,
    sessions: [approvedSession()],
    commitments: [commitment()],
    now: NOW,
  });

  const serialized = JSON.stringify(journey.timeline);
  assert.doesNotMatch(serialized, /estratto riservato/);
  assert.doesNotMatch(serialized, /Nota privata del coach/);
  assert.doesNotMatch(serialized, /sourceExcerpt|coachNote|summaryEvidence/);
  assert.doesNotMatch(serialized, /\"quote\"/);
});

test('conta gli impegni per stato e tace sulla percentuale se sono pochi', () => {
  const few = buildMentalJourney({
    athleteUserId: ATHLETE_ID,
    sessions: [approvedSession()],
    commitments: [
      commitment({ id: 1, status: 'completed', completedAt: NOW }),
      commitment({ id: 2, status: 'pending' }),
    ],
    now: NOW,
  });
  assert.equal(few.summary.commitments.total, 2);
  assert.equal(few.summary.commitments.completed, 1);
  assert.equal(few.summary.completionRate, null);

  const enough = buildMentalJourney({
    athleteUserId: ATHLETE_ID,
    sessions: [approvedSession()],
    commitments: Array.from({ length: MIN_COMMITMENTS_FOR_RATE }, (_, index) =>
      commitment({
        id: index + 1,
        commitmentKey: `key-${index}`,
        status: index === 0 ? 'pending' : 'completed',
        completedAt: index === 0 ? null : NOW,
      })
    ),
    now: NOW,
  });
  assert.equal(enough.summary.completionRate, 80);
});

test('esclude gli impegni archiviati dai conteggi e dalla timeline', () => {
  const journey = buildMentalJourney({
    athleteUserId: ATHLETE_ID,
    sessions: [approvedSession()],
    commitments: [
      commitment({ id: 1 }),
      commitment({ id: 2, commitmentKey: 'key-2', archivedAt: new Date('2026-08-05T00:00:00.000Z') }),
    ],
    now: NOW,
  });

  assert.equal(journey.summary.commitments.total, 1);
  assert.equal(journey.timeline[0].commitments.length, 1);
});

test('aggrega solo i temi scritti nei report approvati e li conta per sessione', () => {
  const themes = aggregateThemes([
    approvedSession({
      sessionId: 1,
      sessionDate: new Date('2026-07-01T09:00:00.000Z'),
      document: document({ themes: ['Attivazione pre-gara', 'Sonno'] }),
    }),
    approvedSession({
      sessionId: 2,
      sessionDate: new Date('2026-07-20T09:00:00.000Z'),
      // Stessa etichetta scritta diversamente: resta un solo tema.
      document: document({ themes: ['attivazione pre gara'] }),
    }),
    approvedSession({
      sessionId: 3,
      sessionDate: new Date('2026-08-10T09:00:00.000Z'),
      document: document({ themes: ['Attivazione pre-gara'] }),
    }),
  ]);

  assert.equal(themes.length, 1);
  assert.equal(themes[0].occurrences, 3);
  assert.equal(themes[0].description, 'Tema emerso in 3 sessioni');
  assert.equal(themes[0].firstSeenAt, '2026-07-01T09:00:00.000Z');
  assert.equal(themes[0].lastSeenAt, '2026-08-10T09:00:00.000Z');
  assert.deepEqual(themes[0].sessionIds.sort(), [1, 2, 3]);
  assert.doesNotMatch(themes[0].description, /miglior|peggior|progress/i);
});

test('un tema ripetuto nella stessa sessione conta una volta sola', () => {
  const themes = aggregateThemes([
    approvedSession({
      document: document({ themes: ['Ansia da gara', 'ansia da gara!'] }),
    }),
  ]);
  assert.equal(themes.length, 0);
  assert.equal(themeKey('Ansia da gara'), themeKey('ansia da gara!'));
});

test('il follow-through mostra gli impegni aperti e quelli chiusi di recente', () => {
  const sessions = [1, 2, 3, 4].map((sessionId) =>
    approvedSession({
      sessionId,
      bookingId: 100 + sessionId,
      sessionDate: new Date(`2026-0${sessionId}-01T09:00:00.000Z`),
    })
  );
  const journey = buildMentalJourney({
    athleteUserId: ATHLETE_ID,
    sessions,
    commitments: [
      commitment({ id: 1, sessionId: 1, commitmentKey: 'k1', status: 'completed', completedAt: NOW }),
      commitment({ id: 2, sessionId: 4, commitmentKey: 'k2', status: 'completed', completedAt: NOW }),
      commitment({ id: 3, sessionId: 1, commitmentKey: 'k3', status: 'pending', dueDate: '2026-08-01' }),
    ],
    now: NOW,
  });

  const ids = journey.followThrough.map((item) => item.commitmentId);
  // L'impegno chiuso nella sessione più vecchia esce dalla finestra recente.
  assert.ok(!ids.includes(1));
  assert.ok(ids.includes(2));
  assert.ok(ids.includes(3));
  const overdue = journey.followThrough.find((item) => item.commitmentId === 3);
  assert.equal(overdue?.isOverdue, true);
  assert.equal(overdue?.sessionId, 1);
  assert.equal(overdue?.owner, 'athlete');
});

test('i punti da riprendere derivano solo da dati approvati e stati reali', () => {
  const journey = buildMentalJourney({
    athleteUserId: ATHLETE_ID,
    sessions: [
      approvedSession({
        sessionId: 1,
        sessionDate: new Date('2026-07-01T09:00:00.000Z'),
        document: document({ themes: ['Attivazione pre-gara'] }),
      }),
      approvedSession({
        sessionId: 2,
        bookingId: 102,
        sessionDate: new Date('2026-08-10T09:00:00.000Z'),
        document: document({
          themes: ['Attivazione pre-gara'],
          nextSessionPrep: ['Verificare come è andata la routine.'],
        }),
      }),
    ],
    commitments: [
      commitment({ id: 1, sessionId: 1, commitmentKey: 'k1', status: 'skipped' }),
      commitment({ id: 2, sessionId: 2, commitmentKey: 'k2', status: 'in_progress' }),
      commitment({ id: 3, sessionId: 2, commitmentKey: 'k3', status: 'completed', completedAt: NOW }),
      commitment({ id: 4, sessionId: 2, commitmentKey: 'k4', owner: 'coach', status: 'pending' }),
    ],
    now: NOW,
  });

  const sources = journey.pointsToRevisit.map((point) => point.source);
  assert.ok(sources.includes('recurring_theme'));
  assert.ok(sources.includes('missed_commitment'));
  assert.ok(sources.includes('open_commitment'));
  assert.ok(sources.includes('next_session_prep'));

  // Nessun punto da impegni completati o da impegni del coach.
  const texts = journey.pointsToRevisit.map((point) => point.text);
  assert.equal(texts.filter((text) => text === commitment().title).length, 2);
  assert.equal(
    journey.pointsToRevisit.filter((point) => point.source === 'open_commitment').length,
    1
  );

  // Ogni punto dichiara la propria provenienza.
  for (const point of journey.pointsToRevisit) {
    assert.ok(point.sourceLabel.trim().length > 0);
  }
  const prep = journey.pointsToRevisit.find((point) => point.source === 'next_session_prep');
  assert.match(prep!.sourceLabel, /^Dal report del /);
  const missed = journey.pointsToRevisit.find((point) => point.source === 'missed_commitment');
  assert.match(missed!.sourceLabel, /^Impegno non completato/);
});

test('senza sessioni approvate la proiezione è vuota ma valida', () => {
  const journey = buildMentalJourney({
    athleteUserId: ATHLETE_ID,
    sessions: [],
    commitments: [],
    now: NOW,
  });

  assert.deepEqual(journey.timeline, []);
  assert.deepEqual(journey.recurringThemes, []);
  assert.deepEqual(journey.followThrough, []);
  assert.deepEqual(journey.pointsToRevisit, []);
  assert.equal(journey.summary.approvedSessionCount, 0);
  assert.equal(journey.summary.completionRate, null);
  assert.equal(journey.summary.firstSessionDate, null);
});

test('lo store espone solo i report approvati: bozze e fallimenti non arrivano', async () => {
  // Lo store di produzione filtra per status; qui verifichiamo il contratto
  // della proiezione: ciò che non è approvato non entra fra le sessioni.
  const store = new InMemoryJourneyStore([approvedSession({ sessionId: 7 })]);
  const journey = await getMentalJourney(
    { athleteUserId: ATHLETE_ID, actorUserId: COACH_ID },
    dependencies(store)
  );

  assert.deepEqual(
    journey.timeline.map((entry) => entry.sessionId),
    [7]
  );
  assert.deepEqual(store.lastSessionScope, {
    athleteUserId: ATHLETE_ID,
    coachUserId: COACH_ID,
  });
});

test('l’admin legge il percorso senza restringerlo a un solo coach', async () => {
  const store = new InMemoryJourneyStore([
    approvedSession({ sessionId: 1, coachUserId: COACH_ID }),
    approvedSession({ sessionId: 2, coachUserId: 99, bookingId: 102 }),
  ]);
  const journey = await getMentalJourney(
    { athleteUserId: ATHLETE_ID, actorUserId: ADMIN_ID },
    dependencies(store)
  );

  assert.equal(store.lastSessionScope?.coachUserId, null);
  assert.equal(journey.timeline.length, 2);
});

test('l’atleta non può leggere la propria Mental Journey in questa fase', async () => {
  const store = new InMemoryJourneyStore([approvedSession()]);
  await assert.rejects(
    () =>
      getMentalJourney(
        { athleteUserId: ATHLETE_ID, actorUserId: ATHLETE_ID },
        dependencies(store)
      ),
    (error: unknown) => error instanceof MentalJourneyError && error.code === 'FORBIDDEN'
  );
});

test('un coach senza relazione con l’atleta è negato', async () => {
  const store = new InMemoryJourneyStore([approvedSession()], [], [COACH_ID]);
  await assert.rejects(
    () =>
      getMentalJourney({ athleteUserId: ATHLETE_ID, actorUserId: 77 }, dependencies(store)),
    (error: unknown) => error instanceof MentalJourneyError && error.code === 'FORBIDDEN'
  );
});

test('un coach in relazione ma senza entitlement è negato con il motivo corretto', async () => {
  const store = new InMemoryJourneyStore([approvedSession()], [], [OUTSIDER_ID]);
  await assert.rejects(
    () =>
      getMentalJourney(
        { athleteUserId: ATHLETE_ID, actorUserId: OUTSIDER_ID },
        dependencies(store)
      ),
    (error: unknown) =>
      error instanceof MentalJourneyError && error.code === 'FEATURE_NOT_ENABLED'
  );
});

test('la policy di autorizzazione è ordinata e nega esplicitamente l’atleta', () => {
  const base = {
    authenticated: true,
    actorUserId: COACH_ID,
    athleteUserId: ATHLETE_ID,
    isAdmin: false,
    isCoachOfAthlete: true,
    featureEnabled: true,
  };
  assert.deepEqual(authorizeMentalJourney(base), { allowed: true, actorKind: 'coach' });
  assert.deepEqual(authorizeMentalJourney({ ...base, actorUserId: ATHLETE_ID }), {
    allowed: false,
    reason: 'athlete_forbidden',
  });
  assert.deepEqual(
    authorizeMentalJourney({ ...base, actorUserId: ATHLETE_ID, isAdmin: true }),
    { allowed: true, actorKind: 'admin' }
  );
  assert.deepEqual(authorizeMentalJourney({ ...base, authenticated: false, isAdmin: true }), {
    allowed: false,
    reason: 'unauthenticated',
  });
  assert.deepEqual(authorizeMentalJourney({ ...base, isCoachOfAthlete: false }), {
    allowed: false,
    reason: 'not_authorized',
  });
});

test('rifiuta un id atleta non valido prima di leggere qualsiasi dato', async () => {
  const store = new InMemoryJourneyStore([approvedSession()]);
  await assert.rejects(
    () => getMentalJourney({ athleteUserId: 0, actorUserId: COACH_ID }, dependencies(store)),
    (error: unknown) => error instanceof MentalJourneyError && error.code === 'INVALID_ATHLETE'
  );
  assert.equal(store.lastSessionScope, null);
});

test('solo i report approvati entrano nello storico: bozze e falliti sono esclusi', () => {
  const approved = { status: 'approved', reportKind: SESSION_COMPASS_REPORT_KIND, document: document() };
  assert.equal(isApprovedCompassReport(approved), true);

  for (const status of ['pending', 'generating', 'ready_for_review', 'failed', 'shared']) {
    assert.equal(
      isApprovedCompassReport({ ...approved, status }),
      false,
      `lo stato ${status} non deve entrare nello storico`
    );
  }
  assert.equal(isApprovedCompassReport({ ...approved, document: null }), false);
  assert.equal(isApprovedCompassReport({ ...approved, reportKind: 'altro_report' }), false);
});
