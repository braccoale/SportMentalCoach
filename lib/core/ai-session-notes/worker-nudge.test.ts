import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKER_NUDGE_INTERVAL_MS,
  isPendingAiNotesStatus,
  shouldNudgeWorker,
} from './worker-nudge';

test('una sessione in lavorazione mai svegliata si sveglia subito', () => {
  assert.equal(
    shouldNudgeWorker({ status: 'processing', lastNudgeAt: null, now: 1_000 }),
    true
  );
});

test('una sessione ferma non sveglia nessuno', () => {
  for (const status of ['ready_for_review', 'cancelled', 'active', null, undefined]) {
    assert.equal(
      shouldNudgeWorker({ status, lastNudgeAt: null, now: 1_000 }),
      false,
      `stato ${String(status)}`
    );
  }
});

test('il polling non spara una sveglia al secondo', () => {
  const now = 1_000_000;
  // Tre secondi fa: il worker sta gia' girando, questa sveglia e' rumore.
  assert.equal(
    shouldNudgeWorker({ status: 'processing', lastNudgeAt: now - 3_000, now }),
    false
  );
  assert.equal(
    shouldNudgeWorker({
      status: 'processing',
      lastNudgeAt: now - WORKER_NUDGE_INTERVAL_MS,
      now,
    }),
    true
  );
});

test('vale anche per il report che si sta ancora scrivendo', () => {
  // La rotta del riepilogo parla un altro vocabolario, e non deve tradurlo.
  assert.equal(isPendingAiNotesStatus('generating'), true);
  assert.equal(isPendingAiNotesStatus('up_to_date'), false);
});
