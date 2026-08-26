import test from 'node:test';
import assert from 'node:assert/strict';
import { canSelfEditBirthDate } from './birth-date';
import { ageFromBirthDate } from './age';

const AT = new Date('2026-08-24T12:00:00Z');
const MINOR = '2010-05-04'; // 16 at AT
const ADULT = '2000-05-04'; // 26 at AT

test('resubmitting the stored date is not an edit', () => {
  assert.equal(canSelfEditBirthDate(MINOR, MINOR, AT).ok, true);
  assert.equal(canSelfEditBirthDate(null, null, AT).ok, true);
  assert.equal(canSelfEditBirthDate(null, '', AT).ok, true);
});

test('a minor cannot make themselves an adult', () => {
  const result = canSelfEditBirthDate(MINOR, ADULT, AT);
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.error, /assistenza/);
});

test('a minor cannot clear the date to set an adult one on the next save', () => {
  assert.equal(canSelfEditBirthDate(MINOR, null, AT).ok, false);
  assert.equal(canSelfEditBirthDate(MINOR, '   ', AT).ok, false);
});

test('corrections that keep the athlete in the guardian band are allowed', () => {
  assert.equal(canSelfEditBirthDate(MINOR, '2010-11-04', AT).ok, true);
  assert.equal(canSelfEditBirthDate(MINOR, '2009-01-01', AT).ok, true);
});

test('an edit that tightens the gate is allowed', () => {
  assert.equal(canSelfEditBirthDate(ADULT, MINOR, AT).ok, true);
  assert.equal(canSelfEditBirthDate(ADULT, '2001-01-01', AT).ok, true);
});

test('the platform floor is enforced in both directions', () => {
  assert.equal(canSelfEditBirthDate(MINOR, '2015-05-04', AT).ok, false);
  assert.equal(canSelfEditBirthDate(ADULT, '2015-05-04', AT).ok, false);
});

test('invalid and future dates are refused', () => {
  assert.equal(canSelfEditBirthDate(MINOR, 'pippo', AT).ok, false);
  assert.equal(canSelfEditBirthDate(MINOR, '2030-01-01', AT).ok, false);
  assert.equal(canSelfEditBirthDate(ADULT, '1800-01-01', AT).ok, false);
});

test('an athlete with no recorded date can set one', () => {
  assert.equal(canSelfEditBirthDate(null, ADULT, AT).ok, true);
  assert.equal(canSelfEditBirthDate(null, MINOR, AT).ok, true);
});

test('turning 18 needs no edit, so refusing the edit locks nobody out', () => {
  assert.equal(ageFromBirthDate(MINOR, AT), 16);
  assert.equal(ageFromBirthDate(MINOR, new Date('2028-05-04T12:00:00Z')), 18);
});
