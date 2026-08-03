import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiNotesDomainError,
  assertAiNotesTransition,
  canTransitionAiNotesSession,
  transitionAuditPatch,
} from './state-machine';

test('initial and future valid transitions are accepted', () => {
  assert.equal(
    canTransitionAiNotesSession('waiting_for_consent', 'active'),
    true
  );
  assert.equal(
    canTransitionAiNotesSession('waiting_for_consent', 'consent_rejected'),
    true
  );
  assert.equal(canTransitionAiNotesSession('active', 'processing'), true);
  assert.equal(
    canTransitionAiNotesSession('processing', 'ready_for_review'),
    true
  );
  assert.equal(
    canTransitionAiNotesSession('ready_for_review', 'approved'),
    true
  );
  assert.equal(canTransitionAiNotesSession('approved', 'shared'), true);
});

test('invalid and terminal transitions are rejected with typed errors', () => {
  assert.equal(canTransitionAiNotesSession('cancelled', 'active'), false);
  assert.throws(
    () => assertAiNotesTransition('active', 'approved'),
    (error: unknown) =>
      error instanceof AiNotesDomainError &&
      error.code === 'INVALID_TRANSITION'
  );
});

test('transition patch records updated timestamp and actor', () => {
  const now = new Date('2026-07-30T12:00:00.000Z');
  const active = transitionAuditPatch('active', 42, now);
  assert.equal(active.updatedDate, now);
  assert.equal(active.updatedBy, 42);
  assert.equal(active.startedAt, now);
  assert.equal(active.endedAt, undefined);

  const cancelled = transitionAuditPatch('cancelled', 7, now);
  assert.equal(cancelled.updatedBy, 7);
  assert.equal(cancelled.endedAt, now);
});
