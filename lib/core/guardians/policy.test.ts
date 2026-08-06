import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorityMatchesRelationship,
  hasActiveGuardianAuthorization,
  normalizeSignatureName,
  signatureMatchesInvite,
} from './policy';
import {
  GUARDIAN_CONSENT_HASH,
  GUARDIAN_CONSENT_TEXT,
  GUARDIAN_CONSENT_VERSION,
} from './consent-document';

test('the guardian signature is normalized but must match the invited adult', () => {
  assert.equal(normalizeSignatureName('  Maria   Rossi  '), 'Maria Rossi');
  assert.equal(signatureMatchesInvite('MARIA ROSSI', 'Maria Rossi'), true);
  assert.equal(signatureMatchesInvite('Mario Rossi', 'Maria Rossi'), false);
  assert.equal(signatureMatchesInvite('x', 'x'), false);
});

test('authority basis cannot contradict the declared relationship', () => {
  assert.equal(authorityMatchesRelationship('madre', 'joint_agreement'), true);
  assert.equal(authorityMatchesRelationship('padre', 'sole_responsibility'), true);
  assert.equal(authorityMatchesRelationship('madre', 'legal_guardian'), false);
  assert.equal(authorityMatchesRelationship('tutore-legale', 'legal_guardian'), true);
});

test('guardian authorization fails closed when any current-state marker is missing', () => {
  const active = {
    status: 'confirmed',
    confirmedAt: new Date(),
    revokedAt: null,
    activeAcceptanceId: 42,
  };
  assert.equal(hasActiveGuardianAuthorization(active), true);
  assert.equal(hasActiveGuardianAuthorization({ ...active, status: 'pending' }), false);
  assert.equal(hasActiveGuardianAuthorization({ ...active, revokedAt: new Date() }), false);
  assert.equal(hasActiveGuardianAuthorization({ ...active, activeAcceptanceId: null }), false);
});

test('the canonical guardian document is versioned and SHA-256 addressed', () => {
  assert.match(GUARDIAN_CONSENT_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.match(GUARDIAN_CONSENT_HASH, /^[a-f0-9]{64}$/);
  assert.match(GUARDIAN_CONSENT_TEXT, /Appunti AI facoltativi/);
  assert.match(GUARDIAN_CONSENT_TEXT, /Revoca/);
});
