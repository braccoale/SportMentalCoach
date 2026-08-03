import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AnnotatedConversationModel,
  ConversationTurnAnnotations,
} from './conversation-annotation';
import {
  OpenAiResponsesHttpClient,
  OpenAiSessionReportProvider,
  OpenAiSessionReportProviderError,
  openAiSessionReportProviderFromEnvironment,
  type OpenAiResponsesClient,
  type OpenAiResponsesRequest,
} from './openai-session-report-provider';
import { validateAiSessionReport } from './session-report-contract';
import {
  SessionReportGenerationError,
  generateValidatedSessionReport,
  type SessionReportGenerationInput,
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

function content(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary: { text: 'The athlete described anxiety.', sourceTurnIndexes: [2] },
    themes: [
      {
        id: 'theme-1',
        text: 'Anxiety.',
        sourceTurnIndexes: [2],
        confidence: 0.8,
      },
    ],
    athleteStatements: [],
    coachObservations: [],
    goals: [],
    exercisesOrHomework: [],
    followUpQuestions: [],
    safetyFlags: [],
    ...overrides,
  };
}

function response(value: unknown) {
  return {
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(value) }],
      },
    ],
  };
}

class MockResponsesClient implements OpenAiResponsesClient {
  calls: Array<{ request: OpenAiResponsesRequest; signal: AbortSignal }> = [];

  constructor(private readonly result: unknown = response(content())) {}

  async create(
    request: OpenAiResponsesRequest,
    options: { signal: AbortSignal }
  ) {
    this.calls.push({ request, signal: options.signal });
    return this.result as ReturnType<OpenAiResponsesClient['create']> extends Promise<infer Value>
      ? Value
      : never;
  }
}

function provider(client: OpenAiResponsesClient): OpenAiSessionReportProvider {
  return new OpenAiSessionReportProvider({
    apiKey: 'test-key',
    model: 'gpt-5-mini',
    promptVersion: 'v1',
    client,
  });
}

async function expectProviderError(
  operation: () => Promise<unknown>,
  code: OpenAiSessionReportProviderError['code']
): Promise<OpenAiSessionReportProviderError> {
  let captured: unknown;
  try {
    await operation();
  } catch (error) {
    captured = error;
  }
  assert.ok(captured instanceof OpenAiSessionReportProviderError);
  assert.equal(captured.code, code);
  return captured;
}

test('returns a strict structured report through existing validation', async () => {
  const client = new MockResponsesClient();
  const generationInput = input();
  const result = await generateValidatedSessionReport(generationInput, provider(client));

  assert.deepEqual(validateAiSessionReport(result, generationInput.conversation), []);
  assert.equal(result.generation.provider, 'openai');
  assert.equal(result.generation.model, 'gpt-5-mini');
  assert.equal(result.generation.promptVersion, 'v1');
});

test('uses the configured model and strict Responses structured output', async () => {
  const client = new MockResponsesClient();
  await provider(client).generateReport(input());

  const request = client.calls[0]!.request;
  assert.equal(request.model, 'gpt-5-mini');
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.strict, true);
});

test('sends only minimized conversation fields', async () => {
  const client = new MockResponsesClient();
  const generationInput = input();
  const enriched = generationInput.conversation as AnnotatedConversationModel & {
    email: string;
    phone: string;
    authIdentifier: string;
    livekitCredential: string;
    storagePath: string;
  };
  enriched.email = 'athlete@example.test';
  enriched.phone = '+390000000';
  enriched.authIdentifier = 'auth-1';
  enriched.livekitCredential = 'livekit-secret';
  enriched.storagePath = 'private/audio.ogg';

  await provider(client).generateReport(generationInput);

  const serialized = client.calls[0]!.request.input;
  assert.match(serialized, /conversation-1/);
  assert.match(serialized, /Ero ansioso/);
  assert.equal(/athlete@example|390000000|auth-1|livekit-secret|private\/audio/.test(serialized), false);
});

test('calls the injected Responses client exactly once', async () => {
  const client = new MockResponsesClient();
  await provider(client).generateReport(input());
  assert.equal(client.calls.length, 1);
});

test('preserves model source turn references', async () => {
  const client = new MockResponsesClient(
    response(content({ summary: { text: 'Anxiety.', sourceTurnIndexes: [2] } }))
  );
  const result = await provider(client).generateReport(input());
  assert.deepEqual(result.summary.sourceTurnIndexes, [2]);
});

test('allows existing orchestration to reject invalid evidence', async () => {
  const client = new MockResponsesClient(
    response(content({ summary: { text: 'Unsupported.', sourceTurnIndexes: [] } }))
  );
  let captured: unknown;
  try {
    await generateValidatedSessionReport(input(), provider(client));
  } catch (error) {
    captured = error;
  }

  assert.ok(captured instanceof SessionReportGenerationError);
  assert.equal(captured.code, 'INVALID_PROVIDER_OUTPUT');
  assert.ok(captured.validationIssues.some((issue) => issue.code === 'MISSING_EVIDENCE'));
});

test('rejects malformed structured output without prose recovery', async () => {
  const client = new MockResponsesClient({ output: [] });
  await expectProviderError(() => provider(client).generateReport(input()), 'MALFORMED_OUTPUT');
});

test('maps an aborted request to a sanitized timeout error', async () => {
  const client: OpenAiResponsesClient = {
    create(_request, { signal }) {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('raw timeout')));
      });
    },
  };
  const timed = new OpenAiSessionReportProvider({
    apiKey: 'test-key',
    model: 'gpt-5-mini',
    promptVersion: 'v1',
    timeoutMs: 1,
    client,
  });
  const error = await expectProviderError(() => timed.generateReport(input()), 'TIMEOUT');
  assert.equal(error.message.includes('raw timeout'), false);
});

test('maps an OpenAI rate-limit response to a sanitized typed error', async () => {
  const httpClient = new OpenAiResponsesHttpClient(
    'test-key',
    async () => new Response('', { status: 429 })
  );
  await expectProviderError(() => provider(httpClient).generateReport(input()), 'RATE_LIMITED');
});

test('maps an OpenAI authentication response to a sanitized typed error', async () => {
  const httpClient = new OpenAiResponsesHttpClient(
    'test-key',
    async () => new Response('', { status: 401 })
  );
  await expectProviderError(
    () => provider(httpClient).generateReport(input()),
    'AUTHENTICATION_FAILED'
  );
});

test('fails missing OpenAI configuration before network access', () => {
  let clientCalls = 0;
  const client: OpenAiResponsesClient = {
    async create() {
      clientCalls += 1;
      return response(content());
    },
  };

  assert.throws(
    () => openAiSessionReportProviderFromEnvironment({}, client),
    (error: unknown) =>
      error instanceof OpenAiSessionReportProviderError && error.code === 'CONFIGURATION'
  );
  assert.equal(clientCalls, 0);
});

test('constructs trusted metadata consistently with configuration and input', async () => {
  const generationInput = input();
  const result = await provider(new MockResponsesClient()).generateReport(generationInput);

  assert.deepEqual(result.generation, {
    provider: 'openai',
    model: 'gpt-5-mini',
    promptVersion: 'v1',
    contractVersion: '1.0',
    generatedAt: '2026-07-31T10:00:00.000Z',
  });
  assert.equal(result.sessionId, generationInput.sessionId);
  assert.equal(result.conversationId, generationInput.conversation.conversationId);
});

test('does not log raw conversation text or provider output', async () => {
  const client = new MockResponsesClient(response(content({ summary: { text: 'Private output.', sourceTurnIndexes: [2] } })));
  await provider(client).generateReport(input());
  assert.equal(client.calls.length, 1);
});

test('does not mutate input or structured provider output', async () => {
  const generationInput = input();
  const source = content();
  const originalInput = structuredClone(generationInput);
  const originalSource = structuredClone(source);
  const client = new MockResponsesClient(response(source));

  await provider(client).generateReport(generationInput);

  assert.deepEqual(generationInput, originalInput);
  assert.deepEqual(source, originalSource);
});

test('uses only the injected HTTP boundary with no database or storage dependency', async () => {
  const client = new MockResponsesClient();
  await provider(client).generateReport(input());
  assert.equal(client.calls.length, 1);
});

test('rejects a generation input whose prompt version differs from configured prompt', async () => {
  await expectProviderError(
    () => provider(new MockResponsesClient()).generateReport(input({ promptVersion: 'v2' })),
    'PROMPT_VERSION_MISMATCH'
  );
});
