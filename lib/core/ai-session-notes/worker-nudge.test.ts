import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKER_NUDGE_INTERVAL_MS,
  isPendingAiNotesStatus,
  isRetryableAiNotesStatus,
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

test('un report fallito ma riprovabile sveglia comunque il worker', () => {
  // Il caso reale: il primo tentativo va in timeout, il job torna in coda con
  // due tentativi su tre, e la sessione passa a `report_failed`. Se quella
  // parola spegne la sveglia, il tentativo buono aspetta il cron di notte.
  for (const status of ['report_failed', 'transcription_failed']) {
    assert.equal(
      shouldNudgeWorker({ status, lastNudgeAt: null, now: 1_000 }),
      true,
      `stato ${status}`
    );
  }
});

test('a schermo una sessione fallita resta fallita, non «in corso»', () => {
  // Le due domande sono diverse: «mostro la rotellina?» e «vale la pena
  // riprovare?». Tenerle separate è il punto di questa distinzione.
  assert.equal(isPendingAiNotesStatus('report_failed'), false);
  assert.equal(isRetryableAiNotesStatus('report_failed'), true);
  assert.equal(isRetryableAiNotesStatus('cancelled'), false);
  assert.equal(isRetryableAiNotesStatus('ready_for_review'), false);
});

test('anche la sveglia sui falliti rispetta la soglia anti-rumore', () => {
  const now = 1_000_000;
  assert.equal(
    shouldNudgeWorker({ status: 'report_failed', lastNudgeAt: now - 3_000, now }),
    false
  );
});
