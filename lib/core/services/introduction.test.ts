import assert from 'node:assert/strict';
import test from 'node:test';
import { isIntroDurationValid, INTRO_SESSION } from './introduction';

test('un servizio non-intro accetta qualunque durata', () => {
  assert.equal(isIntroDurationValid(false, 30), true);
  assert.equal(isIntroDurationValid(null, 60), true);
});

test('la sessione conoscitiva accetta solo i suoi 20 minuti', () => {
  assert.equal(isIntroDurationValid(true, INTRO_SESSION.durationMin), true);
  assert.equal(isIntroDurationValid(true, 30), false);
  assert.equal(isIntroDurationValid(true, 10), false);
});
