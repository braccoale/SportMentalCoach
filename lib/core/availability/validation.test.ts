import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOOKING_START_STEP_MINUTES,
  appointmentIntervalsOverlap,
  isScheduledDateWithinSlot,
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
