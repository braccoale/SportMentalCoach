import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAiSessionArchiveIndicator } from './archive-indicator';

test('shows recording and processing progress on archived sessions', () => {
  assert.deepEqual(buildAiSessionArchiveIndicator('active', 'coach'), {
    state: 'recording',
    label: 'Registrazione in corso',
  });
  assert.deepEqual(buildAiSessionArchiveIndicator('active', 'coach', true), {
    state: 'processing',
    label: 'Registrata · trascrizione in corso',
  });
  assert.deepEqual(
    buildAiSessionArchiveIndicator('processing', 'coach', true, true),
    {
      state: 'report_processing',
      label: 'Trascrizione pronta · Compass in elaborazione',
    }
  );
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

test('senza copertura il comportamento resta identico a prima', () => {
  assert.deepEqual(
    buildAiSessionArchiveIndicator('shared', 'coach'),
    buildAiSessionArchiveIndicator('shared', 'coach', false, false, undefined)
  );
});

test('senza uno stato non si inventa un indicatore', () => {
  assert.equal(buildAiSessionArchiveIndicator(null, 'coach', false, false), null);
});

test('il silenzio non si annuncia come un guasto', () => {
  // Stesso stato, due strade molto diverse: chi legge deve sapere quale.
  assert.deepEqual(
    buildAiSessionArchiveIndicator(
      'transcription_failed',
      'coach',
      true,
      false,
      'NO_SPEECH_DETECTED'
    ),
    { state: 'failed', label: 'Nessun parlato nell’audio' }
  );
  assert.deepEqual(
    buildAiSessionArchiveIndicator('transcription_failed', 'coach', true, false),
    { state: 'failed', label: 'Trascrizione non riuscita' }
  );
});
