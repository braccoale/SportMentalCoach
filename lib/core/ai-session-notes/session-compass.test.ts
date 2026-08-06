import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompassSourceSegment } from './session-compass-contract';
import {
  FakeSessionCompassReportProvider,
  type RawCompassContent,
  type SessionCompassPreviousReport,
} from './session-compass-provider';
import { InMemorySessionCommitmentStore } from './session-commitments-test-store';
import {
  SessionCompassError,
  approveSessionCompass,
  compassSourceFingerprint,
  ensureSessionCompassDraft,
  getSessionCompass,
  saveCoachNote,
  updateCommitment,
  updateTrackedCommitmentAsCoach,
  type InsertSessionCompassReport,
  type SessionCompassAuditEvent,
  type SessionCompassDependencies,
  type SessionCompassSessionSource,
  type SessionCompassStore,
  type StoredSessionCompassReport,
  type UpdateSessionCompassReport,
} from './session-compass';

const COACH_ID = 10;
const ATHLETE_ID = 20;
const ADMIN_ID = 30;
const OUTSIDER_ID = 40;
const SESSION_ID = 5;

const SEGMENTS: CompassSourceSegment[] = [
  {
    transcriptSegmentId: 1,
    startMs: 0,
    endMs: 5_000,
    speaker: 'coach',
    text: 'Come è andata questa settimana?',
  },
  {
    transcriptSegmentId: 2,
    startMs: 120_000,
    endMs: 130_000,
    speaker: 'athlete',
    text: 'Ho ripreso ad allenarmi ma resto teso prima delle gare.',
  },
];

const CONTENT: RawCompassContent = {
  sessionOverview: {
    summary: 'Emerge una ripresa degli allenamenti con tensione pre-gara riferita.',
    summaryEvidence: [{ transcriptSegmentId: 2, quote: 'resto teso prima delle gare' }],
    themes: [
      { text: 'Ripresa degli allenamenti', evidence: { transcriptSegmentId: 2, quote: 'ripreso ad allenarmi' } },
      { text: 'Tensione pre-gara', evidence: { transcriptSegmentId: 2, quote: 'resto teso' } },
    ],
    emergingResource: null,
  },
  keyMoments: [
    {
      title: 'L’atleta riferisce la tensione',
      explanation: 'Emerge una tensione riferita prima delle gare.',
      speaker: 'athlete',
      evidence: { transcriptSegmentId: 2, quote: 'resto teso prima delle gare' },
    },
  ],
  commitments: [
    {
      text: 'Provare una routine di attivazione',
      owner: 'athlete',
      dueDate: null,
      evidence: { transcriptSegmentId: 2, quote: 'ripreso ad allenarmi' },
    },
  ],
  nextSessionPrep: [
    {
      text: 'Verificare come è andata la routine.',
      origin: 'commitment',
      evidence: { transcriptSegmentId: 2, quote: 'resto teso' },
    },
  ],
};

class InMemoryCompassStore implements SessionCompassStore {
  readonly reports: StoredSessionCompassReport[] = [];
  readonly audits: Array<{ eventType: SessionCompassAuditEvent; actorUserId: number }> = [];
  segments: CompassSourceSegment[] = SEGMENTS;
  previous: SessionCompassPreviousReport[] = [];
  lastPreviousQuery: { limit: number } | null = null;
  private nextId = 1;

  constructor(private readonly session: SessionCompassSessionSource) {}

  async loadSession(sessionId: number) {
    return sessionId === this.session.sessionId ? this.session : null;
  }

  async loadTimeline() {
    return this.segments;
  }

  async loadLatestReport() {
    return (
      this.reports
        .slice()
        .sort((left, right) => right.reportVersion - left.reportVersion)[0] ?? null
    );
  }

  async loadPreviousApprovedReports(params: { limit: number }) {
    this.lastPreviousQuery = { limit: params.limit };
    return this.previous.slice(0, params.limit);
  }

  async insertReport(input: InsertSessionCompassReport) {
    const stored: StoredSessionCompassReport = {
      id: this.nextId++,
      sessionId: input.sessionId,
      reportKind: 'session_compass_v1',
      reportVersion: input.reportVersion,
      status: input.status,
      sourceFingerprint: input.sourceFingerprint,
      promptVersion: input.promptVersion,
      generatedReport: input.generatedReport,
      coachEditedReport: input.coachEditedReport,
      coachNote: input.coachNote,
      approvedBy: null,
      approvedAt: null,
      errorCode: null,
      updatedDate: new Date('2026-08-01T12:00:00.000Z'),
    };
    this.reports.push(stored);
    return stored;
  }

  async updateReport(input: UpdateSessionCompassReport) {
    const stored = this.reports.find((report) => report.id === input.reportId);
    if (!stored) throw new Error('report non trovato');
    if (input.status !== undefined) stored.status = input.status;
    if (input.sourceFingerprint !== undefined) stored.sourceFingerprint = input.sourceFingerprint;
    if (input.promptVersion !== undefined) stored.promptVersion = input.promptVersion;
    if (input.generatedReport !== undefined) stored.generatedReport = input.generatedReport;
    if (input.coachEditedReport !== undefined) stored.coachEditedReport = input.coachEditedReport;
    if (input.coachNote !== undefined) stored.coachNote = input.coachNote;
    if (input.approvedBy !== undefined) stored.approvedBy = input.approvedBy;
    if (input.approvedAt !== undefined) stored.approvedAt = input.approvedAt;
    if (input.errorCode !== undefined) stored.errorCode = input.errorCode;
    return stored;
  }

  async recordAudit(params: { eventType: SessionCompassAuditEvent; actorUserId: number }) {
    this.audits.push({ eventType: params.eventType, actorUserId: params.actorUserId });
  }
}

function session(
  overrides: Partial<SessionCompassSessionSource> = {}
): SessionCompassSessionSource {
  return {
    sessionId: SESSION_ID,
    coachUserId: COACH_ID,
    athleteUserId: ATHLETE_ID,
    sessionStatus: 'ready_for_review',
    language: 'it',
    coachName: 'Giulia Rossi',
    coachRole: 'Mental coach sportivo',
    athleteSport: 'Atletica',
    pathGoal: 'Gestire l’attivazione in gara',
    ...overrides,
  };
}

function harness(options: { session?: SessionCompassSessionSource } = {}) {
  const store = new InMemoryCompassStore(options.session ?? session());
  const commitments = new InMemorySessionCommitmentStore();
  const provider = new FakeSessionCompassReportProvider({ content: CONTENT });
  let clock = Date.parse('2026-08-01T12:00:00.000Z');
  const dependencies: SessionCompassDependencies = {
    store,
    commitments,
    createProvider: () => provider,
    promptVersion: 'compass-v1',
    sourceFingerprint: compassSourceFingerprint,
    isAdmin: async (actorUserId) => actorUserId === ADMIN_ID,
    hasFeatureAccess: async (actorUserId) => actorUserId !== OUTSIDER_ID,
    now: () => new Date((clock += 1_000)),
  };
  return { store, commitments, provider, dependencies };
}

test('genera la prima bozza versionata a partire dalla timeline', async () => {
  const { store, dependencies } = harness();

  const result = await ensureSessionCompassDraft(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    dependencies
  );

  assert.equal(result.regenerated, true);
  assert.equal(result.reason, 'created');
  assert.equal(result.view.reportVersion, 1);
  assert.equal(result.view.status, 'ready_for_review');
  assert.equal(result.view.document?.commitments.length, 1);
  assert.equal(result.view.sourceFingerprint, compassSourceFingerprint(SEGMENTS));
  assert.deepEqual(
    store.audits.map((audit) => audit.eventType),
    ['compass_report_generated']
  );
});

test('è idempotente: non rigenera se fingerprint e prompt non cambiano', async () => {
  const { provider, dependencies } = harness();

  await ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);
  const second = await ensureSessionCompassDraft(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    dependencies
  );

  assert.equal(provider.invocationCount, 1);
  assert.equal(second.regenerated, false);
  assert.equal(second.reason, 'up_to_date');
  assert.equal(second.view.reportVersion, 1);
});

test('rigenera la bozza quando cambia il fingerprint dell’intelligence sorgente', async () => {
  const { store, provider, dependencies } = harness();
  await ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);

  store.segments = [
    ...SEGMENTS,
    {
      transcriptSegmentId: 3,
      startMs: 200_000,
      endMs: 210_000,
      speaker: 'coach',
      text: 'Riprendiamo da qui la prossima volta.',
    },
  ];
  const refreshed = await ensureSessionCompassDraft(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    dependencies
  );

  assert.equal(provider.invocationCount, 2);
  assert.equal(refreshed.regenerated, true);
  assert.equal(refreshed.reason, 'refreshed');
  assert.equal(refreshed.view.reportVersion, 1);
  assert.equal(store.reports.length, 1);
});

test('la nota del coach sopravvive a una rigenerazione', async () => {
  const { store, dependencies } = harness();
  await ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);
  await saveCoachNote(
    { sessionId: SESSION_ID, actorUserId: COACH_ID, coachNote: 'Da riprendere il tema della routine.' },
    dependencies
  );

  store.segments = [
    ...SEGMENTS,
    {
      transcriptSegmentId: 9,
      startMs: 400_000,
      endMs: 405_000,
      speaker: 'coach',
      text: 'Ci sentiamo la settimana prossima.',
    },
  ];
  const refreshed = await ensureSessionCompassDraft(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    dependencies
  );

  assert.equal(refreshed.view.document?.coachNote, 'Da riprendere il tema della routine.');
});

test('le modifiche manuali agli impegni sopravvivono alla rigenerazione', async () => {
  const { store, dependencies } = harness();
  const first = await ensureSessionCompassDraft(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    dependencies
  );
  const commitmentId = first.view.document!.commitments[0].id;
  await updateCommitment(
    { sessionId: SESSION_ID, actorUserId: COACH_ID, commitmentId, status: 'done', owner: 'coach' },
    dependencies
  );

  store.segments = [
    ...SEGMENTS,
    {
      transcriptSegmentId: 4,
      startMs: 300_000,
      endMs: 305_000,
      speaker: 'coach',
      text: 'Ci vediamo la prossima settimana.',
    },
  ];
  const refreshed = await ensureSessionCompassDraft(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    dependencies
  );

  const commitment = refreshed.view.document!.commitments[0];
  assert.equal(commitment.status, 'done');
  assert.equal(commitment.owner, 'coach');
});

test('un report approvato è immutabile e la rigenerazione apre una nuova versione', async () => {
  const { store, dependencies } = harness();
  const first = await ensureSessionCompassDraft(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    dependencies
  );
  const commitmentId = first.view.document!.commitments[0].id;
  await approveSessionCompass({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);

  await assert.rejects(
    () =>
      updateCommitment(
        { sessionId: SESSION_ID, actorUserId: COACH_ID, commitmentId, status: 'done' },
        dependencies
      ),
    (error: unknown) =>
      error instanceof SessionCompassError && error.code === 'REPORT_APPROVED_IMMUTABLE'
  );

  const regenerated = await ensureSessionCompassDraft(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    dependencies
  );

  assert.equal(regenerated.reason, 'new_version');
  assert.equal(regenerated.view.reportVersion, 2);
  assert.equal(regenerated.view.status, 'ready_for_review');
  assert.equal(store.reports.length, 2);
  assert.equal(store.reports[0].status, 'approved');
  assert.equal(store.reports[0].approvedBy, COACH_ID);
});

test('l’atleta non può leggere né modificare il report', async () => {
  const { dependencies } = harness();
  await ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);

  for (const call of [
    () => getSessionCompass({ sessionId: SESSION_ID, actorUserId: ATHLETE_ID }, dependencies),
    () =>
      saveCoachNote(
        { sessionId: SESSION_ID, actorUserId: ATHLETE_ID, coachNote: 'nota' },
        dependencies
      ),
    () => approveSessionCompass({ sessionId: SESSION_ID, actorUserId: ATHLETE_ID }, dependencies),
    () =>
      ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: ATHLETE_ID }, dependencies),
  ]) {
    await assert.rejects(
      call,
      (error: unknown) => error instanceof SessionCompassError && error.code === 'FORBIDDEN'
    );
  }
});

test('l’admin legge il report ma non scrive la nota privata del coach', async () => {
  const { dependencies } = harness();
  await ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);

  const view = await getSessionCompass(
    { sessionId: SESSION_ID, actorUserId: ADMIN_ID },
    dependencies
  );
  assert.equal(view?.canEditCoachNote, false);
  await assert.rejects(
    () =>
      saveCoachNote(
        { sessionId: SESSION_ID, actorUserId: ADMIN_ID, coachNote: 'nota admin' },
        dependencies
      ),
    (error: unknown) => error instanceof SessionCompassError && error.code === 'FORBIDDEN'
  );
});

test('un coach senza entitlement non accede al report', async () => {
  const { dependencies } = harness({ session: session({ coachUserId: OUTSIDER_ID }) });
  await assert.rejects(
    () => getSessionCompass({ sessionId: SESSION_ID, actorUserId: OUTSIDER_ID }, dependencies),
    (error: unknown) =>
      error instanceof SessionCompassError && error.code === 'FEATURE_NOT_ENABLED'
  );
});

test('non genera se la trascrizione non è disponibile o la sessione non è pronta', async () => {
  const { store, dependencies } = harness();
  store.segments = [];
  await assert.rejects(
    () => ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies),
    (error: unknown) =>
      error instanceof SessionCompassError && error.code === 'TRANSCRIPT_UNAVAILABLE'
  );

  const early = harness({ session: session({ sessionStatus: 'active' }) });
  await assert.rejects(
    () =>
      ensureSessionCompassDraft(
        { sessionId: SESSION_ID, actorUserId: COACH_ID },
        early.dependencies
      ),
    (error: unknown) =>
      error instanceof SessionCompassError && error.code === 'SESSION_NOT_ELIGIBLE'
  );
});

test('passa al provider solo il contesto lecito e al massimo due report approvati', async () => {
  const { store, provider, dependencies } = harness();
  store.previous = [1, 2, 3].map((version) => ({
    version,
    approvedAt: '2026-07-0{version}T10:00:00.000Z'.replace('{version}', String(version)),
    summary: `Sintesi ${version}`,
    themes: ['Tema'],
    openCommitments: [],
  }));

  await ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);

  assert.equal(store.lastPreviousQuery?.limit, 2);
  assert.equal(provider.lastInput?.context.previousApprovedReports.length, 2);
  assert.equal(provider.lastInput?.context.coachName, 'Giulia Rossi');
  assert.equal(provider.lastInput?.context.athleteSport, 'Atletica');
  assert.equal(provider.lastInput?.context.pathGoal, 'Gestire l’attivazione in gara');
});

test('se le evidenze spariscono dalla timeline il report non viene inventato', async () => {
  const { store, dependencies } = harness();
  store.segments = [SEGMENTS[0]];

  await assert.rejects(
    () => ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies),
    (error: unknown) => error instanceof SessionCompassError && error.code === 'COMPASS_INVALID'
  );
  assert.equal(store.reports.length, 0);
  assert.ok(store.audits.some((audit) => audit.eventType === 'compass_report_failed'));
});

test('registra un audit per ogni operazione del coach', async () => {
  const { store, dependencies } = harness();
  const first = await ensureSessionCompassDraft(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    dependencies
  );
  await saveCoachNote(
    { sessionId: SESSION_ID, actorUserId: COACH_ID, coachNote: 'nota' },
    dependencies
  );
  await updateCommitment(
    {
      sessionId: SESSION_ID,
      actorUserId: COACH_ID,
      commitmentId: first.view.document!.commitments[0].id,
      status: 'in_progress',
    },
    dependencies
  );
  await approveSessionCompass({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);

  assert.deepEqual(
    store.audits.map((audit) => audit.eventType),
    [
      'compass_report_generated',
      'compass_note_updated',
      'compass_commitment_updated',
      'compass_report_approved',
    ]
  );
});

test('una bozza non crea impegni operativi', async () => {
  const { commitments, dependencies } = harness();
  const draft = await ensureSessionCompassDraft(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    dependencies
  );

  assert.equal(draft.view.document?.commitments.length, 1);
  assert.equal(commitments.rows.length, 0);
  assert.deepEqual(draft.view.trackedCommitments, []);
});

test('l’approvazione rende operativi gli impegni, senza duplicarli se ripetuta', async () => {
  const { commitments, dependencies } = harness();
  await ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);

  const approved = await approveSessionCompass(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    dependencies
  );
  assert.equal(commitments.rows.length, 1);
  assert.equal(commitments.rows[0].athleteUserId, ATHLETE_ID);
  assert.equal(commitments.rows[0].coachUserId, COACH_ID);
  assert.equal(approved.trackedCommitments.length, 1);
  assert.equal(approved.trackedCommitments[0].status, 'pending');

  const again = await approveSessionCompass(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    dependencies
  );
  assert.equal(commitments.rows.length, 1);
  assert.equal(again.trackedCommitments.length, 1);
});

test('il coach modifica un impegno operativo senza toccare il report approvato', async () => {
  const { store, commitments, dependencies } = harness();
  await ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);
  await approveSessionCompass({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);
  const reportJsonBefore = JSON.stringify(store.reports[0].generatedReport);

  const view = await updateTrackedCommitmentAsCoach(
    {
      sessionId: SESSION_ID,
      actorUserId: COACH_ID,
      commitmentId: commitments.rows[0].id,
      title: 'Testo deciso dal coach',
      status: 'in_progress',
    },
    dependencies
  );

  assert.equal(view.trackedCommitments[0].title, 'Testo deciso dal coach');
  assert.equal(view.trackedCommitments[0].status, 'in_progress');
  assert.equal(view.trackedCommitments[0].manuallyEdited, true);
  assert.equal(view.isApproved, true);
  assert.equal(JSON.stringify(store.reports[0].generatedReport), reportJsonBefore);
});

test('l’atleta non raggiunge gli impegni operativi attraverso il Compass', async () => {
  const { dependencies } = harness();
  await ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);
  await approveSessionCompass({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);

  await assert.rejects(
    () => getSessionCompass({ sessionId: SESSION_ID, actorUserId: ATHLETE_ID }, dependencies),
    (error: unknown) => error instanceof SessionCompassError && error.code === 'FORBIDDEN'
  );
  await assert.rejects(
    () =>
      updateTrackedCommitmentAsCoach(
        { sessionId: SESSION_ID, actorUserId: ATHLETE_ID, commitmentId: 1, status: 'completed' },
        dependencies
      ),
    (error: unknown) => error instanceof SessionCompassError && error.code === 'FORBIDDEN'
  );
});

test('la bozza si genera già in `processing`, appena la trascrizione è pronta', async () => {
  // `processing` è lo stato in cui la trascrizione esiste e il report non
  // ancora: è esattamente il momento in cui la bozza va prodotta. Pretendere
  // `ready_for_review` creava un vicolo cieco — quello stato si raggiunge solo
  // *generando* la bozza, quindi non si generava mai nulla.
  const inProgress = harness({ session: session({ sessionStatus: 'processing' }) });
  const draft = await ensureSessionCompassDraft(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    inProgress.dependencies
  );
  assert.ok(draft);
});

test('non approva una bozza generata con una versione prompt non più corrente', async () => {
  const { store, dependencies } = harness();
  await ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies);
  const changedPromptDependencies = { ...dependencies, promptVersion: 'compass-v2' };

  const stale = await getSessionCompass(
    { sessionId: SESSION_ID, actorUserId: COACH_ID },
    changedPromptDependencies
  );
  assert.equal(stale?.isStale, true);

  await assert.rejects(
    () => approveSessionCompass({ sessionId: SESSION_ID, actorUserId: COACH_ID }, changedPromptDependencies),
    (error: unknown) =>
      error instanceof SessionCompassError && error.code === 'COMPASS_INVALID'
  );
  assert.equal(store.reports[0]?.status, 'ready_for_review');
});

test('un errore del provider non attiva retry automatici', async () => {
  const { dependencies } = harness();
  const failingProvider = new FakeSessionCompassReportProvider({ rejection: new Error('provider down') });
  dependencies.createProvider = () => failingProvider;

  await assert.rejects(
    () => ensureSessionCompassDraft({ sessionId: SESSION_ID, actorUserId: COACH_ID }, dependencies),
    (error: unknown) => error instanceof SessionCompassError && error.code === 'COMPASS_FAILED'
  );
  assert.equal(failingProvider.invocationCount, 1);
});
