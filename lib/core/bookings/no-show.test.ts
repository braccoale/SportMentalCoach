import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NO_SHOW_MESSAGE } from './no-show';
import { isConsumedByLateCancellation, usageStatusOf } from '../billing/late-cancellation';

test('la nota dell’assenza dice che l’atleta non si è presentato', () => {
  assert.match(NO_SHOW_MESSAGE, /non si è presentato/);
});

test('una seduta chiusa per assenza pesa come fatta (è `completed`)', () => {
  const booking = { status: 'completed', lateCancellation: false, updatedBy: 83, clientId: 68 };
  assert.equal(usageStatusOf(booking), 'completed');
  assert.equal(isConsumedByLateCancellation(booking), false);
});
