import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AnnotatedConversationModel,
  ConversationTurnAnnotations,
} from './conversation-annotation';
import {
  AI_SESSION_REPORT_SCHEMA_VERSION,
  validateAiSessionReport,
  type AiSessionReport,
} from './session-report-contract';
import {
  FakeSessionReportProvider,
  SessionReportGenerationError,
  generateValidatedSessionReport,
  type SessionReportGenerationInput,
  type SessionReportProvider,
} from './session-report-provider';

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
    ],
    statistics: {
      conversationDuration: 2_000,
      participantCount: 2,
      turnCount: 2,
      averageTurnDuration: 1_000,
      averageWordsPerTurn: 2.5,
      averageConfidence: 0.85,
    },
  };
}

function input(
  overrides: Partial<SessionReportGenerationInput> = {}
): SessionReportGenerationInput {
  return {
    sessionId: 'session-1',
    conversation: conversation(),
    language: 'it',
    promptVersion: 'v1',
    generatedAt: '2026-07-31T10:00:00.000Z',
    ...overrides,
  };
}

function report(overrides: Partial<AiSessionReport> = {}): AiSessionReport {
  return {
    schemaVersion: AI_SESSION_REPORT_SCHEMA_VERSION,
    reportId: 'report-1',
    sessionId: 'session-1',
    conversationId: 'conversation-1',
    language: 'it',
    status: 'draft',
    summary: { text: 'The athlete described anxiety.', sourceTurnIndexes: [2] },
    themes: [],
    athleteStatements: [],
    coachObservations: [],
    goals: [],
    exercisesOrHomework: [],
    followUpQuestions: [],
    safetyFlags: [],
    generation: {
      provider: 'fake',
      model: 'fake-report-v1',
      promptVersion: 'v1',
      contractVersion: AI_SESSION_REPORT_SCHEMA_VERSION,
      generatedAt: '2026-07-31T10:00:00.000Z',
    },
    createdAt: '2026-07-31T10:00:01.000Z',
    ...overrides,
  };
}

async function expectError(
  operation: () => Promise<AiSessionReport>,
  code: SessionReportGenerationError['code']
): Promise<SessionReportGenerationError> {
  let captured: unknown;
  try {
    await operation();
  } catch (error) {
    captured = error;
  }
  assert.ok(captured instanceof SessionReportGenerationError);
  assert.equal(captured.code, code);
  return captured;
}

test('returns a valid report from the deterministic fake provider', async () => {
  const source = report();
  const result = await generateValidatedSessionReport(
    input(),
    new FakeSessionReportProvider({ report: source })
  );

  assert.deepEqual(result, source);
  assert.notStrictEqual(result, source);
  assert.deepEqual(validateAiSessionReport(result, conversation()), []);
});

test('calls the provider exactly once with the supplied conversation reference', async () => {
  const generationInput = input();
  const provider = new FakeSessionReportProvider({ report: report() });

  await generateValidatedSessionReport(generationInput, provider);

  assert.equal(provider.invocationCount, 1);
  assert.strictEqual(provider.lastInput?.conversation, generationInput.conversation);
  assert.equal(provider.lastInput?.generatedAt, generationInput.generatedAt);
});

test('rejects invalid evidence output through existing report validation', async () => {
  const invalid = report();
  invalid.summary.sourceTurnIndexes = [];

  const error = await expectError(
    () => generateValidatedSessionReport(input(), new FakeSessionReportProvider({ report: invalid })),
    'INVALID_PROVIDER_OUTPUT'
  );

  assert.ok(error.validationIssues.some((issue) => issue.code === 'MISSING_EVIDENCE'));
});

test('rejects a report with the wrong session id as metadata mismatch', async () => {
  const invalid = report({ sessionId: 'other-session' });
  await expectError(
    () => generateValidatedSessionReport(input(), new FakeSessionReportProvider({ report: invalid })),
    'METADATA_MISMATCH'
  );
});

test('rejects a report with the wrong conversation id as metadata mismatch', async () => {
  const invalid = report({ conversationId: 'other-conversation' });
  await expectError(
    () => generateValidatedSessionReport(input(), new FakeSessionReportProvider({ report: invalid })),
    'METADATA_MISMATCH'
  );
});

test('rejects report metadata with the wrong provider name', async () => {
  const invalid = report();
  invalid.generation.provider = 'other-provider';
  await expectError(
    () => generateValidatedSessionReport(input(), new FakeSessionReportProvider({ report: invalid })),
    'METADATA_MISMATCH'
  );
});

test('rejects report metadata with the wrong model name', async () => {
  const invalid = report();
  invalid.generation.model = 'other-model';
  await expectError(
    () => generateValidatedSessionReport(input(), new FakeSessionReportProvider({ report: invalid })),
    'METADATA_MISMATCH'
  );
});

test('rejects report metadata with the wrong prompt version', async () => {
  const invalid = report();
  invalid.generation.promptVersion = 'v2';
  await expectError(
    () => generateValidatedSessionReport(input(), new FakeSessionReportProvider({ report: invalid })),
    'METADATA_MISMATCH'
  );
});

test('rejects report metadata with the wrong generated timestamp', async () => {
  const invalid = report();
  invalid.generation.generatedAt = '2026-07-31T10:01:00.000Z';
  await expectError(
    () => generateValidatedSessionReport(input(), new FakeSessionReportProvider({ report: invalid })),
    'METADATA_MISMATCH'
  );
});

test('rejects unsupported report contract versions', async () => {
  const invalid = report({ schemaVersion: '2.0' as '1.0' });
  await expectError(
    () => generateValidatedSessionReport(input(), new FakeSessionReportProvider({ report: invalid })),
    'METADATA_MISMATCH'
  );
});

test('wraps a provider rejection without exposing its original message', async () => {
  const error = await expectError(
    () =>
      generateValidatedSessionReport(
        input(),
        new FakeSessionReportProvider({
          report: report(),
          rejection: new Error('provider secret payload'),
        })
      ),
    'PROVIDER_FAILED'
  );

  assert.equal(error.message.includes('provider secret payload'), false);
});

test('does not mutate direct provider output while validating it', async () => {
  const output = report();
  const original = structuredClone(output);
  const provider: SessionReportProvider = {
    providerName: 'fake',
    modelName: 'fake-report-v1',
    async generateReport() {
      return output;
    },
  };

  await generateValidatedSessionReport(input(), provider);

  assert.deepEqual(output, original);
});

test('does not mutate the generation input or its conversation', async () => {
  const generationInput = input();
  const original = structuredClone(generationInput);

  await generateValidatedSessionReport(
    generationInput,
    new FakeSessionReportProvider({ report: report() })
  );

  assert.deepEqual(generationInput, original);
});

test('concurrent fake-provider calls return independent report results', async () => {
  const provider = new FakeSessionReportProvider({ report: report() });
  const [first, second] = await Promise.all([
    generateValidatedSessionReport(input(), provider),
    generateValidatedSessionReport(input(), provider),
  ]);

  assert.equal(provider.invocationCount, 2);
  assert.notStrictEqual(first, second);
  first.summary.text = 'Changed locally.';
  assert.equal(second.summary.text, 'The athlete described anxiety.');
});

test('fake provider tracks independent direct invocations and the last input', async () => {
  const provider = new FakeSessionReportProvider({ report: report() });
  const first = input();
  const second = input({ promptVersion: 'v2' });

  await provider.generateReport(first);
  await provider.generateReport(second);

  assert.equal(provider.invocationCount, 2);
  assert.strictEqual(provider.lastInput?.conversation, second.conversation);
  assert.equal(provider.lastInput?.promptVersion, 'v2');
});

test('fake provider returns deep-safe configured output without external dependencies', async () => {
  const configured = report();
  const provider = new FakeSessionReportProvider({ report: configured });
  const result = await provider.generateReport(input());

  result.summary.sourceTurnIndexes.push(1);
  assert.deepEqual(configured.summary.sourceTurnIndexes, [2]);
});

test('rejects report metadata with a language that differs from the input', async () => {
  const invalid = report({ language: 'en' });
  await expectError(
    () => generateValidatedSessionReport(input(), new FakeSessionReportProvider({ report: invalid })),
    'METADATA_MISMATCH'
  );
});
