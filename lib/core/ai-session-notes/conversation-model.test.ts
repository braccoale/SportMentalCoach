import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conversationFromTranscript,
  conversationStatistics,
  validateConversation,
  type ConversationModel,
} from './conversation-model';
import type { NormalizedTranscript } from './transcript-normalization';

function transcript(
  segments: NormalizedTranscript['segments']
): NormalizedTranscript {
  return {
    segments,
    metadata: {
      provider: 'provider-a',
      model: 'model-a',
      language: 'it',
      durationMs: 0,
      speakerCount: 0,
      segmentCount: segments.length,
      wordCount: 0,
      averageConfidence: null,
      minimumConfidence: null,
      maximumConfidence: null,
      createdAt: '2026-08-01T09:00:00.000Z',
    },
  };
}

function segment(params: {
  segmentId: string;
  speakerId: number;
  role: string;
  name: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number | null;
  overlap?: boolean;
}): NormalizedTranscript['segments'][number] {
  return {
    segmentId: params.segmentId,
    speaker: {
      participantId: params.speakerId,
      role: params.role,
      label: params.name,
    },
    startMs: params.startMs,
    endMs: params.endMs,
    text: params.text,
    confidence: params.confidence ?? null,
    overlap: params.overlap ?? false,
    sourceSegmentCount: 1,
  };
}

function conversation(segments: NormalizedTranscript['segments']): ConversationModel {
  return conversationFromTranscript({
    conversationId: 'conversation-101',
    sessionId: 101,
    transcript: transcript(segments),
  });
}

test('creates one turn for consecutive normalized segments from a single speaker', () => {
  const result = conversation([
    segment({ segmentId: 'n-1', speakerId: 1, role: 'coach', name: 'Coach', startMs: 0, endMs: 500, text: 'Come stai.', confidence: 0.8 }),
    segment({ segmentId: 'n-2', speakerId: 1, role: 'coach', name: 'Coach', startMs: 600, endMs: 900, text: 'Dimmi pure.', confidence: 1 }),
  ]);

  assert.equal(result.participants.length, 1);
  assert.equal(result.turns.length, 1);
  assert.deepEqual(result.turns[0], {
    turnIndex: 1,
    speakerId: 1,
    speakerRole: 'coach',
    speakerName: 'Coach',
    startMs: 0,
    endMs: 900,
    durationMs: 900,
    text: 'Come stai. Dimmi pure.',
    wordCount: 4,
    confidence: 0.9,
    overlap: false,
    segmentIds: ['n-1', 'n-2'],
  });
});

test('builds participant references and turns for multiple speakers', () => {
  const result = conversation([
    segment({ segmentId: 'n-1', speakerId: 1, role: 'coach', name: 'Coach', startMs: 0, endMs: 500, text: 'Come e andata.' }),
    segment({ segmentId: 'n-2', speakerId: 2, role: 'athlete', name: 'Athlete', startMs: 600, endMs: 1_000, text: 'Non bene.' }),
  ]);

  assert.deepEqual(result.participants, [
    { speakerId: 1, speakerRole: 'coach', speakerName: 'Coach' },
    { speakerId: 2, speakerRole: 'athlete', speakerName: 'Athlete' },
  ]);
  assert.equal(result.turns.length, 2);
  assert.equal(result.turns[1]?.speakerRole, 'athlete');
});

test('keeps alternating speakers as separate uninterrupted turns', () => {
  const result = conversation([
    segment({ segmentId: 'n-1', speakerId: 1, role: 'coach', name: 'Coach', startMs: 0, endMs: 100, text: 'Perche.' }),
    segment({ segmentId: 'n-2', speakerId: 2, role: 'athlete', name: 'Athlete', startMs: 110, endMs: 200, text: 'Ansia.' }),
    segment({ segmentId: 'n-3', speakerId: 1, role: 'coach', name: 'Coach', startMs: 210, endMs: 300, text: 'Capisco.' }),
    segment({ segmentId: 'n-4', speakerId: 2, role: 'athlete', name: 'Athlete', startMs: 310, endMs: 400, text: 'Grazie.' }),
  ]);

  assert.deepEqual(result.turns.map((turn) => turn.speakerId), [1, 2, 1, 2]);
  assert.deepEqual(result.turns.map((turn) => turn.turnIndex), [1, 2, 3, 4]);
});

test('preserves overlap flags and source segment references', () => {
  const result = conversation([
    segment({ segmentId: 'n-1', speakerId: 1, role: 'coach', name: 'Coach', startMs: 0, endMs: 1_000, text: 'Parlo.', overlap: false }),
    segment({ segmentId: 'n-2', speakerId: 2, role: 'athlete', name: 'Athlete', startMs: 800, endMs: 1_200, text: 'Anche io.', overlap: true }),
  ]);

  assert.equal(result.turns[1]?.overlap, true);
  assert.deepEqual(result.turns[1]?.segmentIds, ['n-2']);
  assert.equal(result.turns[1]?.startMs, 800);
  assert.equal(result.turns[1]?.endMs, 1_200);
});

test('generates deterministic conversation metadata', () => {
  const result = conversation([
    segment({ segmentId: 'n-1', speakerId: 1, role: 'coach', name: 'Coach', startMs: 100, endMs: 500, text: 'Uno due.', confidence: 0.5 }),
    segment({ segmentId: 'n-2', speakerId: 2, role: 'athlete', name: 'Athlete', startMs: 700, endMs: 1_100, text: 'Tre.', confidence: 0.9 }),
  ]);

  assert.deepEqual(result.statistics, {
    conversationDuration: 1_000,
    participantCount: 2,
    turnCount: 2,
    averageTurnDuration: 400,
    averageWordsPerTurn: 1.5,
    averageConfidence: 0.7,
  });
});

test('aggregates confidence across every normalized segment in a merged turn', () => {
  const result = conversation([
    segment({ segmentId: 'n-1', speakerId: 1, role: 'coach', name: 'Coach', startMs: 0, endMs: 100, text: 'Uno.', confidence: 0.2 }),
    segment({ segmentId: 'n-2', speakerId: 1, role: 'coach', name: 'Coach', startMs: 110, endMs: 200, text: 'Due.', confidence: 0.6 }),
    segment({ segmentId: 'n-3', speakerId: 1, role: 'coach', name: 'Coach', startMs: 210, endMs: 300, text: 'Tre.', confidence: 1 }),
  ]);

  assert.equal(result.turns[0]?.confidence, 0.6);
});

test('validates turn ordering and unique turn indexes', () => {
  const result = conversation([
    segment({ segmentId: 'n-1', speakerId: 1, role: 'coach', name: 'Coach', startMs: 0, endMs: 100, text: 'Uno.' }),
    segment({ segmentId: 'n-2', speakerId: 2, role: 'athlete', name: 'Athlete', startMs: 200, endMs: 300, text: 'Due.' }),
  ]);
  result.turns[1]!.turnIndex = 1;

  assert.throws(() => validateConversation(result), /INVALID_CONVERSATION_TURN_ORDER/);
});

test('rejects invalid normalized transcript timing before turn creation', () => {
  assert.throws(
    () => conversation([
      segment({ segmentId: 'n-1', speakerId: 1, role: 'coach', name: 'Coach', startMs: 200, endMs: 300, text: 'Prima.' }),
      segment({ segmentId: 'n-2', speakerId: 2, role: 'athlete', name: 'Athlete', startMs: 100, endMs: 150, text: 'Dopo.' }),
    ]),
    /INVALID_NORMALIZED_TRANSCRIPT/
  );
});

test('calculates reusable statistics from a validated conversation', () => {
  const result = conversation([
    segment({ segmentId: 'n-1', speakerId: 1, role: 'coach', name: 'Coach', startMs: 0, endMs: 200, text: 'Una frase.' }),
    segment({ segmentId: 'n-2', speakerId: 2, role: 'athlete', name: 'Athlete', startMs: 300, endMs: 700, text: 'Due parole.', confidence: 0.8 }),
  ]);

  assert.deepEqual(conversationStatistics(result), result.statistics);
});
