import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callSpan, formatCallDuration } from './call-span';

const at = (hhmm: string) => new Date(`2026-09-29T${hhmm}:00Z`);

test('chiamata mai partita: niente orari, niente durata', () => {
  assert.deepEqual(
    callSpan({ sessionStartedAt: null, sessionEndedAt: null, isLive: false }),
    { startedAt: null, endedAt: null, durationMin: null, inProgress: false }
  );
});

test('chiamata finita: inizio, fine (ultimo battito) e durata', () => {
  const span = callSpan({
    sessionStartedAt: at('14:32'),
    sessionEndedAt: at('15:24'),
    isLive: false,
  });
  assert.equal(span.endedAt?.toISOString(), at('15:24').toISOString());
  assert.equal(span.durationMin, 52);
  assert.equal(span.inProgress, false);
});

test('chiamata in corso: la fine non si mostra, la durata è quella fino a ora', () => {
  const span = callSpan({
    sessionStartedAt: at('14:30'),
    // L'ultimo battito è di pochi secondi fa: non è una chiusura.
    sessionEndedAt: at('14:49'),
    isLive: true,
    now: at('14:50'),
  });
  assert.equal(span.endedAt, null);
  assert.equal(span.durationMin, 20);
  assert.equal(span.inProgress, true);
});

test('fine precedente all’inizio (dato incoerente): nessuna durata inventata', () => {
  const span = callSpan({
    sessionStartedAt: at('15:00'),
    sessionEndedAt: at('14:00'),
    isLive: false,
  });
  assert.equal(span.durationMin, null);
});

test('formatCallDuration', () => {
  assert.equal(formatCallDuration(0), '0′');
  assert.equal(formatCallDuration(52), '52′');
  assert.equal(formatCallDuration(65), '1 h 05′');
});
