import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGE_OF_MAJORITY,
  ageFromBirthDate,
  isEligibleCoachAge,
} from './age';

test('un minorenne non può registrarsi come coach', () => {
  assert.equal(isEligibleCoachAge(17), false);
  assert.equal(isEligibleCoachAge(15), false);
  assert.equal(isEligibleCoachAge(0), false);
});

test('a diciotto anni compiuti si può', () => {
  assert.equal(isEligibleCoachAge(AGE_OF_MAJORITY), true);
  assert.equal(isEligibleCoachAge(40), true);
});

test('età ignota non è un sì', () => {
  assert.equal(isEligibleCoachAge(null), false);
});

test('il giorno del diciottesimo compleanno il cancello si apre', () => {
  const at = new Date('2026-08-26T12:00:00Z');
  const age = ageFromBirthDate('2008-08-26', at);
  assert.equal(age, 18);
  assert.equal(isEligibleCoachAge(age), true);
});

test('il giorno prima no', () => {
  const at = new Date('2026-08-25T12:00:00Z');
  assert.equal(isEligibleCoachAge(ageFromBirthDate('2008-08-26', at)), false);
});
