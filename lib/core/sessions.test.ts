import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FALLBACK_SESSION_DURATION_MIN,
  REQUEST_EXPIRY_GRACE_MINUTES,
  REQUEST_RESPONSE_WINDOW_HOURS,
  VIDEO_JOIN_LEAD_MINUTES,
  canJoinVideoNow,
  isRequestExpired,
  isSessionJoinable,
  isSessionUpcoming,
  nextVideoJoinAvailabilityChange,
  sessionEndsAt,
} from './sessions';

const D40 = 40;

const min = (n: number) => n * 60_000;
const hours = (n: number) => n * 60 * 60_000;

test('la richiesta non scade nell’istante in cui arriva l’ora della sessione', () => {
  // Il caso reale: richiesta alle 17:24 per le 17:40. Alle 17:41 il coach
  // deve poter ancora accettare — la stanza resterebbe aperta comunque.
  const requestedAt = new Date('2026-08-10T15:24:00Z');
  const scheduledFor = new Date('2026-08-10T15:40:00Z');

  assert.equal(
    isRequestExpired(requestedAt, scheduledFor, new Date(scheduledFor.getTime() + min(1))),
    false
  );
  assert.equal(
    isRequestExpired(
      requestedAt,
      scheduledFor,
      new Date(scheduledFor.getTime() + min(REQUEST_EXPIRY_GRACE_MINUTES - 1))
    ),
    false
  );
});

test('passata la tolleranza la richiesta è scaduta', () => {
  const requestedAt = new Date('2026-08-10T15:24:00Z');
  const scheduledFor = new Date('2026-08-10T15:40:00Z');

  assert.equal(
    isRequestExpired(
      requestedAt,
      scheduledFor,
      new Date(scheduledFor.getTime() + min(REQUEST_EXPIRY_GRACE_MINUTES + 1))
    ),
    true
  );
});

test('senza orario proposto vale solo la finestra di risposta', () => {
  const requestedAt = new Date('2026-08-10T15:24:00Z');

  assert.equal(
    isRequestExpired(
      requestedAt,
      null,
      new Date(requestedAt.getTime() + hours(REQUEST_RESPONSE_WINDOW_HOURS - 1))
    ),
    false
  );
  assert.equal(
    isRequestExpired(
      requestedAt,
      null,
      new Date(requestedAt.getTime() + hours(REQUEST_RESPONSE_WINDOW_HOURS + 1))
    ),
    true
  );
});

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

/*
 * Il caso che ha rotto tutto: `sessionEndedAt` scambiata per una chiusura.
 *
 * E` il battito di chi e` collegato, riscritto a ogni ping. Trattarlo come
 * «finita» faceva sparire la sessione dalle prossime nell'istante in cui
 * qualcuno ci entrava: uscivi un attimo e non la ritrovavi piu` in cima.
 */
test('una sessione lasciata senza chiuderla resta fra le prossime', () => {
  const scheduledFor = new Date('2026-07-28T12:00:00.000Z');
  const base = { scheduledFor, durationMin: D40, status: 'accepted' };

  // Appena usciti: il battito e` di un minuto fa, la sessione e` ancora la
  // prossima cosa che ci riguarda.
  assert.equal(
    isSessionUpcoming(
      { ...base, lastHeartbeatAt: new Date('2026-07-28T12:09:00.000Z') },
      new Date('2026-07-28T12:10:00.000Z')
    ),
    true
  );

  // Nessuno c'e` mai entrato: nessun battito, e la finestra e` aperta.
  assert.equal(
    isSessionUpcoming(
      { ...base, lastHeartbeatAt: null },
      new Date('2026-07-28T11:50:00.000Z')
    ),
    true
  );

  // Il battito tace da piu` di cinque minuti: se n'e` andata davvero, anche
  // se l'orario direbbe che la finestra e` ancora aperta.
  assert.equal(
    isSessionUpcoming(
      { ...base, lastHeartbeatAt: new Date('2026-07-28T12:05:00.000Z') },
      new Date('2026-07-28T12:20:00.000Z')
    ),
    false
  );
});

test('la finestra e lo stato chiudono comunque una sessione', () => {
  const scheduledFor = new Date('2026-07-28T12:00:00.000Z');
  const base = { scheduledFor, durationMin: D40, lastHeartbeatAt: null };

  // Finisce alle 12:40, piu` un quarto d'ora di tolleranza per rientrare.
  assert.equal(
    isSessionUpcoming(
      { ...base, status: 'accepted' },
      new Date('2026-07-28T12:54:00.000Z')
    ),
    true
  );
  assert.equal(
    isSessionUpcoming(
      { ...base, status: 'accepted' },
      new Date('2026-07-28T12:56:00.000Z')
    ),
    false
  );

  // Disdetta o conclusa: non e` in arrivo, qualunque cosa dica l'orologio.
  for (const status of ['cancelled', 'declined', 'expired', 'completed']) {
    assert.equal(
      isSessionUpcoming(
        { ...base, status },
        new Date('2026-07-28T11:30:00.000Z')
      ),
      false,
      status
    );
  }

  // Una richiesta senza orario non e` un appuntamento da attendere.
  assert.equal(
    isSessionUpcoming(
      { ...base, scheduledFor: null, status: 'requested' },
      new Date('2026-07-28T11:30:00.000Z')
    ),
    false
  );
});
