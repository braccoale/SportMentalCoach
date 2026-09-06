import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOrganizationFeatureSnapshot } from './organization-grant';
import { evaluateFeatureEntitlement } from './policy';

test('no organization package means no grant', () => {
  const snapshot = buildOrganizationFeatureSnapshot({
    organizationPackage: null,
    packageFeatureCodes: ['AI_SESSION_NOTES'],
    featureCode: 'AI_SESSION_NOTES',
  });
  assert.equal(snapshot, null);
});

test('a package that does not include the feature grants nothing', () => {
  const snapshot = buildOrganizationFeatureSnapshot({
    organizationPackage: { status: 'active', startsAt: null, expiresAt: null },
    packageFeatureCodes: ['SOME_OTHER_FEATURE'],
    featureCode: 'AI_SESSION_NOTES',
  });
  assert.equal(snapshot, null);
});

test('an active package including the feature grants an enabled entitlement', () => {
  const snapshot = buildOrganizationFeatureSnapshot({
    organizationPackage: { status: 'active', startsAt: null, expiresAt: null },
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
  const snapshot = buildOrganizationFeatureSnapshot({
    organizationPackage: {
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
  const snapshot = buildOrganizationFeatureSnapshot({
    organizationPackage: {
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
