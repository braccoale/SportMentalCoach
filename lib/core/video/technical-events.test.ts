import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isClientVideoEventType,
  parseBookingRoomName,
  participantTechnicalKind,
  sanitizeTechnicalEventDetails,
  technicalEventOccurredAt,
} from './technical-events';

test('only canonical booking room names are accepted', () => {
  assert.equal(parseBookingRoomName('booking-42'), 42);
  assert.equal(parseBookingRoomName('booking-0'), null);
  assert.equal(parseBookingRoomName('preflight-42'), null);
  assert.equal(parseBookingRoomName('booking-42-extra'), null);
});

test('technical participant classification never exposes an identity', () => {
  assert.equal(participantTechnicalKind('user-19'), 'authenticated');
  assert.equal(participantTechnicalKind('guest-abc'), 'guest');
  assert.equal(participantTechnicalKind('preflight-abc'), 'service');
  assert.equal(participantTechnicalKind('Mario Rossi'), 'unknown');
});

test('client event details are allow-listed and bounded', () => {
  assert.deepEqual(
    sanitizeTechnicalEventDetails({
      quality: 'poor',
      durationMs: 1_250,
      token: 'must-not-be-stored',
      participantName: 'must-not-be-stored',
      reason: 'x'.repeat(200),
    }),
    {
      quality: 'poor',
      durationMs: 1_250,
      reason: 'x'.repeat(120),
    }
  );
  assert.equal(isClientVideoEventType('krisp_enabled'), true);
  assert.equal(isClientVideoEventType('arbitrary_event'), false);
});

test('webhook unix timestamps are converted to dates', () => {
  assert.equal(
    technicalEventOccurredAt(1_785_312_000).toISOString(),
    '2026-07-29T08:00:00.000Z'
  );
});
