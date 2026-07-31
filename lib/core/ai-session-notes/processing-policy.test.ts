import assert from 'node:assert/strict';
import test from 'node:test';
import {
  jobRequiresParticipantRecording,
  retryDelayMs,
  retryStatus,
  sessionCanProcess,
} from './processing-policy';

test('job types require the correct logical recording scope', () => {
  assert.equal(jobRequiresParticipantRecording('transcription'), true);
  assert.equal(jobRequiresParticipantRecording('transcript_normalization'), false);
  assert.equal(jobRequiresParticipantRecording('report_generation'), false);
});

test('retries stop exactly at maximum attempts', () => {
  assert.equal(retryStatus({ attemptCount: 1, maxAttempts: 3 }), 'queued');
  assert.equal(retryStatus({ attemptCount: 2, maxAttempts: 3 }), 'queued');
  assert.equal(retryStatus({ attemptCount: 3, maxAttempts: 3 }), 'failed');
  assert.equal(retryDelayMs(1), 60_000);
  assert.equal(retryDelayMs(100), 15 * 60_000);
});

test('cancelled, rejected or revoked consent makes processing fail closed', () => {
  assert.equal(
    sessionCanProcess({
      sessionStatus: 'active',
      consentStatuses: ['accepted', 'accepted'],
    }),
    true
  );
  assert.equal(
    sessionCanProcess({
      sessionStatus: 'cancelled',
      consentStatuses: ['accepted', 'accepted'],
    }),
    false
  );
  assert.equal(
    sessionCanProcess({
      sessionStatus: 'active',
      consentStatuses: ['accepted', 'revoked'],
    }),
    false
  );
});
