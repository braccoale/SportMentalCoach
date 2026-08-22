import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_JOURNEY_PERIOD,
  JOURNEY_PERIODS,
  JOURNEY_PERIOD_LABELS,
  journeyPeriodSince,
  parseJourneyPeriod,
} from './journey-period';
import {
  windowJourneyInputs,
  type ApprovedSessionRecord,
} from './mental-journey';
import type { TrackedCommitment } from './session-commitments';

const NOW = new Date('2026-08-20T12:00:00.000Z');

function session(
  sessionId: number,
  sessionDate: string | null,
  approvedAt = '2026-08-20T10:00:00.000Z'
): ApprovedSessionRecord {
  return {
    isApproved: true,
    sessionId,
    bookingId: 500 + sessionId,
    reportId: sessionId,
    reportVersion: 1,
    sharedAt: null,
    approvedAt: new Date(approvedAt),
    sessionDate: sessionDate ? new Date(sessionDate) : null,
    coachUserId: 1,
    coachName: 'Coach',
    document: {} as ApprovedSessionRecord['document'],
  };
}

function commitment(id: number, sessionId: number): TrackedCommitment {
  return { id, sessionId } as TrackedCommitment;
}

test('un periodo sconosciuto non rompe la pagina: si torna al percorso intero', () => {
  assert.equal(parseJourneyPeriod('3m'), '3m');
  assert.equal(parseJourneyPeriod(undefined), DEFAULT_JOURNEY_PERIOD);
  assert.equal(parseJourneyPeriod(''), DEFAULT_JOURNEY_PERIOD);
  assert.equal(parseJourneyPeriod('<script>'), DEFAULT_JOURNEY_PERIOD);
  // Next può consegnare lo stesso parametro più volte.
  assert.equal(parseJourneyPeriod(['6m', '3m']), '6m');
});

test('ogni periodo ha la sua etichetta', () => {
  for (const period of JOURNEY_PERIODS) {
    assert.ok(JOURNEY_PERIOD_LABELS[period], period);
  }
});

test('«tutto il percorso» non pone un limite', () => {
  assert.equal(journeyPeriodSince('tutto', NOW), null);
});

test('i mesi si sottraggono davvero, senza traboccare nel mese dopo', () => {
  assert.equal(
    journeyPeriodSince('3m', NOW)!.toISOString(),
    '2026-05-20T12:00:00.000Z'
  );
  assert.equal(
    journeyPeriodSince('12m', NOW)!.toISOString(),
    '2025-08-20T12:00:00.000Z'
  );

  // Il 31 marzo meno un mese è il 28 febbraio, non il 3 marzo.
  const endOfMonth = new Date('2026-03-31T09:00:00.000Z');
  assert.equal(
    journeyPeriodSince('3m', new Date('2026-05-31T09:00:00.000Z'))!.toISOString(),
    '2026-02-28T09:00:00.000Z'
  );
  assert.equal(
    journeyPeriodSince('12m', endOfMonth)!.toISOString(),
    '2025-03-31T09:00:00.000Z'
  );
});

test('senza limite gli ingressi passano tutti', () => {
  const sessions = [session(1, '2024-01-01T10:00:00.000Z'), session(2, null)];
  const commitments = [commitment(10, 1), commitment(11, 2)];

  const windowed = windowJourneyInputs({ sessions, commitments, since: null });
  assert.equal(windowed.sessions.length, 2);
  assert.equal(windowed.commitments.length, 2);
});

test('la finestra tiene solo le sedute da quel momento in poi', () => {
  const sessions = [
    session(1, '2026-01-10T10:00:00.000Z'),
    session(2, '2026-06-01T10:00:00.000Z'),
    session(3, '2026-08-18T10:00:00.000Z'),
  ];

  const windowed = windowJourneyInputs({
    sessions,
    commitments: [],
    since: journeyPeriodSince('3m', NOW),
  });

  assert.deepEqual(
    windowed.sessions.map((s) => s.sessionId),
    [2, 3]
  );
});

test('una seduta senza data vale per quando e stata approvata', () => {
  const dentro = session(1, null, '2026-08-01T10:00:00.000Z');
  const fuori = session(2, null, '2026-01-05T10:00:00.000Z');

  const windowed = windowJourneyInputs({
    sessions: [dentro, fuori],
    commitments: [],
    since: journeyPeriodSince('3m', NOW),
  });

  assert.deepEqual(
    windowed.sessions.map((s) => s.sessionId),
    [1]
  );
});

test('gli impegni seguono la loro seduta, anche se ancora aperti', () => {
  const sessions = [
    session(1, '2026-01-10T10:00:00.000Z'),
    session(2, '2026-08-01T10:00:00.000Z'),
  ];
  const commitments = [
    commitment(10, 1), // preso a gennaio: fuori dagli «ultimi 3 mesi»
    commitment(11, 2),
    commitment(12, 2),
  ];

  const windowed = windowJourneyInputs({
    sessions,
    commitments,
    since: journeyPeriodSince('3m', NOW),
  });

  assert.deepEqual(
    windowed.commitments.map((c) => c.id),
    [11, 12]
  );
});

test('la finestra non altera gli array ricevuti', () => {
  const sessions = [
    session(1, '2020-01-01T10:00:00.000Z'),
    session(2, '2026-08-01T10:00:00.000Z'),
  ];
  const commitments = [commitment(10, 1)];

  windowJourneyInputs({
    sessions,
    commitments,
    since: journeyPeriodSince('3m', NOW),
  });

  assert.equal(sessions.length, 2);
  assert.equal(commitments.length, 1);
});
