import assert from 'node:assert/strict';
import test from 'node:test';
import { describeSessionDuration } from './format';

const start = new Date('2026-08-21T11:30:00.000Z');
const end = new Date('2026-08-21T12:22:00.000Z');

test('con la chiamata registrata usa la durata vera', () => {
  const duration = describeSessionDuration({
    sessionStartedAt: start,
    sessionEndedAt: end,
    durationMin: 60,
  });
  assert.deepEqual(duration, { label: '52 min', measured: true });
});

/*
 * È il caso della scheda che non mostrava niente: seduta trascorsa, chiamata
 * mai avviata o non ancora chiusa. La durata concordata è nota dalla
 * prenotazione, e non dipende da registrazione né da approvazione.
 */
test('senza chiamata mostra la durata concordata, dicendo che è prevista', () => {
  const duration = describeSessionDuration({
    sessionStartedAt: null,
    sessionEndedAt: null,
    durationMin: 60,
  });
  assert.deepEqual(duration, { label: '1h 00m previsti', measured: false });
});

test('una chiamata aperta e mai chiusa ricade sulla durata concordata', () => {
  assert.deepEqual(
    describeSessionDuration({
      sessionStartedAt: start,
      sessionEndedAt: null,
      durationMin: 45,
    }),
    { label: '45 min previsti', measured: false }
  );
});

/*
 * Meglio niente che «0 min»: senza durata concordata non c'è una risposta, e
 * inventarne una la fa sembrare un fatto.
 */
test('senza nessuna delle due non mostra niente', () => {
  assert.equal(
    describeSessionDuration({
      sessionStartedAt: null,
      sessionEndedAt: null,
      durationMin: null,
    }),
    null
  );
  assert.equal(
    describeSessionDuration({
      sessionStartedAt: null,
      sessionEndedAt: null,
      durationMin: 0,
    }),
    null
  );
});
