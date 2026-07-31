import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AnnotatedConversationModel,
  ConversationTurnAnnotations,
} from './conversation-annotation';
import {
  AI_SESSION_REPORT_SCHEMA_VERSION,
  AiSessionReportValidationError,
  assertValidAiSessionReport,
  collectReportEvidenceIndexes,
  validateAiSessionReport,
  type AiSessionReport,
} from './session-report-contract';

const annotation: ConversationTurnAnnotations = {
  endsWithQuestion: false,
  questionType: 'unknown',
  containsNumbers: false,
  containsTimeReference: false,
  containsGoalWord: false,
  containsEmotionWord: false,
  containsPause: false,
  longTurn: false,
  shortAnswer: false,
  overlap: false,
  wordCount: 2,
  durationMs: 1_000,
};

function conversation(): AnnotatedConversationModel {
  return {
    conversationId: 'conversation-1',
    sessionId: 'session-1',
    language: 'it',
    participants: [
      { speakerId: 'coach', speakerRole: 'coach', speakerName: 'Coach' },
      { speakerId: 'athlete', speakerRole: 'athlete', speakerName: 'Athlete' },
    ],
    turns: [
      {
        turnIndex: 1,
        speakerId: 'coach',
        speakerRole: 'coach',
        speakerName: 'Coach',
        startMs: 0,
        endMs: 1_000,
        durationMs: 1_000,
        text: 'Come e andata?',
        wordCount: 3,
        confidence: 0.9,
        overlap: false,
        segmentIds: ['segment-1'],
        annotations: { ...annotation, endsWithQuestion: true, wordCount: 3 },
      },
      {
        turnIndex: 2,
        speakerId: 'athlete',
        speakerRole: 'athlete',
        speakerName: 'Athlete',
        startMs: 1_000,
        endMs: 2_000,
        durationMs: 1_000,
        text: 'Ero ansioso.',
        wordCount: 2,
        confidence: 0.8,
        overlap: false,
        segmentIds: ['segment-2'],
        annotations: { ...annotation },
      },
      {
        turnIndex: 3,
        speakerId: 'coach',
        speakerRole: 'coach',
        speakerName: 'Coach',
        startMs: 2_000,
        endMs: 3_000,
        durationMs: 1_000,
        text: 'Proviamo una routine.',
        wordCount: 3,
        confidence: 0.7,
        overlap: false,
        segmentIds: ['segment-3'],
        annotations: { ...annotation, wordCount: 3 },
      },
    ],
    statistics: {
      conversationDuration: 3_000,
      participantCount: 2,
      turnCount: 3,
      averageTurnDuration: 1_000,
      averageWordsPerTurn: 8 / 3,
      averageConfidence: 0.8,
    },
  };
}

function report(): AiSessionReport {
  return {
    schemaVersion: AI_SESSION_REPORT_SCHEMA_VERSION,
    reportId: 'report-1',
    sessionId: 'session-1',
    conversationId: 'conversation-1',
    language: 'it',
    status: 'draft',
    summary: {
      text: 'The athlete described anxiety.',
      sourceTurnIndexes: [2],
    },
    themes: [],
    athleteStatements: [],
    coachObservations: [],
    goals: [],
    exercisesOrHomework: [],
    followUpQuestions: [],
    safetyFlags: [],
    generation: {
      provider: 'provider-neutral',
      model: 'future-model',
      promptVersion: 'v1',
      contractVersion: AI_SESSION_REPORT_SCHEMA_VERSION,
      generatedAt: '2026-07-31T10:00:00.000Z',
    },
    createdAt: '2026-07-31T10:00:01.000Z',
  };
}

function validationCodes(value: AiSessionReport): string[] {
  return validateAiSessionReport(value, conversation()).map((issue) => issue.code);
}

test('accepts a valid minimal draft report', () => {
  assert.deepEqual(validateAiSessionReport(report(), conversation()), []);
  assert.doesNotThrow(() => assertValidAiSessionReport(report(), conversation()));
});

test('accepts a valid full evidence-backed draft report', () => {
  const value = report();
  value.themes.push({ id: 'theme-1', text: 'Anxiety.', sourceTurnIndexes: [2], confidence: 0.8 });
  value.athleteStatements.push({ id: 'statement-1', text: 'I was anxious.', sourceTurnIndexes: [2] });
  value.coachObservations.push({ id: 'observation-1', text: 'Review the routine.', sourceTurnIndexes: [3] });
  value.goals.push({ id: 'goal-1', text: 'Use a routine.', sourceTurnIndexes: [3] });
  value.exercisesOrHomework.push({ id: 'exercise-1', text: 'Practice the routine.', sourceTurnIndexes: [3] });
  value.followUpQuestions.push({ id: 'question-1', text: 'How did the routine feel?', rationale: 'Future-session proposal.' });
  value.safetyFlags.push({ id: 'safety-1', category: 'psychological_crisis', severity: 'medium', description: 'Review the explicit statement.', sourceTurnIndexes: [2], requiresHumanReview: true });

  assert.deepEqual(validateAiSessionReport(value, conversation()), []);
});

test('rejects a summary without evidence', () => {
  const value = report();
  value.summary.sourceTurnIndexes = [];
  assert.ok(validationCodes(value).includes('MISSING_EVIDENCE'));
});

test('rejects evidence-backed items without evidence', () => {
  const value = report();
  value.themes.push({ id: 'theme-1', text: 'Anxiety.', sourceTurnIndexes: [] });
  assert.ok(validationCodes(value).includes('MISSING_EVIDENCE'));
});

test('rejects evidence that references an unknown conversation turn', () => {
  const value = report();
  value.summary.sourceTurnIndexes = [99];
  assert.ok(validationCodes(value).includes('UNKNOWN_SOURCE_TURN_INDEX'));
});

test('rejects duplicate evidence indexes within an item', () => {
  const value = report();
  value.summary.sourceTurnIndexes = [2, 2];
  assert.ok(validationCodes(value).includes('DUPLICATE_SOURCE_TURN_INDEX'));
});

test('rejects duplicate report item ids across report categories', () => {
  const value = report();
  value.themes.push({ id: 'shared-id', text: 'Anxiety.', sourceTurnIndexes: [2] });
  value.goals.push({ id: 'shared-id', text: 'Practice.', sourceTurnIndexes: [3] });
  assert.ok(validationCodes(value).includes('DUPLICATE_ITEM_ID'));
});

test('rejects blank factual and suggested text', () => {
  const value = report();
  value.summary.text = '   ';
  value.followUpQuestions.push({ id: 'question-1', text: '  ' });
  assert.equal(validationCodes(value).filter((code) => code === 'BLANK_TEXT').length, 2);
});

test('rejects confidence outside the inclusive zero to one range', () => {
  const value = report();
  value.themes.push({ id: 'below', text: 'One.', sourceTurnIndexes: [1], confidence: -0.1 });
  value.goals.push({ id: 'above', text: 'Two.', sourceTurnIndexes: [3], confidence: 1.1 });
  assert.equal(validationCodes(value).filter((code) => code === 'INVALID_CONFIDENCE').length, 2);
});

test('accepts a suggestion without evidence because it is a proposal', () => {
  const value = report();
  value.followUpQuestions.push({ id: 'question-1', text: 'What should we revisit next time?' });
  assert.deepEqual(validateAiSessionReport(value, conversation()), []);
});

test('rejects malformed safety flags', () => {
  const value = report();
  value.safetyFlags.push({
    id: 'safety-1',
    category: 'unsupported' as 'other',
    severity: 'urgent' as 'high',
    description: ' ',
    sourceTurnIndexes: [],
    requiresHumanReview: false as true,
  });
  const codes = validationCodes(value);
  assert.ok(codes.includes('INVALID_SAFETY_FLAG_CATEGORY'));
  assert.ok(codes.includes('INVALID_SAFETY_FLAG_SEVERITY'));
  assert.ok(codes.includes('INVALID_SAFETY_FLAG_REVIEW_REQUIREMENT'));
  assert.ok(codes.includes('MISSING_EVIDENCE'));
});

test('rejects unsupported schema versions', () => {
  const value = report();
  value.schemaVersion = '2.0' as '1.0';
  assert.ok(validationCodes(value).includes('UNSUPPORTED_SCHEMA_VERSION'));
});

test('rejects session and conversation references that do not match the input', () => {
  const value = report();
  value.sessionId = 'other-session';
  value.conversationId = 'other-conversation';
  const codes = validationCodes(value);
  assert.ok(codes.includes('SESSION_REFERENCE_MISMATCH'));
  assert.ok(codes.includes('CONVERSATION_REFERENCE_MISMATCH'));
});

test('rejects invalid report timestamps', () => {
  const value = report();
  value.createdAt = '2026-02-31T10:00:00Z';
  value.generation.generatedAt = '2026-99-99T10:00:00Z';
  assert.equal(validationCodes(value).filter((code) => code === 'INVALID_ISO_TIMESTAMP').length, 2);
});

test('validation and evidence collection do not mutate report or conversation inputs', () => {
  const value = report();
  value.themes.push({ id: 'theme-1', text: 'Anxiety.', sourceTurnIndexes: [2, 1] });
  const sourceConversation = conversation();
  const originalReport = structuredClone(value);
  const originalConversation = structuredClone(sourceConversation);

  validateAiSessionReport(value, sourceConversation);
  collectReportEvidenceIndexes(value);

  assert.deepEqual(value, originalReport);
  assert.deepEqual(sourceConversation, originalConversation);
});

test('collects unique evidence indexes in ascending order', () => {
  const value = report();
  value.summary.sourceTurnIndexes = [3, 1];
  value.themes.push({ id: 'theme-1', text: 'Anxiety.', sourceTurnIndexes: [2, 1] });
  value.followUpQuestions.push({ id: 'question-1', text: 'Follow up.', sourceTurnIndexes: [3] });
  value.safetyFlags.push({ id: 'safety-1', category: 'other', severity: 'low', description: 'Review.', sourceTurnIndexes: [2], requiresHumanReview: true });

  assert.deepEqual(collectReportEvidenceIndexes(value), [1, 2, 3]);
});

test('assertion exposes structured validation issues', () => {
  const value = report();
  value.summary.sourceTurnIndexes = [];

  assert.throws(
    () => assertValidAiSessionReport(value, conversation()),
    (error: unknown) =>
      error instanceof AiSessionReportValidationError &&
      error.issues.some((issue) => issue.code === 'MISSING_EVIDENCE')
  );
});
