import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCoachAthletes,
  bookingsForAthlete,
  lastServiceByAthlete,
} from './coach-athletes';
import type { CoachBooking } from './index';

const NOW = new Date('2026-08-05T10:00:00Z');

function booking(over: Partial<CoachBooking> & { id: number; clientId: number }): CoachBooking {
  return {
    status: 'completed',
    note: null,
    scheduledFor: null,
    requestedAt: new Date('2026-08-01T10:00:00Z'),
    decidedAt: null,
    sessionStartedAt: null,
    sessionEndedAt: null,
    clientName: 'Alessandro Bracco',
    clientEmail: 'alessandro@example.com',
    clientAvatarUrl: null,
    athleteSport: 'calcio',
    athleteLevel: null,
    athleteGoals: null,
    serviceId: 1,
    serviceTitle: 'Conoscitiva',
    durationMin: 40,
    athleteIsMinor: false,
    ...over,
  };
}

test('raggruppa le prenotazioni per atleta', () => {
  const athletes = buildCoachAthletes(
    [
      booking({ id: 1, clientId: 7 }),
      booking({ id: 2, clientId: 7 }),
      booking({ id: 3, clientId: 9, clientName: 'Marco Rossi' }),
    ],
    NOW
  );
  assert.equal(athletes.length, 2);
  assert.equal(athletes.find((a) => a.userId === 7)?.completedSessions, 2);
});

test('è "in percorso" solo con una prenotazione aperta', () => {
  const [attivo] = buildCoachAthletes(
    [booking({ id: 1, clientId: 7, status: 'accepted' })],
    NOW
  );
  assert.equal(attivo.status, 'active');

  const [concluso] = buildCoachAthletes(
    [booking({ id: 2, clientId: 8, status: 'completed' })],
    NOW
  );
  assert.equal(concluso.status, 'past');
});

test('una richiesta ancora da valutare tiene l’atleta in percorso', () => {
  const [a] = buildCoachAthletes(
    [booking({ id: 1, clientId: 7, status: 'requested' })],
    NOW
  );
  assert.equal(a.status, 'active');
  assert.equal(a.pendingRequests, 1);
});

test('la prossima sessione è la più vicina fra quelle future e confermate', () => {
  const [a] = buildCoachAthletes(
    [
      booking({
        id: 1,
        clientId: 7,
        status: 'accepted',
        scheduledFor: new Date('2026-08-20T10:00:00Z'),
      }),
      booking({
        id: 2,
        clientId: 7,
        status: 'accepted',
        scheduledFor: new Date('2026-08-07T10:00:00Z'),
      }),
      // Passata: non deve mai essere proposta come "prossima".
      booking({
        id: 3,
        clientId: 7,
        status: 'accepted',
        scheduledFor: new Date('2026-08-01T10:00:00Z'),
      }),
    ],
    NOW
  );
  assert.equal(a.nextSessionAt?.toISOString(), '2026-08-07T10:00:00.000Z');
});

test('l’ultima sessione conta solo quelle davvero completate', () => {
  const [a] = buildCoachAthletes(
    [
      booking({
        id: 1,
        clientId: 7,
        status: 'completed',
        sessionEndedAt: new Date('2026-07-30T11:00:00Z'),
      }),
      // Annullata: non è mai avvenuta, non può essere "l'ultima sessione".
      booking({
        id: 2,
        clientId: 7,
        status: 'cancelled',
        scheduledFor: new Date('2026-08-02T10:00:00Z'),
      }),
    ],
    NOW
  );
  assert.equal(a.lastSessionAt?.toISOString(), '2026-07-30T11:00:00.000Z');
  assert.equal(a.completedSessions, 1);
});

test('il profilo viene letto dalla prenotazione più recente', () => {
  const [a] = buildCoachAthletes(
    [
      booking({
        id: 1,
        clientId: 7,
        requestedAt: new Date('2026-07-01T10:00:00Z'),
        athleteGoals: 'obiettivo vecchio',
      }),
      booking({
        id: 2,
        clientId: 7,
        requestedAt: new Date('2026-08-01T10:00:00Z'),
        athleteGoals: 'obiettivo aggiornato',
      }),
    ],
    NOW
  );
  assert.equal(a.goals, 'obiettivo aggiornato');
});

test('senza nome usa la parte locale dell’indirizzo', () => {
  const [a] = buildCoachAthletes(
    [booking({ id: 1, clientId: 7, clientName: null, clientEmail: 'mario.rossi@example.com' })],
    NOW
  );
  assert.equal(a.name, 'mario.rossi');
});

test('chi ha una sessione imminente viene prima', () => {
  const athletes = buildCoachAthletes(
    [
      booking({ id: 1, clientId: 7, status: 'completed', sessionEndedAt: NOW }),
      booking({
        id: 2,
        clientId: 9,
        clientName: 'Marco Rossi',
        status: 'accepted',
        scheduledFor: new Date('2026-08-06T10:00:00Z'),
      }),
    ],
    NOW
  );
  assert.equal(athletes[0].userId, 9);
});

test('a parità di attività viene prima chi ha svolto più sessioni', () => {
  const sameSessionDate = new Date('2026-08-04T10:00:00Z');
  const athletes = buildCoachAthletes(
    [
      booking({
        id: 1,
        clientId: 7,
        clientName: 'Anna Bianchi',
        sessionEndedAt: sameSessionDate,
      }),
      booking({
        id: 2,
        clientId: 9,
        clientName: 'Marco Rossi',
        sessionEndedAt: sameSessionDate,
      }),
      booking({
        id: 3,
        clientId: 9,
        clientName: 'Marco Rossi',
        sessionEndedAt: sameSessionDate,
      }),
    ],
    NOW
  );

  assert.deepEqual(
    athletes.map((athlete) => athlete.userId),
    [9, 7]
  );
});

test('l’ultimo servizio è quello della richiesta più recente, per atleta', () => {
  const last = lastServiceByAthlete([
    booking({
      id: 1,
      clientId: 7,
      serviceId: 3,
      requestedAt: new Date('2026-07-01T10:00:00Z'),
    }),
    booking({
      id: 2,
      clientId: 7,
      serviceId: 5,
      requestedAt: new Date('2026-08-01T10:00:00Z'),
    }),
    booking({
      id: 3,
      clientId: 9,
      serviceId: 2,
      requestedAt: new Date('2026-07-15T10:00:00Z'),
    }),
  ]);
  assert.deepEqual(last, { 7: 5, 9: 2 });
});

test('una sessione annullata dice comunque quale servizio è in uso', () => {
  const last = lastServiceByAthlete([
    booking({
      id: 1,
      clientId: 7,
      serviceId: 5,
      status: 'cancelled',
      requestedAt: new Date('2026-08-01T10:00:00Z'),
    }),
    booking({
      id: 2,
      clientId: 7,
      serviceId: 3,
      requestedAt: new Date('2026-07-01T10:00:00Z'),
    }),
  ]);
  assert.equal(last[7], 5);
});

test('le prenotazioni senza servizio non sovrascrivono il default', () => {
  const last = lastServiceByAthlete([
    booking({
      id: 1,
      clientId: 7,
      serviceId: null,
      requestedAt: new Date('2026-08-01T10:00:00Z'),
    }),
    booking({
      id: 2,
      clientId: 7,
      serviceId: 4,
      requestedAt: new Date('2026-07-01T10:00:00Z'),
    }),
  ]);
  assert.equal(last[7], 4);
});

test('un atleta senza storico non ha default', () => {
  assert.deepEqual(lastServiceByAthlete([]), {});
});

test('lo storico di un atleta esclude quello degli altri', () => {
  const all = [
    booking({ id: 1, clientId: 7 }),
    booking({ id: 2, clientId: 9 }),
    booking({ id: 3, clientId: 7 }),
  ];
  const history = bookingsForAthlete(all, 7);
  assert.deepEqual(history.map((b) => b.id).sort(), [1, 3]);
});
