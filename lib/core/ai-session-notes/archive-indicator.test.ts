import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAiSessionArchiveIndicator } from './archive-indicator';

test('shows recording and processing progress on archived sessions', () => {
  assert.deepEqual(buildAiSessionArchiveIndicator('active', 'coach'), {
    state: 'recording',
    label: 'Registrazione in corso',
  });
  assert.deepEqual(buildAiSessionArchiveIndicator('processing', 'coach', true), {
    state: 'processing',
    label: 'Registrata · trascrizione in corso',
  });
  assert.equal(
    buildAiSessionArchiveIndicator('processing', 'coach', false)?.label,
    'Trascrizione in elaborazione'
  );
});

test('adapts report readiness to coach and athlete visibility', () => {
  assert.equal(
    buildAiSessionArchiveIndicator('ready_for_review', 'coach')?.label,
    'Report pronto da rivedere'
  );
  assert.equal(
    buildAiSessionArchiveIndicator('ready_for_review', 'athlete')?.label,
    'Report in revisione'
  );
  assert.equal(
    buildAiSessionArchiveIndicator('shared', 'athlete')?.label,
    'Report pronto'
  );
});

test('does not claim that a recording exists before consent or after cancellation', () => {
  assert.equal(buildAiSessionArchiveIndicator(null, 'coach'), null);
  assert.equal(buildAiSessionArchiveIndicator('waiting_for_consent', 'coach'), null);
  assert.equal(buildAiSessionArchiveIndicator('consent_rejected', 'coach'), null);
  assert.equal(buildAiSessionArchiveIndicator('cancelled', 'coach'), null);
});
