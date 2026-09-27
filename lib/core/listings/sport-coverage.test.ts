import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sportsCoveredByCoaches } from './sport-coverage';

const SPORTS = [
  { key: 'calcio', label: 'Calcio' },
  { key: 'tennis', label: 'Tennis' },
  { key: 'nuoto', label: 'Nuoto' },
];

test('solo gli sport con almeno un coach, nell’ordine della tassonomia', () => {
  const coaches = [{ categories: ['nuoto'] }, { categories: ['calcio', 'nuoto'] }];
  assert.deepEqual(
    sportsCoveredByCoaches(SPORTS, coaches).map((s) => s.key),
    ['calcio', 'nuoto']
  );
});

test('coach senza sport o nessun coach: nessun collegamento', () => {
  assert.deepEqual(sportsCoveredByCoaches(SPORTS, [{ categories: null }]), []);
  assert.deepEqual(sportsCoveredByCoaches(SPORTS, []), []);
});

test('una chiave che non è nella tassonomia non genera un collegamento', () => {
  assert.deepEqual(sportsCoveredByCoaches(SPORTS, [{ categories: ['padel'] }]), []);
});
