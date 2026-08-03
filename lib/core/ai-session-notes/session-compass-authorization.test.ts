import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeSessionCompass,
  canEditCoachNote,
  type SessionCompassAuthorizationInput,
} from './session-compass-authorization';

function input(
  overrides: Partial<SessionCompassAuthorizationInput> = {}
): SessionCompassAuthorizationInput {
  return {
    authenticated: true,
    sessionExists: true,
    actorUserId: 10,
    coachUserId: 10,
    athleteUserId: 20,
    isAdmin: false,
    featureEnabled: true,
    action: 'read',
    ...overrides,
  };
}

test('il coach della sessione con feature attiva è autorizzato', () => {
  assert.deepEqual(authorizeSessionCompass(input()), { allowed: true, actorKind: 'coach' });
});

test('l’admin è autorizzato senza dipendere dall’entitlement del coach', () => {
  assert.deepEqual(
    authorizeSessionCompass(input({ actorUserId: 99, isAdmin: true, featureEnabled: false })),
    { allowed: true, actorKind: 'admin' }
  );
});

test('l’atleta è negato esplicitamente, non come semplice estraneo', () => {
  assert.deepEqual(authorizeSessionCompass(input({ actorUserId: 20 })), {
    allowed: false,
    reason: 'athlete_forbidden',
  });
});

test('un utente estraneo alla sessione è negato', () => {
  assert.deepEqual(authorizeSessionCompass(input({ actorUserId: 77 })), {
    allowed: false,
    reason: 'not_authorized',
  });
});

test('l’ordine mette autenticazione ed esistenza prima dei ruoli', () => {
  assert.deepEqual(authorizeSessionCompass(input({ authenticated: false, isAdmin: true })), {
    allowed: false,
    reason: 'unauthenticated',
  });
  assert.deepEqual(
    authorizeSessionCompass(input({ sessionExists: false, coachUserId: undefined })),
    { allowed: false, reason: 'not_found' }
  );
});

test('il coach senza entitlement è negato con il motivo corretto', () => {
  assert.deepEqual(authorizeSessionCompass(input({ featureEnabled: false })), {
    allowed: false,
    reason: 'feature_not_enabled',
  });
});

test('solo il coach può scrivere la nota privata', () => {
  assert.equal(canEditCoachNote(authorizeSessionCompass(input())), true);
  assert.equal(
    canEditCoachNote(authorizeSessionCompass(input({ actorUserId: 99, isAdmin: true }))),
    false
  );
});
