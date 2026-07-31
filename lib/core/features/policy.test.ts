import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateFeatureEntitlement } from './policy';

const now = new Date('2026-07-30T12:00:00.000Z');
const valid = {
  status: 'enabled' as const,
  source: 'admin' as const,
  startsAt: null,
  expiresAt: null,
  usageLimit: null,
  usageCount: 0,
};

test('user without entitlement is denied', () => {
  assert.deepEqual(evaluateFeatureEntitlement(null, now), {
    allowed: false,
    reason: 'not_entitled',
  });
});

test('disabled, expired, suspended and future entitlements are denied', () => {
  assert.equal(
    evaluateFeatureEntitlement({ ...valid, status: 'disabled' }, now).reason,
    'disabled'
  );
  assert.equal(
    evaluateFeatureEntitlement(
      { ...valid, expiresAt: new Date('2026-07-30T11:59:59.000Z') },
      now
    ).reason,
    'expired'
  );
  assert.equal(
    evaluateFeatureEntitlement({ ...valid, status: 'suspended' }, now).reason,
    'suspended'
  );
  assert.equal(
    evaluateFeatureEntitlement(
      { ...valid, startsAt: new Date('2026-07-31T00:00:00.000Z') },
      now
    ).reason,
    'not_started'
  );
});

test('valid enabled and trial entitlements are allowed', () => {
  assert.equal(evaluateFeatureEntitlement(valid, now).allowed, true);
  assert.equal(
    evaluateFeatureEntitlement(
      {
        ...valid,
        status: 'trial',
        source: 'trial',
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      },
      now
    ).allowed,
    true
  );
});

test('reached usage limit is denied', () => {
  const access = evaluateFeatureEntitlement(
    { ...valid, usageLimit: 3, usageCount: 3 },
    now
  );
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'usage_limit_reached');
});
