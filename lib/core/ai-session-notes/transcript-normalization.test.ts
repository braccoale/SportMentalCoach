import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTranscript, type NormalizeTranscriptInput } from './transcript-normalization';

const CREATED_AT = '2026-07-31T09:00:00.000Z';

function input(
  overrides: Partial<NormalizeTranscriptInput> = {}
): NormalizeTranscriptInput {
  return {
    provider: 'provider-a',
    model: 'model-a',
    language: 'it',
    createdAt: CREATED_AT,
    participants: [
      { id: 10, role: 'coach', label: 'Coach', providerSpeakerIds: ['speaker_0'] },
      { id: 20, role: 'athlete', label: 'Athlete', providerSpeakerIds: ['speaker_1'] },
      { id: 30, role: 'parent', label: 'Parent', providerSpeakerIds: ['speaker_2'] },
    ],
    segments: [],
    ...overrides,
  };
}

test('maps provider speaker IDs to session participants without exposing provider IDs', () => {
  const normalized = normalizeTranscript(input({
    segments: [
      { providerSpeakerId: 'speaker_0', startMs: 0, endMs: 800, text: 'ciao' },
      { providerSpeakerId: 'speaker_2', startMs: 900, endMs: 1_500, text: 'grazie' },
    ],
  }));

  assert.deepEqual(
    normalized.segments.map((segment) => segment.speaker),
    [
      { participantId: 10, role: 'coach', label: 'Coach' },
      { participantId: 30, role: 'parent', label: 'Parent' },
    ]
  );
  assert.equal(JSON.stringify(normalized).includes('speaker_0'), false);
  assert.equal(JSON.stringify(normalized).includes('speaker_2'), false);
});

test('merges adjacent and short-gap segments for the same speaker only', () => {
  const normalized = normalizeTranscript(input({
    options: { gapMergeThresholdMs: 250 },
    segments: [
      { providerSpeakerId: 'speaker_0', startMs: 0, endMs: 500, text: 'ciao', confidence: 0.8 },
      { providerSpeakerId: 'speaker_0', startMs: 500, endMs: 700, text: 'mondo', confidence: 1 },
      { providerSpeakerId: 'speaker_0', startMs: 900, endMs: 1_200, text: 'bene', confidence: 0.6 },
      { providerSpeakerId: 'speaker_1', startMs: 1_250, endMs: 1_400, text: 'si', confidence: 0.7 },
    ],
  }));

  assert.equal(normalized.segments.length, 2);
  assert.equal(normalized.segments[0]?.text, 'Ciao mondo bene.');
  assert.equal(normalized.segments[0]?.sourceSegmentCount, 3);
  assert.equal(normalized.segments[0]?.confidence, 0.8);
  assert.equal(normalized.segments[1]?.speaker.role, 'athlete');
});

test('keeps overlapping speech and marks the later overlapping segment', () => {
  const normalized = normalizeTranscript(input({
    segments: [
      { providerSpeakerId: 'speaker_0', startMs: 0, endMs: 1_000, text: 'parlo io' },
      { providerSpeakerId: 'speaker_1', startMs: 800, endMs: 1_400, text: 'parlo anch io' },
    ],
  }));

  assert.equal(normalized.segments.length, 2);
  assert.equal(normalized.segments[0]?.overlap, false);
  assert.equal(normalized.segments[1]?.overlap, true);
  assert.equal(normalized.segments[1]?.text, 'Parlo anch io.');
});

test('does not merge same-speaker segments when their timing overlaps', () => {
  const normalized = normalizeTranscript(input({
    options: { gapMergeThresholdMs: 500 },
    segments: [
      { providerSpeakerId: 'speaker_0', startMs: 0, endMs: 1_000, text: 'prima' },
      { providerSpeakerId: 'speaker_0', startMs: 900, endMs: 1_200, text: 'seconda' },
    ],
  }));

  assert.equal(normalized.segments.length, 2);
  assert.equal(normalized.segments[1]?.overlap, true);
});

test('applies NONE, LIGHT, and FULL filler dictionaries deterministically', () => {
  const segment = {
    providerSpeakerId: 'speaker_0',
    startMs: 0,
    endMs: 1_000,
    text: 'ehm allora ciao',
  };
  assert.equal(
    normalizeTranscript(input({ segments: [segment] })).segments[0]?.text,
    'Ehm allora ciao.'
  );
  assert.equal(
    normalizeTranscript(input({ options: { fillerMode: 'NONE' }, segments: [segment] })).segments[0]?.text,
    'Ehm allora ciao.'
  );
  assert.equal(
    normalizeTranscript(input({ options: { fillerMode: 'LIGHT' }, segments: [segment] })).segments[0]?.text,
    'Allora ciao.'
  );
  assert.equal(
    normalizeTranscript(input({ options: { fillerMode: 'FULL' }, segments: [segment] })).segments[0]?.text,
    'Ciao.'
  );
  assert.equal(
    normalizeTranscript(input({
      options: {
        fillerMode: 'FULL',
        fillerDictionary: { light: ['ecco'], full: ['tipo'] },
      },
      segments: [{ ...segment, text: 'ecco tipo ciao' }],
    })).segments[0]?.text,
    'Ciao.'
  );
});

test('cleans whitespace, blank lines, duplicated punctuation, and sentence casing', () => {
  const normalized = normalizeTranscript(input({
    segments: [{
      providerSpeakerId: 'speaker_1',
      startMs: 0,
      endMs: 1_000,
      text: '  ciao\n\n mondo!!   come va??  ',
    }],
  }));

  assert.equal(normalized.segments[0]?.text, 'Ciao mondo! Come va?');
});

test('generates deterministic metadata including confidence aggregation', () => {
  const normalized = normalizeTranscript(input({
    createdAt: new Date(CREATED_AT),
    segments: [
      { providerSpeakerId: 'speaker_0', startMs: 100, endMs: 500, text: 'uno due', confidence: 0.5 },
      { providerSpeakerId: 'speaker_1', startMs: 700, endMs: 1_100, text: 'tre', confidence: 0.9 },
    ],
  }));

  assert.deepEqual(normalized.metadata, {
    provider: 'provider-a',
    model: 'model-a',
    language: 'it',
    durationMs: 1_000,
    speakerCount: 2,
    segmentCount: 2,
    wordCount: 3,
    averageConfidence: 0.7,
    minimumConfidence: 0.5,
    maximumConfidence: 0.9,
    createdAt: CREATED_AT,
  });
});

test('rejects unmapped provider speakers instead of leaking provider labels', () => {
  assert.throws(
    () => normalizeTranscript(input({
      segments: [{ providerSpeakerId: 'speaker_unknown', startMs: 0, endMs: 1, text: 'ciao' }],
    })),
    /UNMAPPED_TRANSCRIPT_SPEAKER/
  );
});
