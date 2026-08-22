import assert from 'node:assert/strict';
import test from 'node:test';
import {
  METRIC_META,
  METRIC_PROVENANCE,
  buildMetricTrendNarrative,
  compareSessionMetrics,
  metricTooltip,
} from './metric-model';
import { SESSION_METRIC_KEYS } from '@/lib/core/ai-session-notes/session-compass-contract';

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

test('la spiegazione dice che cos’è, che cosa vale qui e da dove viene', () => {
  const text = metricTooltip('confidence', 2, 'low');
  assert.match(text, /Fiducia — quanta fiducia/);
  assert.match(text, /2 su 5: basso/);
  assert.match(text, /un solo passaggio/);
  assert.ok(text.endsWith(METRIC_PROVENANCE));
});

test('per l’ansia pre-gara avverte che un valore alto non è un progresso', () => {
  assert.match(
    metricTooltip('pre_competition_anxiety', 4),
    /valore alto segnala più tensione, non un progresso/
  );
  assert.doesNotMatch(metricTooltip('confidence', 4), /non un progresso/);
});

test('senza valore resta una definizione, non un buco', () => {
  const text = metricTooltip('energy');
  assert.doesNotMatch(text, /undefined|su 5/);
  assert.match(text, /Energia — quanta energia/);
});

/*
 * La provenienza regge la classificazione AI Act del prodotto: le stime
 * vengono dal testo, non dalla voce. Toglierla da una schermata non darebbe
 * nessun errore, e nessuno se ne accorgerebbe fino alla domanda sbagliata.
 */
test('nessuna metrica può essere spiegata senza dire da dove viene', () => {
  for (const key of SESSION_METRIC_KEYS) {
    const text = metricTooltip(key, 3);
    assert.ok(text.includes(METRIC_PROVENANCE), key);
    assert.ok(text.includes(METRIC_META[key].definition), key);
  }
});
