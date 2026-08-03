import assert from 'node:assert/strict';
import test from 'node:test';
import type { FeatureAccessResult } from '@/lib/core/features/policy';
import { authorizeAiNotesStart } from './authorization';

const entitled: FeatureAccessResult = {
  allowed: true,
  reason: 'enabled',
  entitlement: { source: 'admin', usageCount: 0 },
};
const notEntitled: FeatureAccessResult = {
  allowed: false,
  reason: 'not_entitled',
};

function input(
  overrides: Partial<Parameters<typeof authorizeAiNotesStart>[0]> = {}
) {
  return {
    authenticated: true,
    bookingExists: true,
    actorUserId: 20,
    clientUserId: 10,
    coachUserId: 20,
    bookingStatus: 'accepted',
    roomMatchesBooking: true,
    videoConfigured: true,
    withinCallWindow: true,
    featureAccess: entitled,
    hasOpenSession: false,
    ...overrides,
  };
}

test('unauthenticated, missing and non-participant starts are denied', () => {
  assert.deepEqual(
    authorizeAiNotesStart(input({ authenticated: false })),
    { allowed: false, reason: 'unauthenticated' }
  );
  assert.deepEqual(
    authorizeAiNotesStart(input({ bookingExists: false })),
    { allowed: false, reason: 'not_found' }
  );
  assert.deepEqual(
    authorizeAiNotesStart(input({ actorUserId: 99 })),
    { allowed: false, reason: 'not_participant' }
  );
});

test('athlete cannot start and coach must be entitled', () => {
  assert.deepEqual(
    authorizeAiNotesStart(input({ actorUserId: 10 })),
    { allowed: false, reason: 'coach_only' }
  );
  assert.deepEqual(
    authorizeAiNotesStart(input({ featureAccess: notEntitled })),
    { allowed: false, reason: 'not_entitled' }
  );
});

test('valid coach start is allowed', () => {
  assert.deepEqual(authorizeAiNotesStart(input()), { allowed: true });
});

test('duplicate, invalid booking status and invalid room are denied', () => {
  assert.deepEqual(
    authorizeAiNotesStart(input({ hasOpenSession: true })),
    { allowed: false, reason: 'already_active' }
  );
  assert.deepEqual(
    authorizeAiNotesStart(input({ bookingStatus: 'completed' })),
    { allowed: false, reason: 'booking_not_accepted' }
  );
  assert.deepEqual(
    authorizeAiNotesStart(input({ roomMatchesBooking: false })),
    { allowed: false, reason: 'invalid_room' }
  );
});
