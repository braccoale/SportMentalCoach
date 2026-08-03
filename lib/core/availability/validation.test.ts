import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOOKING_START_STEP_MINUTES,
  appointmentIntervalsOverlap,
  isStartBusyForDuration,
  isScheduledDateWithinSlot,
  maxSessionMinutesAt,
  romeWeekdayAndMinute,
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
