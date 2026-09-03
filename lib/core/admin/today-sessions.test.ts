import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDaySessions, buildTodaySessions } from './today-sessions';
import type { AdminBookingRow } from './booking-rows';

/** Ore 14:00 a Roma del 30 giugno 2026 (ora legale: UTC+2). */
const NOW = new Date('2026-06-30T12:00:00Z');

function booking(
  over: Partial<AdminBookingRow> & { id: number; providerId: number }
): AdminBookingRow {
  return {
    clientId: 7,
    status: 'accepted',
    scheduledFor: new Date('2026-06-30T08:00:00Z'),
    requestedAt: new Date('2026-06-20T10:00:00Z'),
    sessionStartedAt: null,
    sessionEndedAt: null,
    clientName: 'Alessandro Bracco',
    clientEmail: 'alessandro@example.com',
    clientAvatarUrl: null,
    athleteSport: 'calcio',
    athleteLevel: null,
    athleteGoals: null,
    athleteIsMinor: false,
    athleteAge: null,
    durationMin: 50,
    coachName: 'Coach Demo',
    serviceTitle: 'Sessione individuale',
    ...over,
  };
}

test('le sessioni di oggi arrivano in ordine di orario, con coach e atleta', () => {
  const sessions = buildTodaySessions(
    [
      booking({
        id: 1,
        providerId: 100,
        scheduledFor: new Date('2026-06-30T16:00:00Z'),
      }),
      booking({
        id: 2,
        providerId: 200,
        coachName: 'Marta Verdi',
        clientName: 'Marco Rossi',
        clientId: 9,
        scheduledFor: new Date('2026-06-30T07:00:00Z'),
      }),
    ],
    NOW
  );

  assert.deepEqual(
    sessions.map((s) => s.bookingId),
    [2, 1]
  );
  assert.equal(sessions[0].coachName, 'Marta Verdi');
  assert.equal(sessions[0].athleteName, 'Marco Rossi');
});

/**
 * Il caso che rompe se «oggi» lo decide il server invece di Roma: a mezzanotte
 * e mezza del primo luglio, in UTC è ancora il 30 giugno.
 */
test('«oggi» è il giorno di Roma, non quello di UTC', () => {
  // 00:30 del 1 luglio a Roma = 22:30 del 30 giugno in UTC.
  const mezzanotteRoma = new Date('2026-06-30T22:30:00Z');

  const dentro = buildTodaySessions(
    [booking({ id: 1, providerId: 100, scheduledFor: mezzanotteRoma })],
    // Le 01:00 del 1 luglio a Roma.
    new Date('2026-06-30T23:00:00Z')
  );
  assert.equal(dentro.length, 1);

  // Lo stesso istante, guardato durante il 30 giugno: non è oggi.
  const fuori = buildTodaySessions(
    [booking({ id: 1, providerId: 100, scheduledFor: mezzanotteRoma })],
    NOW
  );
  assert.equal(fuori.length, 0);
});

test('le disdette non contano nella giornata, le sedute già svolte sì', () => {
  const sessions = buildTodaySessions(
    [
      booking({ id: 1, providerId: 100, status: 'cancelled' }),
      booking({ id: 2, providerId: 100, status: 'declined' }),
      booking({ id: 3, providerId: 100, status: 'expired' }),
      booking({ id: 4, providerId: 100, status: 'completed' }),
      booking({ id: 5, providerId: 100, status: 'requested' }),
    ],
    NOW
  );

  assert.deepEqual(
    sessions.map((s) => s.bookingId).sort(),
    [4, 5]
  );
});

test('una sessione senza orario non è in agenda', () => {
  const sessions = buildTodaySessions(
    [booking({ id: 1, providerId: 100, scheduledFor: null })],
    NOW
  );
  assert.equal(sessions.length, 0);
});

test('«in corso» lo dice il battito, non l’orario', () => {
  const sessions = buildTodaySessions(
    [
      // Fissata alle 10:00 a Roma, con un battito di trenta secondi fa.
      booking({
        id: 1,
        providerId: 100,
        scheduledFor: new Date('2026-06-30T08:00:00Z'),
        sessionStartedAt: new Date('2026-06-30T08:00:00Z'),
        sessionEndedAt: new Date(NOW.getTime() - 30_000),
      }),
      // Stessa ora, ma nessuno si è mai collegato.
      booking({
        id: 2,
        providerId: 200,
        scheduledFor: new Date('2026-06-30T08:00:00Z'),
      }),
      // Battito vecchio di dieci minuti: quella stanza è vuota.
      booking({
        id: 3,
        providerId: 300,
        scheduledFor: new Date('2026-06-30T08:00:00Z'),
        sessionEndedAt: new Date(NOW.getTime() - 10 * 60_000),
      }),
    ],
    NOW
  );

  assert.deepEqual(
    sessions.map((s) => `${s.bookingId}:${s.isLive}`),
    ['1:true', '2:false', '3:false']
  );
});

test('la giornata si può chiedere per una data qualsiasi, non solo per oggi', () => {
  const domani = buildDaySessions(
    [
      booking({ id: 1, providerId: 100, scheduledFor: new Date('2026-06-30T16:00:00Z') }),
      booking({ id: 2, providerId: 100, scheduledFor: new Date('2026-07-01T08:00:00Z') }),
      booking({ id: 3, providerId: 100, scheduledFor: new Date('2026-07-01T14:00:00Z') }),
    ],
    '2026-07-01',
    NOW
  );

  assert.deepEqual(domani.map((s) => s.bookingId), [2, 3]);
});

test('«in corso» lo decide il battito, non il giorno che si sta guardando', () => {
  /*
   * Sembra un controsenso — una seduta di domani che risulta in corso — e
   * invece e' la risposta giusta: se un battito e' arrivato adesso, qualcuno
   * e' collegato *davvero*, e nasconderlo perche' la data non torna
   * significherebbe mentire su una chiamata viva. Con dati veri il caso non
   * si presenta: i battiti sono freschi solo durante la chiamata.
   */
  const domani = buildDaySessions(
    [
      booking({
        id: 1,
        providerId: 100,
        scheduledFor: new Date('2026-07-01T08:00:00Z'),
        sessionStartedAt: new Date('2026-06-30T11:50:00Z'),
        sessionEndedAt: NOW,
      }),
    ],
    '2026-07-01',
    NOW
  );
  assert.equal(domani.length, 1);
  assert.equal(domani[0].isLive, true);

  // Senza battito recente, invece, resta spento.
  const spenta = buildDaySessions(
    [booking({ id: 2, providerId: 100, scheduledFor: new Date('2026-07-01T08:00:00Z') })],
    '2026-07-01',
    NOW
  );
  assert.equal(spenta[0].isLive, false);
});
