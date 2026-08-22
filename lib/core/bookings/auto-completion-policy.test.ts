import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldAutoCompleteUnrecordedBooking } from './auto-completion-policy';

const startedAt = new Date('2026-08-22T10:00:00.000Z');

test('completa una call non registrata a cui hanno partecipato coach e atleta', () => {
  assert.equal(
    shouldAutoCompleteUnrecordedBooking({
      status: 'accepted',
      sessionStartedAt: startedAt,
      authenticatedParticipantCount: 2,
      hasAiNotesSession: false,
    }),
    true
  );
});

test('non completa una stanza in cui e entrata una sola persona', () => {
  assert.equal(
    shouldAutoCompleteUnrecordedBooking({
      status: 'accepted',
      sessionStartedAt: startedAt,
      authenticatedParticipantCount: 1,
      hasAiNotesSession: false,
    }),
    false
  );
});

test('non interferisce con sessioni registrate o gia chiuse', () => {
  assert.equal(
    shouldAutoCompleteUnrecordedBooking({
      status: 'accepted',
      sessionStartedAt: startedAt,
      authenticatedParticipantCount: 2,
      hasAiNotesSession: true,
    }),
    false
  );
  assert.equal(
    shouldAutoCompleteUnrecordedBooking({
      status: 'completed',
      sessionStartedAt: startedAt,
      authenticatedParticipantCount: 2,
      hasAiNotesSession: false,
    }),
    false
  );
});

test('non completa una call mai iniziata', () => {
  assert.equal(
    shouldAutoCompleteUnrecordedBooking({
      status: 'accepted',
      sessionStartedAt: null,
      authenticatedParticipantCount: 2,
      hasAiNotesSession: false,
    }),
    false
  );
});
