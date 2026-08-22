import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSportKey } from './sport-key';
import { sports } from '@/lib/verticals/sport-mental-coach/taxonomies';

test('una chiave valida resta se stessa', () => {
  assert.equal(normalizeSportKey('football'), 'football');
  assert.equal(normalizeSportKey('martial_arts'), 'martial_arts');
});

/*
 * È il caso vero: il profilo dell'utente 68 conteneva «Calcio», scritto a mano
 * nel campo di testo libero che il modulo suggeriva di riempire così.
 */
test('l’etichetta italiana torna alla sua chiave', () => {
  assert.equal(normalizeSportKey('Calcio'), 'football');
  assert.equal(normalizeSportKey('calcio'), 'football');
  assert.equal(normalizeSportKey('  CALCIO  '), 'football');
  assert.equal(normalizeSportKey('Arti marziali'), 'martial_arts');
  assert.equal(normalizeSportKey('arti  marziali'), 'martial_arts');
});

test('vuoto e assente sono «non lo so»', () => {
  assert.equal(normalizeSportKey(null), null);
  assert.equal(normalizeSportKey(undefined), null);
  assert.equal(normalizeSportKey('   '), null);
});

test('quello che non è né chiave né etichetta non passa', () => {
  assert.equal(normalizeSportKey('Scherma'), null);
  assert.equal(normalizeSportKey('<script>'), null);
});

/*
 * Il giro completo: ogni etichetta della tassonomia deve tornare alla propria
 * chiave. Se qualcuno aggiunge uno sport con un'etichetta ambigua, qui si vede
 * prima che in produzione.
 */
test('ogni etichetta della tassonomia risale alla propria chiave', () => {
  for (const sport of sports) {
    assert.equal(normalizeSportKey(sport.label), sport.key, sport.label);
    assert.equal(normalizeSportKey(sport.key), sport.key, sport.key);
  }
});
