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
    aiNotesStatus: null,
    aiReportStatus: null,
  aiNotesErrorCode: null,
    hasRecordedAudio: false,
    hasTranscript: false,
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

test('espone il Compass della sessione conclusa più recente con report pronto', () => {
  const [athlete] = buildCoachAthletes(
    [
      booking({
        id: 1,
        clientId: 7,
        sessionEndedAt: new Date('2026-08-01T10:00:00Z'),
        aiNotesStatus: 'approved',
      }),
      booking({
        id: 2,
        clientId: 7,
        sessionEndedAt: new Date('2026-08-04T10:00:00Z'),
        aiNotesStatus: 'ready_for_review',
      }),
      booking({
        id: 3,
        clientId: 7,
        sessionEndedAt: new Date('2026-08-05T10:00:00Z'),
        aiNotesStatus: 'processing',
      }),
    ],
    NOW
  );

  assert.equal(athlete.latestCompassBookingId, 2);
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

test('la sessione svolta più recente viene prima di un appuntamento futuro', () => {
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
  assert.equal(athletes[0].userId, 7);
});

test('senza sessioni svolte viene prima l’appuntamento futuro più vicino', () => {
  const athletes = buildCoachAthletes(
    [
      booking({
        id: 1,
        clientId: 7,
        clientName: 'Anna Bianchi',
        status: 'accepted',
        scheduledFor: new Date('2026-08-20T10:00:00Z'),
      }),
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
  assert.deepEqual(
    athletes.map((athlete) => athlete.userId),
    [9, 7]
  );
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

test('un riepilogo ancora da validare viene segnalato nell’elenco', () => {
  const [athlete] = buildCoachAthletes(
    [
      booking({
        id: 1,
        clientId: 7,
        sessionEndedAt: new Date('2026-08-04T10:00:00Z'),
        aiNotesStatus: 'ready_for_review',
        aiReportStatus: 'ready_for_review',
      }),
    ],
    NOW
  );

  assert.equal(athlete.latestCompassNeedsReview, true);
});

test('un riepilogo approvato non chiede attenzione', () => {
  const [athlete] = buildCoachAthletes(
    [
      booking({
        id: 1,
        clientId: 7,
        sessionEndedAt: new Date('2026-08-04T10:00:00Z'),
        aiNotesStatus: 'approved',
        aiReportStatus: 'approved',
      }),
    ],
    NOW
  );

  assert.equal(athlete.latestCompassNeedsReview, false);
});

test('un report validato non chiede attenzione, anche se la sessione e rimasta indietro', () => {
  /*
   * E' il caso reale: fino a oggi approvare il report non toccava lo stato
   * della sessione, e in produzione ci sono sedute con report approvato e
   * sessione ancora `ready_for_review`. L'invito a validare va spento dal
   * report, che e' la cosa che si valida.
   */
  const [athlete] = buildCoachAthletes(
    [
      booking({
        id: 1,
        clientId: 7,
        sessionEndedAt: new Date('2026-08-04T10:00:00Z'),
        aiNotesStatus: 'ready_for_review',
        aiReportStatus: 'approved',
      }),
    ],
    NOW
  );

  assert.equal(athlete.latestCompassNeedsReview, false);
});

test('senza alcun riepilogo non si segnala nulla da validare', () => {
  const [athlete] = buildCoachAthletes(
    [booking({ id: 1, clientId: 7, sessionEndedAt: new Date('2026-08-04T10:00:00Z') })],
    NOW
  );

  assert.equal(athlete.latestCompassBookingId, null);
  assert.equal(athlete.latestCompassNeedsReview, false);
});

/*
 * Il caso reale: una seduta di un'ora, con tanto di riepilogo pronto, che
 * l'elenco non vedeva perche' il coach non aveva premuto «Concludi».
 */
test('una sessione svolta ma mai chiusa conta come svolta', () => {
  const now = new Date('2026-08-13T08:00:00Z');
  const held = booking({
    id: 167,
    clientId: 7,
    status: 'accepted',
    scheduledFor: new Date('2026-08-11T06:30:00Z'),
    sessionStartedAt: new Date('2026-08-11T06:29:30Z'),
    sessionEndedAt: new Date('2026-08-11T07:37:26Z'),
    aiNotesStatus: 'ready_for_review',
    aiReportStatus: 'ready_for_review',
  });

  const [athlete] = buildCoachAthletes([held], now);

  assert.equal(athlete.completedSessions, 1);
  assert.equal(
    athlete.lastSessionAt?.toISOString(),
    '2026-08-11T07:37:26.000Z'
  );
  // Il riepilogo pronto deve emergere: e` il lavoro gia` fatto che nessuno
  // vedeva.
  assert.equal(athlete.latestCompassBookingId, 167);
  assert.equal(athlete.latestCompassNeedsReview, true);
});

test('una sessione in corso non e` gia` passato', () => {
  // Iniziata dieci minuti fa, dura un'ora: sta succedendo adesso.
  const now = new Date('2026-08-13T10:10:00Z');
  const live = booking({
    id: 200,
    clientId: 7,
    status: 'accepted',
    scheduledFor: new Date('2026-08-13T10:00:00Z'),
    sessionStartedAt: new Date('2026-08-13T10:00:05Z'),
    sessionEndedAt: new Date('2026-08-13T10:09:50Z'),
  });

  const [athlete] = buildCoachAthletes([live], now);
  assert.equal(athlete.completedSessions, 0);
});

test('una sessione confermata a cui nessuno si e` collegato non e` svolta', () => {
  const now = new Date('2026-08-13T08:00:00Z');
  const noShow = booking({
    id: 201,
    clientId: 7,
    status: 'accepted',
    scheduledFor: new Date('2026-08-11T06:30:00Z'),
  });

  const [athlete] = buildCoachAthletes([noShow], now);
  assert.equal(athlete.completedSessions, 0);
  assert.equal(athlete.lastSessionAt, null);
});
