import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SERVICE_DURATION_MIN,
  hasValidServiceDuration,
  MAX_SERVICE_DURATION_MIN,
} from './validation';

test('the platform service-duration default is 40 minutes', () => {
  assert.equal(DEFAULT_SERVICE_DURATION_MIN, 40);
  assert.equal(hasValidServiceDuration(DEFAULT_SERVICE_DURATION_MIN), true);
});

test('accepts positive whole-minute service durations', () => {
  assert.equal(hasValidServiceDuration(1), true);
  assert.equal(hasValidServiceDuration(45), true);
  assert.equal(hasValidServiceDuration(60), true);
  assert.equal(hasValidServiceDuration(MAX_SERVICE_DURATION_MIN), true);
});

test('rejects missing, zero, fractional, negative, and excessive durations', () => {
  assert.equal(hasValidServiceDuration(null), false);
  assert.equal(hasValidServiceDuration(undefined), false);
  assert.equal(hasValidServiceDuration(0), false);
  assert.equal(hasValidServiceDuration(-30), false);
  assert.equal(hasValidServiceDuration(45.5), false);
  assert.equal(hasValidServiceDuration(MAX_SERVICE_DURATION_MIN + 1), false);
});
