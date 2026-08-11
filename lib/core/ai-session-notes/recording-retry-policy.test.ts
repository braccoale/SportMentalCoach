import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_RETRY_ATTEMPTS,
  decideRecordingRetry,
} from './recording-retry-policy';

const now = new Date('2026-08-11T18:00:00Z');
const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000);

test('subito dopo il fallimento non si riprova', () => {
  // Il caso reale da evitare: due tentativi a tre secondi di distanza, che
  // sprecano il budget senza dare tempo al guasto di passare.
  const decision = decideRecordingRetry({
    failedAttempts: 1,
    lastFailureAt: secondsAgo(3),
    now,
    trackStillLive: true,
  });

  assert.deepEqual(decision, { retry: false, reason: 'too_soon' });
});

test('passata l`attesa si riprova', () => {
  const decision = decideRecordingRetry({
    failedAttempts: 1,
    lastFailureAt: secondsAgo(45),
    now,
    trackStillLive: true,
  });

  assert.deepEqual(decision, { retry: true, attempt: 2 });
});

test('l`attesa cresce a ogni tentativo', () => {
  // Dopo il secondo fallimento servono due minuti: novanta secondi non bastano
  // piu`, mentre bastavano dopo il primo.
  const tooSoon = decideRecordingRetry({
    failedAttempts: 2,
    lastFailureAt: secondsAgo(90),
    now,
    trackStillLive: true,
  });
  assert.equal(tooSoon.retry, false);

  const ready = decideRecordingRetry({
    failedAttempts: 2,
    lastFailureAt: secondsAgo(180),
    now,
    trackStillLive: true,
  });
  assert.deepEqual(ready, { retry: true, attempt: 3 });
});

test('a un certo punto si smette', () => {
  // Senza questo, una traccia che non ripartira` mai fa girare un tentativo
  // ogni cinque minuti fino a fine seduta.
  const decision = decideRecordingRetry({
    failedAttempts: MAX_RETRY_ATTEMPTS,
    lastFailureAt: secondsAgo(86_400),
    now,
    trackStillLive: true,
  });

  assert.deepEqual(decision, { retry: false, reason: 'exhausted' });
});

test('se la traccia non c`e` piu` non si riprova', () => {
  // Il partecipante ha chiuso: riprovare produce solo un altro fallimento
  // identico e una riga di registro che non racconta niente.
  const decision = decideRecordingRetry({
    failedAttempts: 1,
    lastFailureAt: secondsAgo(3600),
    now,
    trackStillLive: false,
  });

  assert.deepEqual(decision, { retry: false, reason: 'not_recoverable' });
});
