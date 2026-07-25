import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onboardingRedirectFor } from './routing';
import {
  ageFromBirthDate,
  requiresGuardian,
  isEligibleAge,
} from '../guardians/age';

test('onboardingRedirectFor: completed and legacy users pass through', () => {
  assert.equal(onboardingRedirectFor(null), null);
  assert.equal(onboardingRedirectFor(undefined), null);
  assert.equal(onboardingRedirectFor({ status: 'completed' }), null);
});

test('onboardingRedirectFor: incomplete states go to the wizard', () => {
  assert.equal(onboardingRedirectFor({ status: 'not_started' }), '/onboarding');
  assert.equal(onboardingRedirectFor({ status: 'in_progress' }), '/onboarding');
  assert.equal(
    onboardingRedirectFor({ status: 'guardian_pending' }),
    '/onboarding'
  );
});

test('ageFromBirthDate: exact around the birthday (not a plain year subtraction)', () => {
  const bd = '2008-03-15';
  // Day before the 18th birthday → still 17.
  assert.equal(ageFromBirthDate(bd, new Date('2026-03-14')), 17);
  // On the birthday → 18.
  assert.equal(ageFromBirthDate(bd, new Date('2026-03-15')), 18);
  // Day after → 18.
  assert.equal(ageFromBirthDate(bd, new Date('2026-03-16')), 18);
  assert.equal(ageFromBirthDate(null), null);
  assert.equal(ageFromBirthDate('not-a-date'), null);
});

test('under-15 is blocked; 15+ is eligible', () => {
  const at = new Date('2026-01-01');
  assert.equal(isEligibleAge(ageFromBirthDate('2012-01-02', at)), false); // 13
  assert.equal(isEligibleAge(ageFromBirthDate('2011-01-01', at)), true); // 15
  assert.equal(isEligibleAge(null), false);
});

test('requiresGuardian: only 15-17', () => {
  const at = new Date('2026-06-01');
  assert.equal(requiresGuardian(ageFromBirthDate('2010-06-01', at)), true); // 16
  assert.equal(requiresGuardian(ageFromBirthDate('2011-06-01', at)), true); // 15
  assert.equal(requiresGuardian(ageFromBirthDate('2008-06-01', at)), false); // 18
  assert.equal(requiresGuardian(ageFromBirthDate('2013-06-01', at)), false); // 13 (blocked elsewhere)
});
