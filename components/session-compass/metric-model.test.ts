import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMetricTrendNarrative, compareSessionMetrics } from './metric-model';

test('interpreta la direzione delle metriche tenendo conto del loro significato', () => {
  const comparison = compareSessionMetrics(
    [
      { id: 'metric-1', key: 'confidence', value: 4, confidence: 'high', evidence: evidence() },
      { id: 'metric-2', key: 'pre_competition_anxiety', value: 2, confidence: 'medium', evidence: evidence() },
    ],
    [
      { key: 'confidence', value: 2 },
      { key: 'pre_competition_anxiety', value: 4 },
    ]
  );
  assert.deepEqual(comparison.map((item) => item.direction), ['improved', 'improved']);
});

test('genera una lettura del trend soltanto con almeno due valori reali', () => {
  assert.equal(buildMetricTrendNarrative([{ metrics: [{ key: 'confidence', value: 3 }] }]), null);
  const narrative = buildMetricTrendNarrative([
    { metrics: [{ key: 'confidence', value: 2 }, { key: 'concentration', value: 3 }] },
    { metrics: [{ key: 'confidence', value: 4 }, { key: 'concentration', value: 3 }] },
  ]);
  assert.match(narrative ?? '', /fiducia in miglioramento/);
  assert.match(narrative ?? '', /concentrazione stabile/);
});

function evidence() {
  return { transcriptSegmentId: 1, startMs: 0, minute: 0, speaker: 'athlete' as const, quote: 'evidenza' };
}
