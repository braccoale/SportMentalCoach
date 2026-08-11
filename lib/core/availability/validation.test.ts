import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOOKING_START_STEP_MINUTES,
  appointmentIntervalsOverlap,
  busyIntervalsAt,
  dropPastStarts,
  isStartBusyForDuration,
  isScheduledDateWithinSlot,
  maxSessionMinutesAt,
  romeWeekdayAndMinute,
  slotLabelSuffix,
  slotPresentation,
  timeValueToMinutes,
  validateAvailabilitySchedule,
} from './validation';

test('appointment start times use ten-minute intervals', () => {
  assert.equal(BOOKING_START_STEP_MINUTES, 10);
});

test('appointment starts that overlap an occupied session are unavailable', () => {
  const busy = {
    scheduledFor: new Date('2026-07-28T08:00:00.000Z'),
    durationMin: 40,
  };
  assert.equal(
    appointmentIntervalsOverlap(
      new Date('2026-07-28T07:15:00.000Z'),
      40,
      busy
    ),
    false
  );
  assert.equal(
    appointmentIntervalsOverlap(
      new Date('2026-07-28T07:30:00.000Z'),
      40,
      busy
    ),
    true
  );
  assert.equal(
    appointmentIntervalsOverlap(
      new Date('2026-07-28T08:30:00.000Z'),
      15,
      busy
    ),
    true
  );
  assert.equal(
    appointmentIntervalsOverlap(
      new Date('2026-07-28T08:40:00.000Z'),
      40,
      busy
    ),
    false
  );
});

test('a start is capped by the gap left before the next session', () => {
  // One session at 15:50 Rome (13:50Z) lasting 40 minutes.
  const busy = [
    { scheduledFor: new Date('2026-08-03T13:50:00.000Z'), durationMin: 40 },
  ];

  // 15:20 leaves half an hour: fine for a 30-minute service, not for 40.
  assert.equal(
    maxSessionMinutesAt(new Date('2026-08-03T13:20:00.000Z'), busy),
    30
  );
  // Inside the session: nothing can start there.
  assert.equal(
    maxSessionMinutesAt(new Date('2026-08-03T14:00:00.000Z'), busy),
    0
  );
  // After it ends: unconstrained.
  assert.equal(
    maxSessionMinutesAt(new Date('2026-08-03T14:30:00.000Z'), busy),
    null
  );
  // The nearest session ahead wins, not the first one listed.
  assert.equal(
    maxSessionMinutesAt(new Date('2026-08-03T13:00:00.000Z'), [
      ...busy,
      { scheduledFor: new Date('2026-08-03T13:20:00.000Z'), durationMin: 20 },
    ]),
    20
  );
});

test('busy start times depend on the duration of the service being booked', () => {
  const maxDurationMin = { '15:20': 30, '15:50': 0 };

  assert.equal(isStartBusyForDuration(maxDurationMin, '15:20', 30), false);
  assert.equal(isStartBusyForDuration(maxDurationMin, '15:20', 40), true);
  assert.equal(isStartBusyForDuration(maxDurationMin, '15:50', 10), true);
  // No entry at all means no session ahead: always free.
  assert.equal(isStartBusyForDuration(maxDurationMin, '17:00', 90), false);

  // No service picked yet: only starts inside a session are blocked.
  assert.equal(isStartBusyForDuration(maxDurationMin, '15:20', null), false);
  assert.equal(isStartBusyForDuration(maxDurationMin, '15:50', null), true);
  assert.equal(isStartBusyForDuration(maxDurationMin, '17:00', null), false);
});

test('accepts multiple days and non-overlapping ranges on the same day', () => {
  const result = validateAvailabilitySchedule([
    { weekday: 3, startMinute: 840, endMinute: 1080 },
    { weekday: 1, startMinute: 540, endMinute: 720 },
    { weekday: 1, startMinute: 720, endMinute: 780 },
  ]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.slots, [
      { weekday: 1, startMinute: 540, endMinute: 720 },
      { weekday: 1, startMinute: 720, endMinute: 780 },
      { weekday: 3, startMinute: 840, endMinute: 1080 },
    ]);
  }
});

test('rejects overlapping ranges, invalid days and reversed times', () => {
  assert.equal(
    validateAvailabilitySchedule([
      { weekday: 1, startMinute: 540, endMinute: 720 },
      { weekday: 1, startMinute: 660, endMinute: 780 },
    ]).ok,
    false
  );
  assert.equal(
    validateAvailabilitySchedule([
      { weekday: 8, startMinute: 540, endMinute: 720 },
    ]).ok,
    false
  );
  assert.equal(
    validateAvailabilitySchedule([
      { weekday: 1, startMinute: 720, endMinute: 540 },
    ]).ok,
    false
  );
});

test('allows clearing the full schedule and parses native time values', () => {
  const result = validateAvailabilitySchedule([]);
  assert.equal(result.ok, true);
  assert.equal(timeValueToMinutes('09:30'), 570);
  assert.equal(timeValueToMinutes('23:59'), 1439);
  assert.equal(timeValueToMinutes('24:00'), null);
  assert.equal(timeValueToMinutes('9:30'), null);
});

test('matches future appointments against weekly slots in Europe/Rome', () => {
  // Monday 27 July 2026, 10:30 in Rome (08:30 UTC).
  const appointment = new Date('2026-07-27T08:30:00.000Z');
  assert.deepEqual(romeWeekdayAndMinute(appointment), {
    weekday: 1,
    minuteOfDay: 630,
  });
  assert.equal(
    isScheduledDateWithinSlot(appointment, {
      weekday: 1,
      startMinute: 600,
      endMinute: 720,
    }),
    true
  );
  assert.equal(
    isScheduledDateWithinSlot(appointment, {
      weekday: 1,
      startMinute: 630,
      endMinute: 660,
    }),
    true
  );
  assert.equal(
    isScheduledDateWithinSlot(appointment, {
      weekday: 1,
      startMinute: 540,
      endMinute: 630,
    }),
    false
  );
  assert.equal(
    isScheduledDateWithinSlot(appointment, {
      weekday: 2,
      startMinute: 600,
      endMinute: 720,
    }),
    false
  );
});

test('a session already underway keeps blocking the starts it overlaps', () => {
  // 08:00–09:00 Rome, seen at 08:17: already started, still occupying the hour.
  const running = {
    scheduledFor: new Date('2026-08-06T06:00:00.000Z'),
    durationMin: 60,
  };
  const now = new Date('2026-08-06T06:17:00.000Z');
  assert.deepEqual(busyIntervalsAt([running], now), [running]);

  // Finished sessions are irrelevant and must not shrink the picker.
  const finished = {
    scheduledFor: new Date('2026-08-06T04:00:00.000Z'),
    durationMin: 60,
  };
  assert.deepEqual(busyIntervalsAt([finished, running], now), [running]);
});

test('starts already passed are dropped from a page rendered earlier', () => {
  // Page rendered at 07:00 Rome, dialog opened at 08:17 Rome.
  const days = [
    { value: '2026-08-06', times: ['07:10', '08:10', '08:20', '09:00'] },
    { value: '2026-08-07', times: ['07:10', '08:10'] },
  ];
  const now = new Date('2026-08-06T06:17:00.000Z');

  assert.deepEqual(dropPastStarts(days, now), [
    { value: '2026-08-06', times: ['08:20', '09:00'] },
    { value: '2026-08-07', times: ['07:10', '08:10'] },
  ]);
});

test('a day whose starts have all passed disappears from the picker', () => {
  const days = [
    { value: '2026-08-06', times: ['07:10'] },
    { value: '2026-08-07', times: ['07:10'] },
  ];
  assert.deepEqual(
    dropPastStarts(days, new Date('2026-08-06T06:17:00.000Z')),
    [{ value: '2026-08-07', times: ['07:10'] }]
  );
});

test('lo slot troppo stretto dice quanto spazio c’è, non «Occupato»', () => {
  // Il caso reale: sessione alle 11:00 da 40 minuti. Alle 10:30 il coach non
  // è occupato — semplicemente non ci stanno 40 minuti prima delle 11:00.
  // Dirgli «Occupato» gli nasconde la mezz'ora che potrebbe usare.
  const maxDurationMin = { '10:20': 40, '10:30': 30, '10:40': 20, '11:00': 0 };

  assert.equal(slotLabelSuffix(maxDurationMin, '10:20', 40), '');
  assert.equal(slotLabelSuffix(maxDurationMin, '10:30', 40), ' · Solo 30 min');
  assert.equal(slotLabelSuffix(maxDurationMin, '10:40', 40), ' · Solo 20 min');
  // Dentro l'appuntamento «Occupato» è la parola giusta e resta.
  assert.equal(slotLabelSuffix(maxDurationMin, '11:00', 40), ' · Occupato');
  // Nessuna voce: dopo non c'è nulla, si parte sempre.
  assert.equal(slotLabelSuffix(maxDurationMin, '11:40', 40), '');
});

test('lo stesso slot cambia esito al cambiare della durata', () => {
  const maxDurationMin = { '10:30': 30 };
  assert.equal(slotLabelSuffix(maxDurationMin, '10:30', 30), '');
  assert.equal(slotLabelSuffix(maxDurationMin, '10:30', 40), ' · Solo 30 min');
});

test('senza servizio scelto non si indovina una durata', () => {
  const maxDurationMin = { '10:30': 30, '11:00': 0 };
  // Solo gli orari dentro un appuntamento sono bloccati: la lista si
  // restringe da sé quando il servizio viene scelto.
  assert.equal(slotLabelSuffix(maxDurationMin, '10:30', null), '');
  assert.equal(slotLabelSuffix(maxDurationMin, '11:00', null), ' · Occupato');
});

test('l’etichetta resta coerente con il blocco dello slot', () => {
  // Se un giorno le due regole divergessero, l'interfaccia mostrerebbe uno
  // slot selezionabile con scritto «Occupato», o viceversa.
  const maxDurationMin = { '10:20': 40, '10:30': 30, '11:00': 0 };
  for (const time of ['10:20', '10:30', '11:00', '11:40']) {
    const busy = isStartBusyForDuration(maxDurationMin, time, 40);
    const suffix = slotLabelSuffix(maxDurationMin, time, 40);
    assert.equal(busy, suffix !== '', `slot ${time}`);
  }
});


test('uno slot stretto si può scegliere, e accorcia la sessione', () => {
  // «Solo 30 min» senza poterlo scegliere è un'informazione inutile: chi lo
  // sceglie accetta quella durata, e il campo va portato lì per lui.
  const maxDurationMin = { '10:30': 30, '10:50': 10, '11:00': 0 };

  const tight = slotPresentation(maxDurationMin, '10:30', 40, true);
  assert.equal(tight.selectable, true);
  assert.equal(tight.tone, 'tight');
  assert.equal(tight.fitsDurationMin, 30);
  assert.equal(tight.suffix, ' · Solo 30 min');

  // Dentro un appuntamento non c'è niente da accorciare.
  const busy = slotPresentation(maxDurationMin, '11:00', 40, true);
  assert.equal(busy.selectable, false);
  assert.equal(busy.tone, 'occupied');
  assert.equal(busy.fitsDurationMin, null);
});

test('sceglie la durata più lunga che ci sta, non la più corta', () => {
  // Con 45 minuti liberi si propone 40, non 10: accorciare è già una
  // concessione, e va fatta il meno possibile.
  assert.equal(
    slotPresentation({ '09:00': 45 }, '09:00', 60, true).fitsDurationMin,
    40
  );
});

test('sotto la sessione più corta lo slot torna rosso', () => {
  // Cinque minuti non bastano per nessuna durata proponibile: offrirlo
  // sarebbe un invito a un errore.
  const slot = slotPresentation({ '09:00': 5 }, '09:00', 40, true);
  assert.equal(slot.selectable, false);
  assert.equal(slot.tone, 'occupied');
});

test('dove la durata è fissata, lo slot stretto non è selezionabile', () => {
  // È il caso della modifica appuntamento: la durata non si tocca, quindi
  // non c'è modo di far entrare la sessione.
  const slot = slotPresentation({ '10:30': 30 }, '10:30', 40, false);
  assert.equal(slot.selectable, false);
  assert.equal(slot.tone, 'occupied');
  // L'etichetta resta informativa: dice perché.
  assert.equal(slot.suffix, ' · Solo 30 min');
});
