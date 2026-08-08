import assert from 'node:assert/strict';
import test from 'node:test';
import { isCallbackTokenWellFormed } from './stt-callback-policy';

test('un token valido è esadecimale di 64 caratteri', () => {
  assert.equal(isCallbackTokenWellFormed('a'.repeat(64)), true);
  assert.equal(isCallbackTokenWellFormed('0123456789abcdef'.repeat(4)), true);
});

test('un token troppo corto è rifiutato', () => {
  assert.equal(isCallbackTokenWellFormed('abc'), false);
});

test('un token troppo lungo è rifiutato', () => {
  assert.equal(isCallbackTokenWellFormed('a'.repeat(65)), false);
});

test('un token con caratteri non esadecimali è rifiutato', () => {
  assert.equal(isCallbackTokenWellFormed('z'.repeat(64)), false);
  assert.equal(isCallbackTokenWellFormed('A'.repeat(64)), false);
});

test('un percorso travestito da token è rifiutato', () => {
  assert.equal(isCallbackTokenWellFormed('../../etc/passwd'), false);
  assert.equal(isCallbackTokenWellFormed(`${'a'.repeat(63)}/`), false);
});
