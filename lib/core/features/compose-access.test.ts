import assert from 'node:assert/strict';
import test from 'node:test';
import { composeFeatureAccess } from './compose-access';
import type { FeatureAccessResult, FeatureEntitlementSnapshot } from './policy';

const now = new Date('2026-09-07T12:00:00.000Z');

const activeGrant: FeatureEntitlementSnapshot = {
  status: 'enabled',
  source: 'subscription',
  startsAt: null,
  expiresAt: null,
  usageLimit: null,
  usageCount: 0,
};

const suspendedGrant: FeatureEntitlementSnapshot = {
  ...activeGrant,
  status: 'suspended',
};

function denied(reason: FeatureAccessResult['reason']): FeatureAccessResult {
  return { allowed: false, reason };
}

test('an allowed direct entitlement short-circuits, no organization consulted', () => {
  const direct: FeatureAccessResult = { allowed: true, reason: 'enabled' };
  const result = composeFeatureAccess(direct, [activeGrant], now);
  assert.deepEqual(result, direct);
});

test('an explicit admin revoke (disabled) is never overridden by an organization package', () => {
  const direct = denied('disabled');
  const result = composeFeatureAccess(direct, [activeGrant], now);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'disabled');
});

test('a suspended direct entitlement is never overridden by an organization package', () => {
  const direct = denied('suspended');
  const result = composeFeatureAccess(direct, [activeGrant], now);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'suspended');
});

test('no direct entitlement falls back to an organization grant', () => {
  const direct = denied('not_entitled');
  const result = composeFeatureAccess(direct, [activeGrant], now);
  assert.equal(result.allowed, true);
});

test('an expired direct entitlement still allows an independent organization grant', () => {
  const direct = denied('expired');
  const result = composeFeatureAccess(direct, [activeGrant], now);
  assert.equal(result.allowed, true);
});

test('multiple organizations: a later one that is allowed wins over an earlier denial', () => {
  const direct = denied('not_entitled');
  const result = composeFeatureAccess(direct, [suspendedGrant, activeGrant], now);
  assert.equal(result.allowed, true);
});

test('no organization grants at all: the direct reason survives', () => {
  const direct = denied('not_entitled');
  const result = composeFeatureAccess(direct, [], now);
  assert.deepEqual(result, direct);
});

test('both deny: the organization reason surfaces when the direct one is just "not_entitled"', () => {
  const direct = denied('not_entitled');
  const result = composeFeatureAccess(direct, [suspendedGrant], now);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'suspended');
});

test('both deny with a more specific direct reason: the direct reason survives', () => {
  const direct = denied('expired');
  const result = composeFeatureAccess(direct, [suspendedGrant], now);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'expired');
});
