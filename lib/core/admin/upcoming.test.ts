import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UPCOMING_DAYS,
  buildUpcomingAgenda,
  upcomingDayName,
} from './upcoming';

/** Martedì 30 giugno 2026, ore 14:00 a Roma. */
const NOW = new Date('2026-06-30T12:00:00Z');

test('la finestra è continua: i giorni vuoti ci sono lo stesso', () => {
  const agenda = buildUpcomingAgenda(
    [{ day: '2026-07-03', confermate: 2, daConfermare: 0 }],
    NOW
  );

  assert.equal(agenda.days.length, UPCOMING_DAYS);
  assert.deepEqual(
    agenda.days.map((d) => d.day),
    [
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
      '2026-07-06',
    ]
  );
  // Cinque righe a zero e una piena: senza i vuoti sembrerebbe un giorno solo.
  assert.deepEqual(
    agenda.days.map((d) => d.totale),
    [0, 0, 0, 2, 0, 0, 0]
  );
});

test('oggi e domani si leggono da soli, senza contare le righe', () => {
  const agenda = buildUpcomingAgenda(
    [
      { day: '2026-06-30', confermate: 3, daConfermare: 1 },
      { day: '2026-07-01', confermate: 2, daConfermare: 0 },
    ],
    NOW
  );

  assert.equal(agenda.oggi, 4);
  assert.equal(agenda.domani, 2);
  assert.equal(agenda.totale, 6);
  assert.equal(agenda.vuota, false);
});

test('confermate e da confermare restano distinte: sono due lavori diversi', () => {
  const agenda = buildUpcomingAgenda(
    [{ day: '2026-07-01', confermate: 1, daConfermare: 4 }],
    NOW
  );
  const domani = agenda.days[1];
  assert.equal(domani.confermate, 1);
  assert.equal(domani.daConfermare, 4);
  assert.equal(domani.totale, 5);
});

test('un’agenda vuota lo dichiara, invece di mostrare sette zeri muti', () => {
  const agenda = buildUpcomingAgenda([], NOW);
  assert.equal(agenda.vuota, true);
  assert.equal(agenda.totale, 0);
  assert.equal(agenda.days.length, UPCOMING_DAYS);
});

test('un giorno che il database restituisce fuori finestra non entra', () => {
  const agenda = buildUpcomingAgenda(
    [
      { day: '2026-06-29', confermate: 9, daConfermare: 9 }, // ieri
      { day: '2026-07-20', confermate: 9, daConfermare: 9 }, // troppo avanti
    ],
    NOW
  );
  assert.equal(agenda.totale, 0);
});

test('la finestra attraversa il cambio d’ora senza saltare un giorno', () => {
  // Il 25 ottobre 2026 l'Italia torna all'ora solare.
  const agenda = buildUpcomingAgenda([], new Date('2026-10-23T10:00:00Z'));
  assert.deepEqual(
    agenda.days.map((d) => d.day),
    [
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
    ]
  );
});

test('oggi e domani hanno un nome proprio, gli altri una data', () => {
  assert.equal(upcomingDayName(0), 'oggi');
  assert.equal(upcomingDayName(1), 'domani');
  assert.equal(upcomingDayName(2), 'data');
  assert.equal(upcomingDayName(6), 'data');
});
