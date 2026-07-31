import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SESSION_JOIN_GRACE_MINUTES,
  VIDEO_JOIN_LEAD_MINUTES,
  canJoinVideoNow,
  isSessionJoinable,
  nextVideoJoinAvailabilityChange,
} from './sessions';

test('dashboard keeps future and ongoing sessions out of the past archive', () => {
  const now = new Date('2026-07-28T12:00:00.000Z');
  assert.equal(
    isSessionJoinable(new Date('2026-07-28T12:30:00.000Z'), now),
    true
  );
  assert.equal(
    isSessionJoinable(new Date('2026-07-28T11:30:00.000Z'), now),
    true
  );
  assert.equal(isSessionJoinable(null, now), true);
});

test('dashboard archives accepted sessions after the call grace window', () => {
  const now = new Date('2026-07-28T12:00:00.000Z');
  const past = new Date(
    now.getTime() - (SESSION_JOIN_GRACE_MINUTES + 1) * 60_000
  );
  assert.equal(isSessionJoinable(past, now), false);
});

test('video access opens exactly five minutes before the appointment', () => {
  const scheduledFor = new Date('2026-07-28T12:30:00.000Z');

  assert.equal(
    canJoinVideoNow(
      scheduledFor,
      new Date('2026-07-28T12:24:59.999Z')
    ),
    false
  );
  assert.equal(
    canJoinVideoNow(
      scheduledFor,
      new Date('2026-07-28T12:25:00.000Z')
    ),
    true
  );
  assert.equal(VIDEO_JOIN_LEAD_MINUTES, 5);
});

test('video controls can schedule their next availability update', () => {
  const scheduledFor = new Date('2026-07-28T12:30:00.000Z');

  assert.equal(
    nextVideoJoinAvailabilityChange(
      scheduledFor,
      new Date('2026-07-28T12:00:00.000Z')
    )?.toISOString(),
    '2026-07-28T12:25:00.000Z'
  );
  assert.equal(
    nextVideoJoinAvailabilityChange(
      scheduledFor,
      new Date('2026-07-28T12:25:00.000Z')
    )?.toISOString(),
    '2026-07-28T14:30:00.001Z'
  );
  assert.equal(
    nextVideoJoinAvailabilityChange(
      scheduledFor,
      new Date('2026-07-28T14:30:00.001Z')
    ),
    null
  );
});
