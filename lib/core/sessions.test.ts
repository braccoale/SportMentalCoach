import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FALLBACK_SESSION_DURATION_MIN,
  VIDEO_JOIN_LEAD_MINUTES,
  canJoinVideoNow,
  isSessionJoinable,
  nextVideoJoinAvailabilityChange,
  sessionEndsAt,
} from './sessions';

const D40 = 40;

test('una sessione futura o ancora in corso non è passata', () => {
  const now = new Date('2026-07-28T12:00:00.000Z');
  // Deve ancora iniziare.
  assert.equal(
    isSessionJoinable(new Date('2026-07-28T12:30:00.000Z'), D40, now),
    true
  );
  // Iniziata da 30 minuti su 40: è ancora viva.
  assert.equal(
    isSessionJoinable(new Date('2026-07-28T11:30:00.000Z'), D40, now),
    true
  );
  // Senza orario concordato non scade mai: l'orario si fissa in chat.
  assert.equal(isSessionJoinable(null, D40, now), true);
});

test('la sessione scade quando finisce la sua durata, non due ore dopo', () => {
  const start = new Date('2026-07-28T12:00:00.000Z');

  // Ultimo istante utile: la fine esatta.
  assert.equal(
    isSessionJoinable(start, D40, new Date('2026-07-28T12:40:00.000Z')),
    true
  );
  // Un secondo dopo la fine è passato.
  assert.equal(
    isSessionJoinable(start, D40, new Date('2026-07-28T12:40:00.001Z')),
    false
  );
  // Il vecchio comportamento — due ore buone di tolleranza — non deve tornare.
  assert.equal(
    isSessionJoinable(start, D40, new Date('2026-07-28T13:30:00.000Z')),
    false
  );
});

test('ogni sessione scade secondo la propria durata', () => {
  const start = new Date('2026-07-28T12:00:00.000Z');
  const at = (iso: string) => new Date(iso);

  // Dieci minuti sono chiusi quando i sessanta sono ancora aperti.
  assert.equal(isSessionJoinable(start, 10, at('2026-07-28T12:11:00.000Z')), false);
  assert.equal(isSessionJoinable(start, 60, at('2026-07-28T12:11:00.000Z')), true);
  assert.equal(isSessionJoinable(start, 60, at('2026-07-28T13:01:00.000Z')), false);
});

test('senza durata vale il fallback, non una finestra infinita', () => {
  const start = new Date('2026-07-28T12:00:00.000Z');
  assert.equal(FALLBACK_SESSION_DURATION_MIN, 40);

  for (const missing of [null, undefined, 0]) {
    assert.equal(
      isSessionJoinable(start, missing, new Date('2026-07-28T12:39:00.000Z')),
      true,
      `durata ${missing}: dentro il fallback`
    );
    assert.equal(
      isSessionJoinable(start, missing, new Date('2026-07-28T12:41:00.000Z')),
      false,
      `durata ${missing}: oltre il fallback`
    );
  }

  assert.equal(
    sessionEndsAt(start, null).toISOString(),
    '2026-07-28T12:40:00.000Z'
  );
});

test('video access opens exactly five minutes before the appointment', () => {
  const scheduledFor = new Date('2026-07-28T12:30:00.000Z');

  assert.equal(
    canJoinVideoNow(scheduledFor, D40, new Date('2026-07-28T12:24:59.999Z')),
    false
  );
  assert.equal(
    canJoinVideoNow(scheduledFor, D40, new Date('2026-07-28T12:25:00.000Z')),
    true
  );
  assert.equal(VIDEO_JOIN_LEAD_MINUTES, 5);
});

test('oltre la fine non si entra più nella stanza', () => {
  const scheduledFor = new Date('2026-07-28T12:30:00.000Z');
  assert.equal(
    canJoinVideoNow(scheduledFor, D40, new Date('2026-07-28T13:10:00.001Z')),
    false
  );
});

test('video controls can schedule their next availability update', () => {
  const scheduledFor = new Date('2026-07-28T12:30:00.000Z');

  // Prima dell'apertura: il prossimo cambio è l'apertura.
  assert.equal(
    nextVideoJoinAvailabilityChange(
      scheduledFor,
      D40,
      new Date('2026-07-28T12:00:00.000Z')
    )?.toISOString(),
    '2026-07-28T12:25:00.000Z'
  );
  // Dentro la finestra: il prossimo cambio è la chiusura, cioè la fine.
  assert.equal(
    nextVideoJoinAvailabilityChange(
      scheduledFor,
      D40,
      new Date('2026-07-28T12:25:00.000Z')
    )?.toISOString(),
    '2026-07-28T13:10:00.001Z'
  );
  // Dopo la fine non cambia più nulla.
  assert.equal(
    nextVideoJoinAvailabilityChange(
      scheduledFor,
      D40,
      new Date('2026-07-28T13:10:00.001Z')
    ),
    null
  );
});
