import assert from 'node:assert/strict';
import test from 'node:test';
import { isSessionPastSafetyLimit } from './session-close-policy';

const NOW = new Date('2026-08-08T18:00:00.000Z');

test('una sessione iniziata da meno del limite non scade', () => {
  assert.equal(
    isSessionPastSafetyLimit({
      startedAt: new Date('2026-08-08T16:30:00.000Z'),
      createdDate: new Date('2026-08-08T16:00:00.000Z'),
      now: NOW,
      safetyTimeoutMinutes: 180,
    }),
    false
  );
});

test('una sessione di due ore e mezza non scade con il limite a 180 minuti', () => {
  assert.equal(
    isSessionPastSafetyLimit({
      startedAt: new Date('2026-08-08T15:30:00.000Z'),
      createdDate: new Date('2026-08-08T15:00:00.000Z'),
      now: NOW,
      safetyTimeoutMinutes: 180,
    }),
    false,
    'una seduta lunga ma legittima non deve essere troncata'
  );
});

test('una sessione oltre il limite scade', () => {
  assert.equal(
    isSessionPastSafetyLimit({
      startedAt: new Date('2026-08-08T14:00:00.000Z'),
      createdDate: new Date('2026-08-08T13:30:00.000Z'),
      now: NOW,
      safetyTimeoutMinutes: 180,
    }),
    true
  );
});

test('senza startedAt si usa la data di creazione', () => {
  assert.equal(
    isSessionPastSafetyLimit({
      startedAt: null,
      createdDate: new Date('2026-08-08T13:00:00.000Z'),
      now: NOW,
      safetyTimeoutMinutes: 180,
    }),
    true
  );
});

test('il riferimento è l inizio effettivo, non la creazione della richiesta', () => {
  // Fra la richiesta e il consenso può passare del tempo: contarlo
  // accorcerebbe la seduta di altrettanto.
  assert.equal(
    isSessionPastSafetyLimit({
      startedAt: new Date('2026-08-08T16:00:00.000Z'),
      createdDate: new Date('2026-08-08T10:00:00.000Z'),
      now: NOW,
      safetyTimeoutMinutes: 180,
    }),
    false
  );
});
