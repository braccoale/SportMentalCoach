import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SESSION_DURATION_MIN,
  SESSION_DURATION_OPTIONS,
  isSessionDuration,
  parseSessionDuration,
} from './duration';

test('il default è una delle durate proposte', () => {
  assert.equal(isSessionDuration(DEFAULT_SESSION_DURATION_MIN), true);
  assert.equal(DEFAULT_SESSION_DURATION_MIN, 40);
});

test('accetta solo le durate in elenco', () => {
  for (const minutes of SESSION_DURATION_OPTIONS) {
    assert.equal(parseSessionDuration(String(minutes)), minutes);
  }
  assert.equal(parseSessionDuration('45'), null);
  assert.equal(parseSessionDuration('90'), null);
  assert.equal(parseSessionDuration('0'), null);
  assert.equal(parseSessionDuration('-40'), null);
});

test('un campo mancante non scivola sul default', () => {
  // Se il form non manda la durata è rotto: deve emergere come errore, non
  // trasformarsi silenziosamente in una sessione da 40 minuti.
  assert.equal(parseSessionDuration(null), null);
  assert.equal(parseSessionDuration(undefined), null);
  assert.equal(parseSessionDuration(''), null);
  assert.equal(parseSessionDuration('  '), null);
  assert.equal(parseSessionDuration('quaranta'), null);
});

test('tollera gli spazi attorno al valore', () => {
  assert.equal(parseSessionDuration(' 30 '), 30);
});
