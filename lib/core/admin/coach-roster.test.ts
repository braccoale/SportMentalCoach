import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachRosters } from './coach-roster';
import type { AdminBookingRow } from './booking-rows';

const NOW = new Date('2026-08-05T10:00:00Z');

function booking(
  over: Partial<AdminBookingRow> & {
    id: number;
    clientId: number;
    providerId: number;
  }
): AdminBookingRow {
  return {
    status: 'completed',
    coachName: 'Coach Demo',
    scheduledFor: null,
    requestedAt: new Date('2026-08-01T10:00:00Z'),
    sessionStartedAt: null,
    sessionEndedAt: null,
    clientName: 'Alessandro Bracco',
    clientEmail: 'alessandro@example.com',
    clientAvatarUrl: null,
    athleteSport: 'calcio',
    athleteLevel: null,
    athleteGoals: null,
    serviceTitle: 'Conoscitiva',
    durationMin: 40,
    athleteIsMinor: false,
    athleteAge: null,
    ...over,
  };
}

test('ogni coach ha il suo elenco, e chi non ha prenotazioni non ha elenco', () => {
  const rosters = buildCoachRosters(
    [
      booking({ id: 1, clientId: 7, providerId: 100 }),
      booking({ id: 2, clientId: 8, providerId: 100 }),
      booking({ id: 3, clientId: 7, providerId: 200 }),
    ],
    NOW
  );

  assert.equal(rosters.get(100)?.athletes.length, 2);
  assert.equal(rosters.get(200)?.athletes.length, 1);
  // Il coach senza prenotazioni non compare: la pagina distingue «nessun
  // atleta» da «non ha ancora iniziato» proprio su questa assenza.
  assert.equal(rosters.has(300), false);
});

test('lo stesso atleta con più sedute conta una volta sola', () => {
  const rosters = buildCoachRosters(
    [
      booking({ id: 1, clientId: 7, providerId: 100 }),
      booking({ id: 2, clientId: 7, providerId: 100 }),
      booking({ id: 3, clientId: 7, providerId: 100 }),
    ],
    NOW
  );

  const roster = rosters.get(100)!;
  assert.equal(roster.athletes.length, 1);
  assert.equal(roster.athletes[0].completedSessions, 3);
});

test('«segue» conta gli atleti con una prenotazione aperta, non tutti quelli passati', () => {
  const roster = buildCoachRosters(
    [
      booking({ id: 1, clientId: 7, providerId: 100, status: 'accepted' }),
      booking({ id: 2, clientId: 8, providerId: 100, status: 'completed' }),
      booking({ id: 3, clientId: 9, providerId: 100, status: 'cancelled' }),
    ],
    NOW
  ).get(100)!;

  assert.equal(roster.athletes.length, 3);
  assert.equal(roster.activeAthletes, 1);
});

test('i prossimi appuntamenti arrivano dal più vicino e non contengono il passato', () => {
  const roster = buildCoachRosters(
    [
      booking({
        id: 1,
        clientId: 7,
        providerId: 100,
        status: 'accepted',
        scheduledFor: new Date('2026-08-09T10:00:00Z'),
      }),
      booking({
        id: 2,
        clientId: 8,
        providerId: 100,
        status: 'accepted',
        clientName: 'Marco Rossi',
        scheduledFor: new Date('2026-08-06T09:00:00Z'),
      }),
      // Ieri: passato, non «prossimo».
      booking({
        id: 3,
        clientId: 9,
        providerId: 100,
        status: 'accepted',
        scheduledFor: new Date('2026-08-04T09:00:00Z'),
      }),
      // Disdetta: resta nello storico dell'atleta, non in agenda.
      booking({
        id: 4,
        clientId: 10,
        providerId: 100,
        status: 'cancelled',
        scheduledFor: new Date('2026-08-07T09:00:00Z'),
      }),
    ],
    NOW
  ).get(100)!;

  assert.deepEqual(
    roster.upcoming.map((session) => session.bookingId),
    [2, 1]
  );
  assert.equal(roster.upcoming[0].athleteName, 'Marco Rossi');
});

test('una richiesta ancora da decidere si vede, e si vede che non è confermata', () => {
  const roster = buildCoachRosters(
    [
      booking({
        id: 1,
        clientId: 7,
        providerId: 100,
        status: 'requested',
        scheduledFor: new Date('2026-08-06T09:00:00Z'),
      }),
    ],
    NOW
  ).get(100)!;

  assert.equal(roster.upcoming.length, 1);
  assert.equal(roster.upcoming[0].status, 'requested');
});

test('il nome in agenda è quello dell’elenco atleti, anche quando la prenotazione non ne porta uno', () => {
  const roster = buildCoachRosters(
    [
      booking({
        id: 1,
        clientId: 7,
        providerId: 100,
        clientName: null,
        clientEmail: 'giulia.neri@example.com',
        status: 'accepted',
        scheduledFor: new Date('2026-08-06T09:00:00Z'),
      }),
    ],
    NOW
  ).get(100)!;

  assert.equal(roster.athletes[0].name, 'giulia.neri');
  assert.equal(roster.upcoming[0].athleteName, 'giulia.neri');
});
