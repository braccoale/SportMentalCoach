import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canViewBookingChatHistory,
  isBookingChatAvailable,
} from './policy';

test('chat is available while a request is pending and after acceptance', () => {
  assert.equal(isBookingChatAvailable('requested'), true);
  assert.equal(isBookingChatAvailable('accepted'), true);
  assert.equal(isBookingChatAvailable('completed'), true);
});

test('chat is closed for declined, expired and cancelled bookings', () => {
  assert.equal(isBookingChatAvailable('declined'), false);
  assert.equal(isBookingChatAvailable('expired'), false);
  assert.equal(isBookingChatAvailable('cancelled'), false);
});

test('closed bookings expose existing messages as read-only history', () => {
  assert.equal(canViewBookingChatHistory('cancelled', true), true);
  assert.equal(canViewBookingChatHistory('declined', true), true);
  assert.equal(canViewBookingChatHistory('expired', true), true);
  assert.equal(canViewBookingChatHistory('cancelled', false), false);
});
