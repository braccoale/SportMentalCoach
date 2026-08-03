import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canActorAnswerConsent,
  canApplyConsentDecision,
  isConsentDecisionIdempotent,
  nextStatusAfterConsent,
} from './consent-policy';

test('a participant can answer only their own consent', () => {
  assert.equal(
    canActorAnswerConsent({
      actorUserId: 10,
      consentUserId: 10,
      clientUserId: 10,
      coachUserId: 20,
    }),
    true
  );
  assert.equal(
    canActorAnswerConsent({
      actorUserId: 10,
      consentUserId: 20,
      clientUserId: 10,
      coachUserId: 20,
    }),
    false
  );
  assert.equal(
    canActorAnswerConsent({
      actorUserId: 99,
      consentUserId: 99,
      clientUserId: 10,
      coachUserId: 20,
    }),
    false
  );
});

test('first acceptance waits; all acceptances activate', () => {
  assert.equal(
    nextStatusAfterConsent({
      sessionStatus: 'waiting_for_consent',
      decision: 'accepted',
      allConsentStatuses: ['accepted', 'pending'],
    }),
    null
  );
  assert.equal(
    nextStatusAfterConsent({
      sessionStatus: 'waiting_for_consent',
      decision: 'accepted',
      allConsentStatuses: ['accepted', 'accepted'],
    }),
    'active'
  );
});

test('rejection and revocation move to a safe state', () => {
  assert.equal(
    nextStatusAfterConsent({
      sessionStatus: 'waiting_for_consent',
      decision: 'rejected',
      allConsentStatuses: ['accepted', 'rejected'],
    }),
    'consent_rejected'
  );
  assert.equal(
    nextStatusAfterConsent({
      sessionStatus: 'active',
      decision: 'revoked',
      allConsentStatuses: ['accepted', 'revoked'],
    }),
    'cancelled'
  );
});

test('duplicate consent is idempotent and invalid rewrites are rejected', () => {
  assert.equal(isConsentDecisionIdempotent('accepted', 'accepted'), true);
  assert.equal(canApplyConsentDecision('pending', 'accepted'), true);
  assert.equal(canApplyConsentDecision('accepted', 'rejected'), false);
  assert.equal(canApplyConsentDecision('accepted', 'revoked'), true);
});
