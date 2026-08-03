import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SESSION_COMPASS_REPORT_KIND,
  SESSION_COMPASS_SCHEMA_VERSION,
  type Commitment,
  type SessionCompassReport,
} from './session-compass-contract';
import { InMemorySessionCommitmentStore } from './session-commitments-test-store';
import {
  SessionCommitmentError,
  commitmentKey,
  isProtectedFromSync,
  listAthleteCommitments,
  listSessionCommitmentsForCoach,
  planCommitmentSync,
  recordAthleteCommitmentOutcome,
  syncApprovedCommitments,
  trackedStatusFrom,
  updateCommitmentByCoach,
  type TrackedCommitment,
} from './session-commitments';

const SESSION = { sessionId: 5, athleteUserId: 20, coachUserId: 10 };
const REPORT = { id: 1, version: 1 };
const NOW = () => new Date('2026-08-05T10:00:00.000Z');

function commitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: 'commitment-1',
    text: 'Provare una routine di attivazione',
    owner: 'athlete',
    status: 'pending',
    dueDate: null,
    evidence: {
      transcriptSegmentId: 2,
      startMs: 120_000,
      minute: 2,
      speaker: 'athlete',
      quote: 'ripreso ad allenarmi',
    },
    ...overrides,
  };
}

function document(commitments: Commitment[]): SessionCompassReport {
  return {
    schemaVersion: SESSION_COMPASS_SCHEMA_VERSION,
    reportKind: SESSION_COMPASS_REPORT_KIND,
    sessionId: '5',
    sourceFingerprint: 'fingerprint-a',
    language: 'it',
    sessionOverview: {
      summary: 'Sintesi neutra.',
      summaryEvidence: [commitment().evidence],
      themes: [],
      emergingResource: null,
    },
    keyMoments: [],
    commitments,
    nextSessionPrep: [],
    coachNote: null,
    generation: {
      provider: 'fake',
      model: 'fake-compass-v1',
      promptVersion: 'compass-v1',
      contractVersion: SESSION_COMPASS_SCHEMA_VERSION,
      generatedAt: '2026-08-01T10:00:00.000Z',
    },
  };
}

async function sync(
  store: InMemorySessionCommitmentStore,
  commitments: Commitment[],
  report = REPORT
) {
  return syncApprovedCommitments({
    document: document(commitments),
    report,
    session: SESSION,
    actorUserId: SESSION.coachUserId,
    store,
    now: NOW(),
  });
}

test('l’identità di un impegno deriva dall’evidenza, non dal testo', () => {
  const original = commitment();
  const rewritten = commitment({ text: 'Testo completamente riscritto dal coach' });
  assert.equal(commitmentKey(original), commitmentKey(rewritten));

  const different = commitment({
    evidence: { ...original.evidence, transcriptSegmentId: 3 },
  });
  assert.notEqual(commitmentKey(original), commitmentKey(different));
});

test('mappa gli stati del Compass sugli stati operativi', () => {
  assert.equal(trackedStatusFrom('done'), 'completed');
  assert.equal(trackedStatusFrom('dropped'), 'skipped');
  assert.equal(trackedStatusFrom('pending'), 'pending');
  assert.equal(trackedStatusFrom('in_progress'), 'in_progress');
});

test('l’approvazione sincronizza gli impegni con evidenza e report di origine', async () => {
  const store = new InMemorySessionCommitmentStore();
  await sync(store, [commitment(), commitment({ id: 'commitment-2', owner: 'coach', text: 'Preparare un esercizio', evidence: { transcriptSegmentId: 3, startMs: 180_000, minute: 3, speaker: 'coach', quote: 'ti preparo un esercizio' } })]);

  assert.equal(store.rows.length, 2);
  const [athleteRow, coachRow] = store.rows;
  assert.equal(athleteRow.owner, 'athlete');
  assert.equal(athleteRow.status, 'pending');
  assert.equal(athleteRow.sourceReportId, REPORT.id);
  assert.equal(athleteRow.sourceReportVersion, 1);
  assert.equal(athleteRow.sourceTranscriptSegmentId, 2);
  assert.equal(athleteRow.sourceTimestampMs, 120_000);
  assert.equal(athleteRow.sourceExcerpt, 'ripreso ad allenarmi');
  assert.equal(coachRow.owner, 'coach');
  assert.deepEqual(
    store.audits.map((audit) => audit.eventType),
    ['commitment_synced']
  );
});

test('una seconda approvazione non duplica né modifica nulla', async () => {
  const store = new InMemorySessionCommitmentStore();
  await sync(store, [commitment()]);
  const plan = await sync(store, [commitment()]);

  assert.equal(store.rows.length, 1);
  assert.deepEqual(plan, { inserts: [], updates: [], archives: [] });
  assert.equal(store.audits.length, 1);
});

test('una nuova versione approvata aggiorna gli impegni equivalenti', async () => {
  const store = new InMemorySessionCommitmentStore();
  await sync(store, [commitment()]);

  await sync(
    store,
    [commitment({ text: 'Routine di attivazione, versione rivista', dueDate: '2026-08-20' })],
    { id: 2, version: 2 }
  );

  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].title, 'Routine di attivazione, versione rivista');
  assert.equal(store.rows[0].dueDate, '2026-08-20');
  assert.equal(store.rows[0].sourceReportVersion, 2);
});

test('una nuova versione non tocca gli impegni completati o modificati a mano', async () => {
  const store = new InMemorySessionCommitmentStore();
  await sync(store, [commitment(), commitment({ id: 'commitment-2', text: 'Secondo impegno', evidence: { transcriptSegmentId: 3, startMs: 180_000, minute: 3, speaker: 'athlete', quote: 'ci provo' } })]);

  await recordAthleteCommitmentOutcome({
    commitmentId: store.rows[0].id,
    actorUserId: SESSION.athleteUserId,
    status: 'completed',
    store,
    now: NOW,
  });
  await updateCommitmentByCoach({
    commitmentId: store.rows[1].id,
    sessionId: SESSION.sessionId,
    actorUserId: SESSION.coachUserId,
    title: 'Testo deciso dal coach',
    store,
    now: NOW,
  });

  await sync(
    store,
    [
      commitment({ text: 'Testo riscritto dall’AI' }),
      commitment({
        id: 'commitment-2',
        text: 'Altro testo dell’AI',
        evidence: { transcriptSegmentId: 3, startMs: 180_000, minute: 3, speaker: 'athlete', quote: 'ci provo' },
      }),
    ],
    { id: 2, version: 2 }
  );

  assert.equal(store.rows[0].status, 'completed');
  assert.equal(store.rows[0].title, 'Provare una routine di attivazione');
  assert.equal(store.rows[1].title, 'Testo deciso dal coach');
  // La tracciabilità al report più recente viene comunque aggiornata.
  assert.equal(store.rows[0].sourceReportVersion, 2);
  assert.equal(store.rows[1].sourceReportVersion, 2);
});

test('archivia solo gli impegni sparsi non ancora toccati da nessuno', async () => {
  const store = new InMemorySessionCommitmentStore();
  const second = commitment({
    id: 'commitment-2',
    text: 'Secondo impegno',
    evidence: { transcriptSegmentId: 3, startMs: 180_000, minute: 3, speaker: 'athlete', quote: 'ci provo' },
  });
  await sync(store, [commitment(), second]);
  await recordAthleteCommitmentOutcome({
    commitmentId: store.rows[1].id,
    actorUserId: SESSION.athleteUserId,
    status: 'skipped',
    note: 'Non ho avuto tempo.',
    store,
    now: NOW,
  });

  await sync(store, [], { id: 2, version: 2 });

  assert.notEqual(store.rows[0].archivedAt, null);
  assert.equal(store.rows[1].archivedAt, null);
  assert.ok(store.audits.some((audit) => audit.eventType === 'commitment_archived'));
  const visible = await listSessionCommitmentsForCoach({
    sessionId: SESSION.sessionId,
    store,
  });
  assert.deepEqual(
    visible.map((item) => item.id),
    [store.rows[1].id]
  );
});

test('un impegno tornato in una versione successiva viene riattivato', async () => {
  const store = new InMemorySessionCommitmentStore();
  await sync(store, [commitment()]);
  await sync(store, [], { id: 2, version: 2 });
  assert.notEqual(store.rows[0].archivedAt, null);

  await sync(store, [commitment()], { id: 3, version: 3 });
  assert.equal(store.rows[0].archivedAt, null);
  assert.equal(store.rows.length, 1);
});

test('l’atleta aggiorna solo gli impegni di cui è owner', async () => {
  const store = new InMemorySessionCommitmentStore();
  await sync(store, [
    commitment({ owner: 'coach' }),
    commitment({
      id: 'commitment-2',
      owner: 'athlete',
      evidence: { transcriptSegmentId: 3, startMs: 180_000, minute: 3, speaker: 'athlete', quote: 'ci provo' },
    }),
  ]);

  await assert.rejects(
    () =>
      recordAthleteCommitmentOutcome({
        commitmentId: store.rows[0].id,
        actorUserId: SESSION.athleteUserId,
        status: 'completed',
        store,
        now: NOW,
      }),
    (error: unknown) => error instanceof SessionCommitmentError && error.code === 'FORBIDDEN'
  );

  await assert.rejects(
    () =>
      recordAthleteCommitmentOutcome({
        commitmentId: store.rows[1].id,
        actorUserId: 999,
        status: 'completed',
        store,
        now: NOW,
      }),
    (error: unknown) => error instanceof SessionCommitmentError && error.code === 'FORBIDDEN'
  );

  const updated = await recordAthleteCommitmentOutcome({
    commitmentId: store.rows[1].id,
    actorUserId: SESSION.athleteUserId,
    status: 'completed',
    store,
    now: NOW,
  });
  assert.equal(updated.status, 'completed');
  assert.equal(updated.completedAt?.toISOString(), '2026-08-05T10:00:00.000Z');
});

test('la nota dell’atleta è ammessa solo quando dichiara di non esserci riuscito', async () => {
  const store = new InMemorySessionCommitmentStore();
  await sync(store, [commitment()]);

  const skipped = await recordAthleteCommitmentOutcome({
    commitmentId: store.rows[0].id,
    actorUserId: SESSION.athleteUserId,
    status: 'skipped',
    note: '  Ho avuto una gara.  ',
    store,
    now: NOW,
  });
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.athleteNote, 'Ho avuto una gara.');
  assert.equal(skipped.completedAt, null);

  const completed = await recordAthleteCommitmentOutcome({
    commitmentId: store.rows[0].id,
    actorUserId: SESSION.athleteUserId,
    status: 'completed',
    note: 'nota che non deve restare',
    store,
    now: NOW,
  });
  assert.equal(completed.athleteNote, null);
  assert.ok(
    store.audits.filter((audit) => audit.eventType === 'commitment_updated_by_athlete').length === 2
  );
});

test('l’atleta non può aggiornare un impegno archiviato', async () => {
  const store = new InMemorySessionCommitmentStore();
  await sync(store, [commitment()]);
  await sync(store, [], { id: 2, version: 2 });

  await assert.rejects(
    () =>
      recordAthleteCommitmentOutcome({
        commitmentId: store.rows[0].id,
        actorUserId: SESSION.athleteUserId,
        status: 'completed',
        store,
        now: NOW,
      }),
    (error: unknown) =>
      error instanceof SessionCommitmentError && error.code === 'COMMITMENT_ARCHIVED'
  );
});

test('la lista atleta espone solo i propri impegni, senza estratti del transcript', async () => {
  const store = new InMemorySessionCommitmentStore({
    coachName: 'Giulia Rossi',
    bookingId: 77,
    sessionDate: new Date('2026-07-30T09:00:00.000Z'),
  });
  await sync(store, [
    commitment({ owner: 'coach', text: 'Impegno del coach' }),
    commitment({
      id: 'commitment-2',
      owner: 'athlete',
      dueDate: '2026-08-20',
      evidence: { transcriptSegmentId: 3, startMs: 180_000, minute: 3, speaker: 'athlete', quote: 'ci provo' },
    }),
  ]);

  const views = await listAthleteCommitments({
    athleteUserId: SESSION.athleteUserId,
    store,
  });

  assert.equal(views.length, 1);
  assert.equal(views[0].title, 'Provare una routine di attivazione');
  assert.equal(views[0].coachName, 'Giulia Rossi');
  assert.equal(views[0].bookingId, 77);
  assert.equal(views[0].dueDate, '2026-08-20');
  const serialized = JSON.stringify(views);
  assert.doesNotMatch(serialized, /ci provo/);
  assert.doesNotMatch(serialized, /sourceExcerpt|sourceTimestampMs|commitmentKey|coachUserId/);
});

test('gli impegni dell’atleta sono ordinati per scadenza e poi per sessione recente', async () => {
  const store = new InMemorySessionCommitmentStore();
  const evidences = [10, 11, 12, 13].map((segmentId) => ({
    transcriptSegmentId: segmentId,
    startMs: segmentId * 1_000,
    minute: 0,
    speaker: 'athlete' as const,
    quote: `estratto ${segmentId}`,
  }));
  await sync(store, [
    commitment({ id: 'a', text: 'Senza scadenza', evidence: evidences[0] }),
    commitment({ id: 'b', text: 'Scade tardi', dueDate: '2026-09-01', evidence: evidences[1] }),
    commitment({ id: 'c', text: 'Scade presto', dueDate: '2026-08-10', evidence: evidences[2] }),
    commitment({ id: 'd', text: 'Già gestito', dueDate: '2026-08-01', evidence: evidences[3] }),
  ]);
  await recordAthleteCommitmentOutcome({
    commitmentId: store.rows[3].id,
    actorUserId: SESSION.athleteUserId,
    status: 'completed',
    store,
    now: NOW,
  });

  const views = await listAthleteCommitments({
    athleteUserId: SESSION.athleteUserId,
    store,
  });

  assert.deepEqual(
    views.map((item) => item.title),
    ['Scade presto', 'Scade tardi', 'Senza scadenza', 'Già gestito']
  );
});

test('la modifica del coach prevale e resta marcata come manuale', async () => {
  const store = new InMemorySessionCommitmentStore();
  await sync(store, [commitment()]);

  const updated = await updateCommitmentByCoach({
    commitmentId: store.rows[0].id,
    sessionId: SESSION.sessionId,
    actorUserId: SESSION.coachUserId,
    title: 'Versione del coach',
    owner: 'coach',
    dueDate: '2026-08-15',
    status: 'in_progress',
    store,
    now: NOW,
  });

  assert.equal(updated.title, 'Versione del coach');
  assert.equal(updated.owner, 'coach');
  assert.equal(updated.dueDate, '2026-08-15');
  assert.equal(updated.status, 'in_progress');
  assert.equal(updated.manuallyEdited, true);
  assert.equal(isProtectedFromSync(updated), true);
  assert.ok(store.audits.some((audit) => audit.eventType === 'commitment_updated_by_coach'));
});

test('il coach non modifica un impegno di un’altra sessione', async () => {
  const store = new InMemorySessionCommitmentStore();
  await sync(store, [commitment()]);

  await assert.rejects(
    () =>
      updateCommitmentByCoach({
        commitmentId: store.rows[0].id,
        sessionId: 999,
        actorUserId: SESSION.coachUserId,
        title: 'Modifica indebita',
        store,
        now: NOW,
      }),
    (error: unknown) =>
      error instanceof SessionCommitmentError && error.code === 'COMMITMENT_NOT_FOUND'
  );
});

test('il piano di sincronizzazione ignora impegni duplicati nello stesso documento', () => {
  const existing: TrackedCommitment[] = [];
  const plan = planCommitmentSync({
    document: document([commitment(), commitment({ id: 'commitment-duplicato' })]),
    existing,
    report: REPORT,
    session: SESSION,
    now: NOW(),
  });
  assert.equal(plan.inserts.length, 1);
});

test('un impegno gia chiuso nella bozza arriva completo di completed_at', async () => {
  // Il coach puo portare un impegno a "fatto" prima di approvare: senza
  // completed_at la INSERT violerebbe session_ai_commitments_completed_check.
  const store = new InMemorySessionCommitmentStore();
  await sync(store, [commitment({ status: 'done' })]);

  assert.equal(store.rows[0].status, 'completed');
  assert.equal(store.rows[0].completedAt?.toISOString(), NOW().toISOString());

  const dropped = new InMemorySessionCommitmentStore();
  await sync(dropped, [commitment({ status: 'dropped' })]);
  assert.equal(dropped.rows[0].status, 'skipped');
  assert.equal(dropped.rows[0].completedAt, null);
});
