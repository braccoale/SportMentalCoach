import type { AnnotatedConversationModel } from './conversation-annotation';
import {
  AI_SESSION_REPORT_SCHEMA_VERSION,
  type AiSessionReport,
  type EvidenceBackedItem,
  type SafetyFlag,
  type SuggestedItem,
} from './session-report-contract';
import type {
  SessionReportGenerationInput,
  SessionReportProvider,
} from './session-report-provider';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_TIMEOUT_MS = 60_000;

export type OpenAiSessionReportProviderErrorCode =
  | 'CONFIGURATION'
  | 'PROMPT_VERSION_MISMATCH'
  | 'TIMEOUT'
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'PROVIDER_FAILED'
  | 'MALFORMED_OUTPUT';

/** Sanitized adapter error that deliberately excludes provider response content. */
export class OpenAiSessionReportProviderError extends Error {
  constructor(
    public readonly code: OpenAiSessionReportProviderErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'OpenAiSessionReportProviderError';
  }
}

export type OpenAiResponsesRequest = {
  model: string;
  instructions: string;
  input: string;
  store: false;
  text: {
    format: {
      type: 'json_schema';
      name: string;
      strict: true;
      schema: Record<string, unknown>;
    };
  };
};

export type OpenAiResponsesResponse = {
  output: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
    }>;
  }>;
};

export interface OpenAiResponsesClient {
  create(
    request: OpenAiResponsesRequest,
    options: { signal: AbortSignal }
  ): Promise<OpenAiResponsesResponse>;
}

type OpenAiFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/** Minimal server-only HTTP client for the OpenAI Responses API. */
export class OpenAiResponsesHttpClient implements OpenAiResponsesClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: OpenAiFetch = fetch
  ) {}

  async create(
    request: OpenAiResponsesRequest,
    options: { signal: AbortSignal }
  ): Promise<OpenAiResponsesResponse> {
    let response: Response;
    try {
      response = await this.fetcher(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: options.signal,
      });
    } catch {
      throw new OpenAiSessionReportProviderError(
        'PROVIDER_FAILED',
        'OpenAI session report request did not complete.'
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new OpenAiSessionReportProviderError(
        'AUTHENTICATION_FAILED',
        'OpenAI session report authorization failed.'
      );
    }
    if (response.status === 429) {
      throw new OpenAiSessionReportProviderError(
        'RATE_LIMITED',
        'OpenAI session report request was rate limited.'
      );
    }
    if (!response.ok) {
      throw new OpenAiSessionReportProviderError(
        'PROVIDER_FAILED',
        'OpenAI session report request failed.'
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new OpenAiSessionReportProviderError(
        'MALFORMED_OUTPUT',
        'OpenAI session report response was not valid structured output.'
      );
    }
    if (!isOpenAiResponsesResponse(payload)) {
      throw new OpenAiSessionReportProviderError(
        'MALFORMED_OUTPUT',
        'OpenAI session report response was incomplete.'
      );
    }
    return payload;
  }
}

export type OpenAiSessionReportProviderOptions = {
  apiKey: string;
  model: string;
  promptVersion: string;
  timeoutMs?: number;
  client?: OpenAiResponsesClient;
};

/**
 * The real OpenAI provider. It sends only a minimized annotated conversation,
 * asks for strict JSON Schema output, and constructs trusted envelope metadata.
 */
export class OpenAiSessionReportProvider implements SessionReportProvider {
  readonly providerName = 'openai';
  readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly client: OpenAiResponsesClient;

  constructor(private readonly options: OpenAiSessionReportProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new OpenAiSessionReportProviderError(
        'CONFIGURATION',
        'OPENAI_API_KEY is required for OpenAI session reports.'
      );
    }
    if (!options.model.trim()) {
      throw new OpenAiSessionReportProviderError(
        'CONFIGURATION',
        'AI_NOTES_REPORT_MODEL is required for OpenAI session reports.'
      );
    }
    if (!options.promptVersion.trim()) {
      throw new OpenAiSessionReportProviderError(
        'CONFIGURATION',
        'AI_NOTES_REPORT_PROMPT_VERSION is required for OpenAI session reports.'
      );
    }
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new OpenAiSessionReportProviderError(
        'CONFIGURATION',
        'OpenAI session report timeout must be a positive integer.'
      );
    }
    this.modelName = options.model;
    this.client =
      options.client ?? new OpenAiResponsesHttpClient(options.apiKey);
  }

  async generateReport(
    input: SessionReportGenerationInput
  ): Promise<AiSessionReport> {
    if (input.promptVersion !== this.options.promptVersion) {
      throw new OpenAiSessionReportProviderError(
        'PROMPT_VERSION_MISMATCH',
        'Session report input prompt version does not match provider configuration.'
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: OpenAiResponsesResponse;
    try {
      response = await this.client.create(
        requestFor(input, this.modelName, this.options.promptVersion),
        { signal: controller.signal }
      );
    } catch (error) {
      if (controller.signal.aborted) {
        throw new OpenAiSessionReportProviderError(
          'TIMEOUT',
          'OpenAI session report request timed out.'
        );
      }
      if (error instanceof OpenAiSessionReportProviderError) {
        throw error;
      }
      throw new OpenAiSessionReportProviderError(
        'PROVIDER_FAILED',
        'OpenAI session report request did not complete.'
      );
    } finally {
      clearTimeout(timer);
    }

    return reportFromStructuredResponse(response, input, this);
  }
}

/**
 * Reads server-only configuration. For the MVP, set
 * `AI_NOTES_REPORT_MODEL=gpt-5-mini`; the model has no domain-code default.
 */
export function openAiSessionReportProviderFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  client?: OpenAiResponsesClient
): OpenAiSessionReportProvider {
  return new OpenAiSessionReportProvider({
    apiKey: environment.OPENAI_API_KEY?.trim() ?? '',
    model: environment.AI_NOTES_REPORT_MODEL?.trim() ?? '',
    promptVersion: environment.AI_NOTES_REPORT_PROMPT_VERSION?.trim() ?? '',
    client,
  });
}

type ReportContent = {
  summary: { text: string; sourceTurnIndexes: number[] };
  themes: ContentItem[];
  athleteStatements: ContentItem[];
  coachObservations: ContentItem[];
  goals: ContentItem[];
  exercisesOrHomework: ContentItem[];
  followUpQuestions: ContentSuggestion[];
  safetyFlags: ContentSafetyFlag[];
};

type ContentItem = {
  id: string;
  text: string;
  sourceTurnIndexes: number[];
  confidence: number | null;
};

type ContentSuggestion = {
  id: string;
  text: string;
  rationale: string | null;
  sourceTurnIndexes: number[];
};

type ContentSafetyFlag = SafetyFlag;

const REPORT_CONTENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'themes',
    'athleteStatements',
    'coachObservations',
    'goals',
    'exercisesOrHomework',
    'followUpQuestions',
    'safetyFlags',
  ],
  properties: {
    summary: evidenceTextSchema(),
    themes: { type: 'array', items: evidenceItemSchema() },
    athleteStatements: { type: 'array', items: evidenceItemSchema() },
    coachObservations: { type: 'array', items: evidenceItemSchema() },
    goals: { type: 'array', items: evidenceItemSchema() },
    exercisesOrHomework: { type: 'array', items: evidenceItemSchema() },
    followUpQuestions: { type: 'array', items: suggestionSchema() },
    safetyFlags: { type: 'array', items: safetyFlagSchema() },
  },
};

function requestFor(
  input: SessionReportGenerationInput,
  model: string,
  promptVersion: string
): OpenAiResponsesRequest {
  return {
    model,
    instructions: systemInstructions(promptVersion),
    input: JSON.stringify(minimizedConversation(input)),
    store: false,
    text: {
      format: {
        type: 'json_schema',
        name: 'ai_session_report_content_v1',
        strict: true,
        schema: REPORT_CONTENT_SCHEMA,
      },
    },
  };
}

function minimizedConversation(input: SessionReportGenerationInput): Record<string, unknown> {
  const conversation = input.conversation;
  return {
    sessionId: input.sessionId,
    conversationId: conversation.conversationId,
    language: input.language,
    participants: conversation.participants.map((participant) => ({
      speakerId: participant.speakerId,
      speakerRole: participant.speakerRole,
      speakerName: participant.speakerName,
    })),
    turns: conversation.turns.map((turn) => ({
      turnIndex: turn.turnIndex,
      speakerId: turn.speakerId,
      speakerRole: turn.speakerRole,
      speakerName: turn.speakerName,
      startMs: turn.startMs,
      endMs: turn.endMs,
      durationMs: turn.durationMs,
      text: turn.text,
      wordCount: turn.wordCount,
      confidence: turn.confidence,
      overlap: turn.overlap,
      annotations: { ...turn.annotations },
    })),
    reportSchemaVersion: AI_SESSION_REPORT_SCHEMA_VERSION,
  };
}

function systemInstructions(promptVersion: string): string {
  return `Prompt version: ${promptVersion}
You create a draft session report for review by a sports mental coach.
You are not a psychologist or medical professional. Do not diagnose. Do not recommend medical or psychological treatment.
Use only information contained in the supplied conversation.
athleteStatements contain only explicit athlete statements. coachObservations are tentative observations for coach review. goals contain only explicitly discussed or agreed goals. exercisesOrHomework contain only tasks explicitly assigned or discussed. followUpQuestions are suggestions for a future session.
Every factual or interpretative item must cite valid sourceTurnIndexes. Never invent turn indexes or cite unsupported turns.
Safety flags are draft signals requiring human review, never diagnoses.
Return only the requested structured report content.`;
}

function reportFromStructuredResponse(
  response: OpenAiResponsesResponse,
  input: SessionReportGenerationInput,
  provider: OpenAiSessionReportProvider
): AiSessionReport {
  const text = structuredOutputText(response);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new OpenAiSessionReportProviderError(
      'MALFORMED_OUTPUT',
      'OpenAI session report response was not valid structured JSON.'
    );
  }
  if (!isReportContent(value)) {
    throw new OpenAiSessionReportProviderError(
      'MALFORMED_OUTPUT',
      'OpenAI session report response did not match the required structure.'
    );
  }
  return {
    schemaVersion: AI_SESSION_REPORT_SCHEMA_VERSION,
    reportId: `draft:${input.sessionId}:${input.conversation.conversationId}:${input.generatedAt}`,
    sessionId: input.sessionId,
    conversationId: input.conversation.conversationId,
    language: input.language,
    status: 'draft',
    summary: value.summary,
    themes: reportItems(value.themes),
    athleteStatements: reportItems(value.athleteStatements),
    coachObservations: reportItems(value.coachObservations),
    goals: reportItems(value.goals),
    exercisesOrHomework: reportItems(value.exercisesOrHomework),
    followUpQuestions: suggestions(value.followUpQuestions),
    safetyFlags: value.safetyFlags,
    generation: {
      provider: provider.providerName,
      model: provider.modelName,
      promptVersion: input.promptVersion,
      contractVersion: AI_SESSION_REPORT_SCHEMA_VERSION,
      generatedAt: input.generatedAt,
    },
    createdAt: input.generatedAt,
  };
}

function structuredOutputText(response: OpenAiResponsesResponse): string {
  const messages = response.output.filter((item) => item.type === 'message');
  const text = messages.flatMap((message) => message.content ?? [])
    .filter((content) => content.type === 'output_text')
    .map((content) => content.text)
    .filter((content): content is string => typeof content === 'string');
  if (text.length !== 1) {
    throw new OpenAiSessionReportProviderError(
      'MALFORMED_OUTPUT',
      'OpenAI session report response did not contain one structured output.'
    );
  }
  return text[0];
}

function reportItems(items: readonly ContentItem[]): EvidenceBackedItem[] {
  return items.map((item) =>
    item.confidence === null
      ? {
          id: item.id,
          text: item.text,
          sourceTurnIndexes: [...item.sourceTurnIndexes],
        }
      : {
          id: item.id,
          text: item.text,
          sourceTurnIndexes: [...item.sourceTurnIndexes],
          confidence: item.confidence,
        }
  );
}

function suggestions(items: readonly ContentSuggestion[]): SuggestedItem[] {
  return items.map((item) => ({
    id: item.id,
    text: item.text,
    ...(item.rationale === null ? {} : { rationale: item.rationale }),
    ...(item.sourceTurnIndexes.length
      ? { sourceTurnIndexes: [...item.sourceTurnIndexes] }
      : {}),
  }));
}

function evidenceTextSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'sourceTurnIndexes'],
    properties: {
      text: { type: 'string' },
      sourceTurnIndexes: sourceTurnIndexesSchema(),
    },
  };
}

function evidenceItemSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'text', 'sourceTurnIndexes', 'confidence'],
    properties: {
      id: { type: 'string' },
      text: { type: 'string' },
      sourceTurnIndexes: sourceTurnIndexesSchema(),
      confidence: { type: ['number', 'null'] },
    },
  };
}

function suggestionSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'text', 'rationale', 'sourceTurnIndexes'],
    properties: {
      id: { type: 'string' },
      text: { type: 'string' },
      rationale: { type: ['string', 'null'] },
      sourceTurnIndexes: sourceTurnIndexesSchema(),
    },
  };
}

function safetyFlagSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'category',
      'severity',
      'description',
      'sourceTurnIndexes',
      'requiresHumanReview',
    ],
    properties: {
      id: { type: 'string' },
      category: {
        type: 'string',
        enum: [
          'self_harm',
          'harm_to_others',
          'abuse',
          'medical',
          'psychological_crisis',
          'other',
        ],
      },
      severity: { type: 'string', enum: ['low', 'medium', 'high'] },
      description: { type: 'string' },
      sourceTurnIndexes: sourceTurnIndexesSchema(),
      requiresHumanReview: { type: 'boolean', enum: [true] },
    },
  };
}

function sourceTurnIndexesSchema(): Record<string, unknown> {
  return { type: 'array', items: { type: 'integer', minimum: 0 } };
}

function isOpenAiResponsesResponse(value: unknown): value is OpenAiResponsesResponse {
  const record = asRecord(value);
  return Array.isArray(record?.output);
}

function isReportContent(value: unknown): value is ReportContent {
  const record = asRecord(value);
  return (
    record !== undefined &&
    isEvidenceText(record.summary) &&
    isContentItems(record.themes) &&
    isContentItems(record.athleteStatements) &&
    isContentItems(record.coachObservations) &&
    isContentItems(record.goals) &&
    isContentItems(record.exercisesOrHomework) &&
    isSuggestions(record.followUpQuestions) &&
    isSafetyFlags(record.safetyFlags)
  );
}

function isEvidenceText(value: unknown): value is ReportContent['summary'] {
  const record = asRecord(value);
  return typeof record?.text === 'string' && isTurnIndexes(record.sourceTurnIndexes);
}

function isContentItems(value: unknown): value is ContentItem[] {
  return Array.isArray(value) && value.every(isContentItem);
}

function isContentItem(value: unknown): value is ContentItem {
  const record = asRecord(value);
  return (
    typeof record?.id === 'string' &&
    typeof record.text === 'string' &&
    isTurnIndexes(record.sourceTurnIndexes) &&
    (record.confidence === null || typeof record.confidence === 'number')
  );
}

function isSuggestions(value: unknown): value is ContentSuggestion[] {
  return Array.isArray(value) && value.every(isSuggestion);
}

function isSuggestion(value: unknown): value is ContentSuggestion {
  const record = asRecord(value);
  return (
    typeof record?.id === 'string' &&
    typeof record.text === 'string' &&
    (record.rationale === null || typeof record.rationale === 'string') &&
    isTurnIndexes(record.sourceTurnIndexes)
  );
}

function isSafetyFlags(value: unknown): value is ContentSafetyFlag[] {
  return Array.isArray(value) && value.every(isSafetyFlag);
}

function isSafetyFlag(value: unknown): value is ContentSafetyFlag {
  const record = asRecord(value);
  return (
    typeof record?.id === 'string' &&
    ['self_harm', 'harm_to_others', 'abuse', 'medical', 'psychological_crisis', 'other'].includes(
      record.category as string
    ) &&
    ['low', 'medium', 'high'].includes(record.severity as string) &&
    typeof record.description === 'string' &&
    isTurnIndexes(record.sourceTurnIndexes) &&
    record.requiresHumanReview === true
  );
}

function isTurnIndexes(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
