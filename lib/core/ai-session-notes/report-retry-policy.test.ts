import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTOMATIC_REOPEN_COOLDOWN_MS,
  AUTOMATIC_REOPEN_MAX_AGE_MS,
  MAX_AUTOMATIC_REOPENINGS,
  decideAutomaticReopen,
  routesToLongRunner,
  type AutomaticReopenFacts,
} from './report-retry-policy';

const NOW = new Date('2026-09-25T15:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

function facts(overrides: Partial<AutomaticReopenFacts> = {}): AutomaticReopenFacts {
  return {
    status: 'report_failed',
    segmentCount: 700,
    automaticReopenCount: 0,
    failedAt: minutesAgo(30),
    now: NOW,
    ...overrides,
  };
}

test('riapre un riepilogo fallito con la trascrizione intatta, passata la pausa', () => {
  assert.deepEqual(decideAutomaticReopen(facts()), { reopen: true });
});

test('riapre anche alla seconda volta, non oltre il limite', () => {
  assert.equal(
    decideAutomaticReopen(facts({ automaticReopenCount: MAX_AUTOMATIC_REOPENINGS - 1 })).reopen,
    true
  );
  assert.deepEqual(
    decideAutomaticReopen(facts({ automaticReopenCount: MAX_AUTOMATIC_REOPENINGS })),
    { reopen: false, reason: 'LIMIT_REACHED' }
  );
});

test('non riapre una sessione che non è in report_failed', () => {
  for (const status of ['processing', 'ready_for_review', 'transcription_failed', 'approved']) {
    assert.deepEqual(decideAutomaticReopen(facts({ status })), {
      reopen: false,
      reason: 'NOT_FAILED',
    });
  }
});

test('senza trascrizione non c\'è niente da riprendere', () => {
  assert.deepEqual(decideAutomaticReopen(facts({ segmentCount: 0 })), {
    reopen: false,
    reason: 'NO_TRANSCRIPT',
  });
});

test('rispetta la pausa: un fallimento appena avvenuto non si riprova subito', () => {
  const justFailed = decideAutomaticReopen(facts({ failedAt: minutesAgo(2) }));
  assert.deepEqual(justFailed, { reopen: false, reason: 'TOO_SOON' });
  // Il confine è incluso: allo scadere esatto della pausa si può riaprire.
  const atBoundary = new Date(NOW.getTime() - AUTOMATIC_REOPEN_COOLDOWN_MS);
  assert.equal(decideAutomaticReopen(facts({ failedAt: atBoundary })).reopen, true);
});

test('non fa risorgere una seduta ferma da settimane', () => {
  const old = new Date(NOW.getTime() - AUTOMATIC_REOPEN_MAX_AGE_MS - 60_000);
  assert.deepEqual(decideAutomaticReopen(facts({ failedAt: old })), {
    reopen: false,
    reason: 'TOO_OLD',
  });
});

test('se non si sa quando è fallita, non indovina', () => {
  assert.deepEqual(decideAutomaticReopen(facts({ failedAt: null })), {
    reopen: false,
    reason: 'UNKNOWN_FAILURE_TIME',
  });
});

test('solo il timeout va al worker lungo: un rifiuto del contratto no', () => {
  assert.equal(routesToLongRunner('COMPASS_TIMEOUT'), true);
  assert.equal(routesToLongRunner('COMPASS_INVALID'), false);
  assert.equal(routesToLongRunner('COMPASS_RATE_LIMITED'), false);
  assert.equal(routesToLongRunner('PROCESSING_FAILED'), false);
  assert.equal(routesToLongRunner(null), false);
  assert.equal(routesToLongRunner(undefined), false);
});
