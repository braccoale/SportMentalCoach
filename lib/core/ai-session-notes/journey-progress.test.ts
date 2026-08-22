import assert from 'node:assert/strict';
import test from 'node:test';
import type { MentalJourneyEntry } from './mental-journey';
import {
  MIN_PROGRESS_POINTS,
  buildJourneyProgress,
  latestJourneyInsight,
} from './journey-progress';

function entry(
  sessionId: number,
  day: number,
  values: number[],
  throughLine: string | null = null
): MentalJourneyEntry {
  return {
    sessionId,
    bookingId: 500 + sessionId,
    reportId: sessionId,
    reportVersion: 1,
    sharedAt: null,
    sessionDate: `2026-05-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    approvedAt: '2026-08-01T10:00:00.000Z',
    coachName: 'Coach',
    summary: 's',
    focus: null,
    themes: [],
    emergingResource: null,
    metrics: values.map((value, index) => ({
      key: 'energy',
      value,
      confidence: 'medium',
      transcriptSegmentId: index,
    })),
    keyMoments: [],
    nextSessionPrep: [],
    commitments: [],
    throughLine,
    isApproved: true,
    compassHref: `/dashboard/appointments/${500 + sessionId}`,
  } as MentalJourneyEntry;
}

test('sotto tre punti non si disegna una tendenza', () => {
  assert.equal(MIN_PROGRESS_POINTS, 3);
  assert.equal(buildJourneyProgress([entry(1, 1, [3]), entry(2, 5, [4])]), null);
});

test('una seduta senza indicatori non produce un punto', () => {
  const progress = buildJourneyProgress([
    entry(1, 1, [3]),
    entry(2, 5, []),
    entry(3, 9, [4]),
  ]);
  assert.equal(progress, null, 'restano due punti, non tre');
});

test('il punto e la media degli indicatori osservati in quella seduta', () => {
  const progress = buildJourneyProgress([
    entry(1, 1, [2, 4]),
    entry(2, 5, [3]),
    entry(3, 9, [5, 5]),
  ])!;

  assert.deepEqual(
    progress.points.map((point) => point.value),
    [3, 3, 5]
  );
  assert.deepEqual(
    progress.points.map((point) => point.metricCount),
    [2, 1, 2]
  );
});

test('la linea porta con se la sua fiducia piu debole', () => {
  const progress = buildJourneyProgress([
    entry(1, 1, [2, 4, 3]),
    entry(2, 5, [3]),
    entry(3, 9, [5, 5]),
  ])!;
  assert.equal(progress.weakestMetricCount, 1);
});

test('la scala e 1-5 e il cinque sta in alto', () => {
  const progress = buildJourneyProgress([
    entry(1, 1, [1]),
    entry(2, 5, [3]),
    entry(3, 9, [5]),
  ])!;
  assert.equal(progress.polyline, '0.0,100.0 50.0,50.0 100.0,0.0');
});

test('la linea si legge dal passato al presente', () => {
  const progress = buildJourneyProgress([
    entry(3, 9, [5]),
    entry(1, 1, [1]),
    entry(2, 5, [3]),
  ])!;
  assert.deepEqual(
    progress.points.map((point) => point.sessionId),
    [1, 2, 3]
  );
});

test("l'insight viene dal filo dell'ultima seduta che ne ha uno", () => {
  const insight = latestJourneyInsight([
    entry(3, 9, [5], null),
    entry(2, 5, [3], 'Il tema dell’errore torna, ma con più calma.'),
    entry(1, 1, [1], 'Primo filo.'),
  ])!;

  assert.equal(insight.text, 'Il tema dell’errore torna, ma con più calma.');
  assert.equal(insight.sessionId, 2);
  assert.equal(insight.href, '/dashboard/appointments/502#session-compass');
});

test('senza nessun filo, nessun insight inventato', () => {
  assert.equal(latestJourneyInsight([entry(1, 1, [3], null)]), null);
  assert.equal(latestJourneyInsight([entry(1, 1, [3], '   ')]), null);
});
