import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CoachSessionReportError,
  generateCoachSessionReport,
  getCoachSessionTranscript,
  type CoachReportSessionSource,
  type CoachSessionReportDependencies,
} from './coach-session-report';
import { AI_SESSION_REPORT_SCHEMA_VERSION, type AiSessionReport } from './session-report-contract';
import type { SessionReportGenerationInput, SessionReportProvider } from './session-report-provider';

const fixedNow = () => new Date('2026-07-31T10:00:00.000Z');

function source(
  overrides: Partial<CoachReportSessionSource> = {}
): CoachReportSessionSource {
  return {
    id: 44,
    coachUserId: 7,
    status: 'ready_for_review',
    language: 'it',
    transcript: [
      {
        participantId: 7,
        speakerRole: 'coach',
        sequenceNumber: 1,
        startMs: 0,
        endMs: 1_000,
        text: 'Come e andata oggi?',
        confidence: 0.95,
        provider: 'stored-stt',
        model: 'stored-model',
      },
      {
        participantId: 9,
        speakerRole: 'athlete',
        sequenceNumber: 2,
        startMs: 1_100,
        endMs: 2_000,
        text: 'Mi sono sentito ansioso.',
        confidence: 0.8,
        provider: 'stored-stt',
        model: 'stored-model',
      },
    ],
    ...overrides,
  };
}

class CapturingProvider implements SessionReportProvider {
  readonly providerName = 'fake-report-provider';
  readonly modelName = 'fake-report-model';
  invocationCount = 0;
  lastInput: SessionReportGenerationInput | null = null;

  async generateReport(input: SessionReportGenerationInput): Promise<AiSessionReport> {
    this.invocationCount += 1;
    this.lastInput = input;
    return {
      schemaVersion: AI_SESSION_REPORT_SCHEMA_VERSION,
      reportId: 'draft-44',
      sessionId: input.sessionId,
      conversationId: input.conversation.conversationId,
      language: input.language,
      status: 'draft',
      summary: {
        text: 'L’atleta ha riferito ansia.',
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
        provider: this.providerName,
        model: this.modelName,
        promptVersion: input.promptVersion,
        contractVersion: AI_SESSION_REPORT_SCHEMA_VERSION,
        generatedAt: input.generatedAt,
      },
      createdAt: input.generatedAt,
    };
  }
}

function dependencies(
  session: CoachReportSessionSource | null,
  provider: SessionReportProvider = new CapturingProvider(),
  promptVersion = 'mvp-v1',
  hasFeatureAccess = true
): CoachSessionReportDependencies {
  return {
    loadSession: async () => session,
    hasFeatureAccess: async () => hasFeatureAccess,
    createProvider: () => provider,
    promptVersion,
    now: fixedNow,
  };
}

async function expectError(
  operation: () => Promise<unknown>,
  code: CoachSessionReportError['code']
): Promise<CoachSessionReportError> {
  let captured: unknown;
  try {
    await operation();
  } catch (error) {
    captured = error;
  }
  assert.ok(captured instanceof CoachSessionReportError);
  assert.equal(captured.code, code);
  return captured;
}

test('builds the stored transcript pipeline and invokes only the supplied provider', async () => {
  const provider = new CapturingProvider();
  const result = await generateCoachSessionReport(
    { sessionId: 44, actorUserId: 7 },
    dependencies(source(), provider)
  );

  assert.equal(provider.invocationCount, 1);
  assert.equal(provider.lastInput?.conversation.conversationId, 'ai-session-44');
  assert.equal(provider.lastInput?.conversation.turns[0]?.speakerName, 'Coach');
  assert.equal(provider.lastInput?.conversation.turns[1]?.speakerName, 'Atleta');
  assert.equal(provider.lastInput?.generatedAt, '2026-07-31T10:00:00.000Z');
  assert.equal(result.generation.provider, 'fake-report-provider');
  assert.equal(result.generation.model, 'fake-report-model');
});

test('returns a coach-visible normalized transcript without calling a provider', async () => {
  const provider = new CapturingProvider();
  const transcript = await getCoachSessionTranscript(
    { sessionId: 44, actorUserId: 7 },
    dependencies(source(), provider)
  );

  assert.deepEqual(transcript, [
    { turnIndex: 1, speakerLabel: 'Coach', startMs: 0, endMs: 1_000, text: 'COme e andata oggi?' },
    { turnIndex: 2, speakerLabel: 'Atleta', startMs: 1_100, endMs: 2_000, text: 'MI sono sentito ansioso.' },
  ]);
  assert.equal(provider.invocationCount, 0);
});

test('rejects missing sessions and non-coach access before provider construction', async () => {
  let createCount = 0;
  const missingDependencies = dependencies(null);
  missingDependencies.createProvider = () => {
    createCount += 1;
    return new CapturingProvider();
  };
  await expectError(
    () => generateCoachSessionReport({ sessionId: 44, actorUserId: 7 }, missingDependencies),
    'SESSION_NOT_FOUND'
  );

  await expectError(
    () => generateCoachSessionReport({ sessionId: 44, actorUserId: 9 }, dependencies(source())),
    'UNAUTHORIZED'
  );
  assert.equal(createCount, 0);
});

test('rejects disabled AI Notes access before loading a transcript or constructing a provider', async () => {
  let loadCount = 0;
  let createCount = 0;
  const disabledDependencies = dependencies(source(), new CapturingProvider(), 'mvp-v1', false);
  disabledDependencies.loadSession = async () => {
    loadCount += 1;
    return source();
  };
  disabledDependencies.createProvider = () => {
    createCount += 1;
    return new CapturingProvider();
  };

  await expectError(
    () => generateCoachSessionReport({ sessionId: 44, actorUserId: 7 }, disabledDependencies),
    'FEATURE_NOT_ENABLED'
  );
  assert.equal(loadCount, 0);
  assert.equal(createCount, 0);
});

test('requires an eligible session and a stored transcript', async () => {
  await expectError(
    () => getCoachSessionTranscript({ sessionId: 44, actorUserId: 7 }, dependencies(source({ status: 'processing' }))),
    'SESSION_NOT_ELIGIBLE'
  );
  await expectError(
    () => getCoachSessionTranscript({ sessionId: 44, actorUserId: 7 }, dependencies(source({ transcript: [] }))),
    'TRANSCRIPT_UNAVAILABLE'
  );
});

test('does not invoke a provider when report configuration is absent', async () => {
  const provider = new CapturingProvider();
  await expectError(
    () => generateCoachSessionReport({ sessionId: 44, actorUserId: 7 }, dependencies(source(), provider, '')),
    'REPORT_GENERATION_UNAVAILABLE'
  );
  assert.equal(provider.invocationCount, 0);
});

test('maps provider failures to sanitized retry-safe errors', async () => {
  const provider: SessionReportProvider = {
    providerName: 'failing',
    modelName: 'failing-model',
    async generateReport() {
      throw { code: 'RATE_LIMITED', message: 'upstream request detail must not escape' };
    },
  };
  const error = await expectError(
    () => generateCoachSessionReport({ sessionId: 44, actorUserId: 7 }, dependencies(source(), provider)),
    'REPORT_RATE_LIMITED'
  );
  assert.equal(error.message.includes('upstream request detail'), false);
});
