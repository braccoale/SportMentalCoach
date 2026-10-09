import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_COMPLETENESS_WEIGHT,
  activityScore,
  discoveryRankScore,
  normalizeCompletenessWeight,
} from './ranking';

const none = { totalMinutes: 0, athletesCount: 0, ratingAverage: null, ratingCount: 0 };

describe('normalizeCompletenessWeight', () => {
  it('un intero da 0 a 100, altrimenti il predefinito', () => {
    assert.equal(normalizeCompletenessWeight(35), 35);
    assert.equal(normalizeCompletenessWeight(0), 0);
    assert.equal(normalizeCompletenessWeight(150), 100);
    assert.equal(normalizeCompletenessWeight(-5), 0);
    assert.equal(normalizeCompletenessWeight(20.6), 21);
    assert.equal(normalizeCompletenessWeight('20'), DEFAULT_COMPLETENESS_WEIGHT);
    assert.equal(normalizeCompletenessWeight(NaN), DEFAULT_COMPLETENESS_WEIGHT);
    assert.equal(normalizeCompletenessWeight(null), DEFAULT_COMPLETENESS_WEIGHT);
  });
});

describe('activityScore', () => {
  it('nessuna attività vale 0, e le ore si saturano a 50', () => {
    assert.equal(activityScore(none), 0);
    assert.equal(activityScore({ ...none, totalMinutes: 50 * 60 }), 60);
    assert.equal(activityScore({ ...none, totalMinutes: 500 * 60 }), 60);
  });
  it('gli atleti si saturano a 15', () => {
    assert.equal(activityScore({ ...none, athletesCount: 15 }), 25);
    assert.equal(activityScore({ ...none, athletesCount: 40 }), 25);
  });
  it('la valutazione conta solo con almeno tre recensioni', () => {
    assert.equal(activityScore({ ...none, ratingAverage: 5, ratingCount: 1 }), 0);
    assert.equal(activityScore({ ...none, ratingAverage: 5, ratingCount: 3 }), 15);
  });
  it('il massimo è 100', () => {
    assert.equal(
      activityScore({ totalMinutes: 99999, athletesCount: 99, ratingAverage: 5, ratingCount: 50 }),
      100
    );
  });
});

describe('discoveryRankScore', () => {
  const veteran = { totalMinutes: 20 * 60, athletesCount: 8, ratingAverage: 4.5, ratingCount: 6 };

  it('a peso 0 conta solo l’attività', () => {
    assert.equal(
      discoveryRankScore({ ...veteran, completeness: 10 }, 0),
      activityScore(veteran)
    );
  });
  it('a peso 100 conta solo la completezza', () => {
    assert.equal(discoveryRankScore({ ...veteran, completeness: 40 }, 100), 40);
  });
  it('al peso predefinito un coach nuovo e completo non scavalca uno molto attivo', () => {
    const nuovoCompleto = discoveryRankScore({ ...none, completeness: 100 }, DEFAULT_COMPLETENESS_WEIGHT);
    const attivoMedio = discoveryRankScore({ ...veteran, completeness: 60 }, DEFAULT_COMPLETENESS_WEIGHT);
    assert.ok(attivoMedio > nuovoCompleto, `${attivoMedio} deve superare ${nuovoCompleto}`);
  });
  it('ma fra due coach con la stessa attività vince il profilo più completo', () => {
    const a = discoveryRankScore({ ...veteran, completeness: 90 }, DEFAULT_COMPLETENESS_WEIGHT);
    const b = discoveryRankScore({ ...veteran, completeness: 40 }, DEFAULT_COMPLETENESS_WEIGHT);
    assert.ok(a > b);
  });
  it('e fra due coach nuovi vince quello con il profilo più completo', () => {
    const a = discoveryRankScore({ ...none, completeness: 80 }, DEFAULT_COMPLETENESS_WEIGHT);
    const b = discoveryRankScore({ ...none, completeness: 30 }, DEFAULT_COMPLETENESS_WEIGHT);
    assert.ok(a > b);
  });
});
