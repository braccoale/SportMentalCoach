import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seriesBucketLabel } from './series-label';

test('un giorno si scrive giorno/mese', () => {
  assert.equal(seriesBucketLabel('2026-06-30'), '30/06');
  assert.equal(seriesBucketLabel('2026-01-05'), '05/01');
});

test('un mese si scrive con il nome, e agosto è distinguibile da aprile', () => {
  assert.equal(seriesBucketLabel('2026-08'), 'ago 26');
  assert.equal(seriesBucketLabel('2026-09'), 'set 26');
  assert.equal(seriesBucketLabel('2026-04'), 'apr 26');
});

test('la forma dell’etichetta dice da sola se è un giorno o un mese', () => {
  assert.notEqual(seriesBucketLabel('2026-08'), seriesBucketLabel('2026-08-01'));
});

test('un valore che non è né un giorno né un mese torna com’è, senza rompere il grafico', () => {
  assert.equal(seriesBucketLabel('2026-99'), '2026-99');
  assert.equal(seriesBucketLabel('boh'), 'boh');
});
