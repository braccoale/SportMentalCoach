import assert from 'node:assert/strict';
import test from 'node:test';
import { compassDelta, compassMetrics } from './compass-comparison';
import type { SessionCompassReport } from './session-compass-contract';

function evidence(segment: number, minute: number) {
  return {
    transcriptSegmentId: segment,
    startMs: minute * 60_000,
    endMs: minute * 60_000 + 1000,
    minute,
    speaker: 'athlete' as const,
    quote: 'x',
  };
}

function report(parti: Record<string, unknown>): SessionCompassReport {
  return {
    sessionOverview: { summary: '', summaryEvidence: [], themes: [] },
    keyMoments: [],
    commitments: [],
    nextSessionPrep: [],
    ...parti,
  } as unknown as SessionCompassReport;
}

test('conta sezioni e citazioni, e i segmenti ripetuti valgono una volta', () => {
  const doc = report({
    sessionOverview: {
      summary: 'abcde',
      summaryEvidence: [evidence(1, 3)],
      themes: [
        { id: 't1', text: 'a', evidence: evidence(1, 3) },
        { id: 't2', text: 'b', evidence: evidence(2, 10) },
      ],
    },
    keyMoments: [{ id: 'k1', evidence: evidence(2, 10) }],
    story: { paragraphs: [{ id: 'p1', text: 'xyz', evidence: evidence(5, 30) }] },
  });
  const m = compassMetrics(doc);
  assert.equal(m.temi, 2);
  assert.equal(m.momentiChiave, 1);
  assert.equal(m.paragrafiStoria, 1);
  assert.equal(m.caratteriSintesi, 5);
  assert.equal(m.caratteriStoria, 3);
  assert.equal(m.citazioni, 5);
  assert.equal(m.segmentiCitati, 3);
  assert.equal(m.minutiCitati, 3);
});

test('un documento vuoto è valido e segnala le sezioni vuote', () => {
  const m = compassMetrics(report({}));
  assert.deepEqual(m.sezioniVuote, [
    'sintesi',
    'temi',
    'momentiChiave',
    'preparazione',
    'storia',
  ]);
  assert.equal(m.citazioni, 0);
});

test('i campi opzionali mancanti non fanno cadere il conteggio', () => {
  const doc = {
    keyMoments: undefined,
    commitments: undefined,
    nextSessionPrep: undefined,
  } as unknown as SessionCompassReport;
  assert.doesNotThrow(() => compassMetrics(doc));
});

test('compassDelta ha il segno di «altra meno base» e confronta le sezioni vuote', () => {
  const base = compassMetrics(report({}));
  const altra = compassMetrics(
    report({
      sessionOverview: {
        summary: 'abc',
        summaryEvidence: [evidence(1, 1)],
        themes: [{ id: 't', text: 'a', evidence: evidence(2, 2) }],
      },
    })
  );
  const delta = compassDelta(base, altra);
  assert.equal(delta.numeri.temi, 1);
  assert.equal(delta.numeri.citazioni, 2);
  assert.deepEqual(delta.vuoteInMeno, ['sintesi', 'temi']);
  assert.deepEqual(delta.vuoteInPiu, []);
});
