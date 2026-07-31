import assert from 'node:assert/strict';
import test from 'node:test';
import { annotateConversation } from './conversation-annotation';
import type { ConversationModel, ConversationTurn } from './conversation-model';

function turn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  const startMs = overrides.startMs ?? 0;
  const endMs = overrides.endMs ?? 1_000;
  return {
    turnIndex: 1,
    speakerId: 1,
    speakerRole: 'coach',
    speakerName: 'Coach',
    startMs,
    endMs,
    durationMs: endMs - startMs,
    text: 'Testo.',
    wordCount: 1,
    confidence: 0.8,
    overlap: false,
    segmentIds: ['segment-1'],
    ...overrides,
  };
}

function conversation(turns: ConversationTurn[]): ConversationModel {
  return {
    conversationId: 'conversation-1',
    sessionId: 1,
    language: 'it',
    participants: [
      { speakerId: 1, speakerRole: 'coach', speakerName: 'Coach' },
      { speakerId: 2, speakerRole: 'athlete', speakerName: 'Athlete' },
    ],
    turns,
    statistics: {
      conversationDuration: turns.length
        ? Math.max(...turns.map((item) => item.endMs)) - turns[0]!.startMs
        : 0,
      participantCount: 2,
      turnCount: turns.length,
      averageTurnDuration: turns.length
        ? turns.reduce((sum, item) => sum + item.durationMs, 0) / turns.length
        : 0,
      averageWordsPerTurn: turns.length
        ? turns.reduce((sum, item) => sum + item.wordCount, 0) / turns.length
        : 0,
      averageConfidence: 0.8,
    },
  };
}

test('annotates open, closed, and unknown punctuation-based questions', () => {
  const open = annotateConversation(conversation([
    turn({ text: 'Come ti senti?', wordCount: 3 }),
  ])).turns[0]!.annotations;
  const closed = annotateConversation(conversation([
    turn({ text: 'Hai dormito bene?', wordCount: 3 }),
  ])).turns[0]!.annotations;
  const unknown = annotateConversation(conversation([
    turn({ text: 'Questo funziona?', wordCount: 2 }),
  ])).turns[0]!.annotations;

  assert.deepEqual(
    [open.endsWithQuestion, open.questionType],
    [true, 'open']
  );
  assert.equal(closed.questionType, 'closed');
  assert.equal(unknown.questionType, 'unknown');
});

test('uses configurable question keyword dictionaries only when punctuation is present', () => {
  const annotated = annotateConversation(
    conversation([turn({ text: 'CustomPrompt?', wordCount: 1 })]),
    { questionKeywords: { open: ['customprompt'] } }
  );
  const notQuestion = annotateConversation(
    conversation([turn({ text: 'Come stai.', wordCount: 2 })])
  );

  assert.equal(annotated.turns[0]?.annotations.questionType, 'open');
  assert.equal(notQuestion.turns[0]?.annotations.questionType, 'unknown');
});

test('detects numeric and written number words deterministically', () => {
  const numeric = annotateConversation(conversation([
    turn({ text: 'Ho corso 12 chilometri.', wordCount: 4 }),
  ])).turns[0]!.annotations;
  const written = annotateConversation(conversation([
    turn({ text: 'Ho corso tre chilometri.', wordCount: 4 }),
  ])).turns[0]!.annotations;
  const custom = annotateConversation(
    conversation([turn({ text: 'Una dozzina.', wordCount: 2 })]),
    { numberWords: ['dozzina'] }
  ).turns[0]!.annotations;

  assert.equal(numeric.containsNumbers, true);
  assert.equal(written.containsNumbers, true);
  assert.equal(custom.containsNumbers, true);
});

test('detects only configured time, goal, and emotion words', () => {
  const annotations = annotateConversation(conversation([
    turn({
      text: 'Domani il mio obiettivo e gestire l ansia.',
      wordCount: 8,
    }),
  ])).turns[0]!.annotations;

  assert.equal(annotations.containsTimeReference, true);
  assert.equal(annotations.containsGoalWord, true);
  assert.equal(annotations.containsEmotionWord, true);
});

test('marks a pause only from the existing gap between consecutive timestamps', () => {
  const first = turn({ text: 'Prima.', startMs: 0, endMs: 500, wordCount: 1 });
  const second = turn({
    turnIndex: 2,
    speakerId: 2,
    speakerRole: 'athlete',
    speakerName: 'Athlete',
    text: 'Dopo.',
    startMs: 1_600,
    endMs: 2_000,
    durationMs: 400,
    wordCount: 1,
    segmentIds: ['segment-2'],
  });
  const annotations = annotateConversation(
    conversation([first, second]),
    { pauseThresholdMs: 1_000 }
  ).turns.map((item) => item.annotations.containsPause);

  assert.deepEqual(annotations, [false, true]);
});

test('marks long turns and short answers using configurable structural thresholds', () => {
  const long = annotateConversation(
    conversation([turn({ text: 'Una frase molto lunga.', wordCount: 4, endMs: 2_000, durationMs: 2_000 })]),
    { longTurnMinWordCount: 4, longTurnMinDurationMs: 10_000 }
  ).turns[0]!.annotations;
  const short = annotateConversation(
    conversation([turn({ text: 'Si.', wordCount: 1, endMs: 300, durationMs: 300 })]),
    { shortAnswerMaxWordCount: 1, shortAnswerMaxDurationMs: 500 }
  ).turns[0]!.annotations;

  assert.equal(long.longTurn, true);
  assert.equal(short.shortAnswer, true);
});

test('copies overlap, word count, and duration from the conversation turn', () => {
  const source = conversation([
    turn({ text: 'Parlo insieme.', wordCount: 2, endMs: 700, durationMs: 700, overlap: true }),
  ]);
  const annotated = annotateConversation(source);

  assert.deepEqual(annotated.turns[0]?.annotations, {
    endsWithQuestion: false,
    questionType: 'unknown',
    containsNumbers: false,
    containsTimeReference: false,
    containsGoalWord: false,
    containsEmotionWord: false,
    containsPause: false,
    longTurn: false,
    shortAnswer: true,
    overlap: true,
    wordCount: 2,
    durationMs: 700,
  });
  assert.equal('annotations' in source.turns[0]!, false);
  assert.equal(annotated.turns[0]?.text, source.turns[0]?.text);
});

test('does not mutate the source conversation or reach outside pure input', () => {
  const source = conversation([turn({ text: 'Ho anxiety.', wordCount: 2 })]);
  const original = structuredClone(source);
  const annotated = annotateConversation(source);

  assert.deepEqual(source, original);
  assert.equal(annotated.turns[0]?.annotations.containsEmotionWord, true);
});
