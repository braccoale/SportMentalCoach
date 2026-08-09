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

test('una copertura integra non aggiunge rumore all etichetta', () => {
  assert.deepEqual(
    buildAiSessionArchiveIndicator('shared', 'coach', false, false, 'completa'),
    buildAiSessionArchiveIndicator('shared', 'coach')
  );
});

test('una sessione con interruzioni lo dichiara anche in lista', () => {
  const indicator = buildAiSessionArchiveIndicator(
    'shared',
    'coach',
    false,
    false,
    'con_interruzioni'
  );
  assert.match(indicator!.label, /interruzion/i);
});

test('una registrazione mancata e visibile in lista', () => {
  const indicator = buildAiSessionArchiveIndicator(
    'shared',
    'coach',
    false,
    false,
    'fallita'
  );
  assert.match(indicator!.label, /non registrata/i);
});

test('una trascrizione parziale e visibile in lista', () => {
  const indicator = buildAiSessionArchiveIndicator(
    'shared',
    'coach',
    false,
    false,
    'parziale'
  );
  assert.match(indicator!.label, /parziale/i);
});

test('senza indicatore la copertura non ne inventa uno', () => {
  assert.equal(
    buildAiSessionArchiveIndicator(null, 'coach', false, false, 'fallita'),
    null
  );
});

test('il silenzio non si annuncia come un guasto', () => {
  // Stesso stato, due strade molto diverse: chi legge deve sapere quale.
  assert.deepEqual(
    buildAiSessionArchiveIndicator(
      'transcription_failed',
      'coach',
      true,
      false,
      undefined,
      'NO_SPEECH_DETECTED'
    ),
    { state: 'failed', label: 'Nessun parlato nell’audio' }
  );
  assert.deepEqual(
    buildAiSessionArchiveIndicator('transcription_failed', 'coach', true, false),
    { state: 'failed', label: 'Trascrizione non riuscita' }
  );
});
