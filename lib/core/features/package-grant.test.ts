import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPackageFeatureSnapshot } from './package-grant';
import { evaluateFeatureEntitlement } from './policy';

test('no user package means no grant', () => {
  const snapshot = buildPackageFeatureSnapshot({
    userPackage: null,
    packageFeatureCodes: ['AI_SESSION_NOTES'],
    featureCode: 'AI_SESSION_NOTES',
  });
  assert.equal(snapshot, null);
});

test('a package that does not include the feature grants nothing', () => {
  const snapshot = buildPackageFeatureSnapshot({
    userPackage: { status: 'active', startsAt: null, expiresAt: null },
    packageFeatureCodes: ['SOME_OTHER_FEATURE'],
    featureCode: 'AI_SESSION_NOTES',
  });
  assert.equal(snapshot, null);
});

test('an active package including the feature grants an enabled entitlement', () => {
  const snapshot = buildPackageFeatureSnapshot({
    userPackage: { status: 'active', startsAt: null, expiresAt: null },
    packageFeatureCodes: ['AI_SESSION_NOTES'],
    featureCode: 'AI_SESSION_NOTES',
  });
  assert.deepEqual(snapshot, {
    status: 'enabled',
    source: 'subscription',
    startsAt: null,
    expiresAt: null,
    usageLimit: null,
    usageCount: 0,
  });
  assert.equal(evaluateFeatureEntitlement(snapshot, new Date()).allowed, true);
});

test('a suspended package denies access with the suspended reason', () => {
  const snapshot = buildPackageFeatureSnapshot({
    userPackage: {
      status: 'suspended',
      startsAt: null,
      expiresAt: null,
    },
    packageFeatureCodes: ['AI_SESSION_NOTES'],
    featureCode: 'AI_SESSION_NOTES',
  });
  const result = evaluateFeatureEntitlement(snapshot, new Date());
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'suspended');
});

test('an active package past its expiry date still denies access', () => {
  const now = new Date('2026-09-06T00:00:00.000Z');
  const snapshot = buildPackageFeatureSnapshot({
    userPackage: {
      status: 'active',
      startsAt: null,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    },
    packageFeatureCodes: ['AI_SESSION_NOTES'],
    featureCode: 'AI_SESSION_NOTES',
  });
  const result = evaluateFeatureEntitlement(snapshot, now);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'expired');
});
