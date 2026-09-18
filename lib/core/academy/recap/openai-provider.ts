import {
  OpenAiResponsesHttpClient,
  type OpenAiResponsesClient,
  type OpenAiResponsesRequest,
  type OpenAiResponsesResponse,
} from '../../ai-session-notes/openai-session-report-provider';
import { ACADEMY_RECAP_SCHEMA_VERSION, MAX_KEY_CONCEPTS, type AcademyRecapContent } from './contract';
import type { AcademyRecapGenerationInput, AcademyRecapProvider } from './provider';

const DEFAULT_TIMEOUT_MS = 45_000;

export type OpenAiAcademyRecapProviderErrorCode =
  | 'CONFIGURATION'
  | 'TIMEOUT'
  | 'PROVIDER_FAILED'
  | 'MALFORMED_OUTPUT';

/** Sanitized adapter error — never exposes the transcript or the raw provider payload. */
export class OpenAiAcademyRecapProviderError extends Error {
  constructor(
    public readonly code: OpenAiAcademyRecapProviderErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'OpenAiAcademyRecapProviderError';
  }
}

const RECAP_CONTENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['keyConcepts', 'toolsAndProtocols', 'practicalCases', 'openQuestions', 'nextAction', 'topicsCovered'],
  properties: {
    keyConcepts: {
      type: 'array',
      maxItems: MAX_KEY_CONCEPTS,
      items: { type: 'string' },
    },
    toolsAndProtocols: { type: 'array', items: { type: 'string' } },
    practicalCases: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
    nextAction: { type: 'string' },
    topicsCovered: { type: 'array', items: { type: 'string' } },
  },
};

type RecapContentPayload = {
  keyConcepts: string[];
  toolsAndProtocols: string[];
  practicalCases: string[];
  openQuestions: string[];
  nextAction: string;
  topicsCovered: string[];
};

function isRecapContentPayload(value: unknown): value is RecapContentPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.keyConcepts) &&
    Array.isArray(v.toolsAndProtocols) &&
    Array.isArray(v.practicalCases) &&
    Array.isArray(v.openQuestions) &&
    typeof v.nextAction === 'string' &&
    Array.isArray(v.topicsCovered)
  );
}

function systemInstructions(): string {
  return `You summarize a training session transcript between a mental-coaching instructor and coaches learning the profession (Academy training, not a therapy session with an athlete).
Produce a structured recap of what was actually discussed. Use only information contained in the supplied transcript — never invent content.
keyConcepts: at most ${MAX_KEY_CONCEPTS} key concepts explained in the session, ranked by importance.
toolsAndProtocols: concrete tools, techniques or operational protocols mentioned.
practicalCases: practical/real-world cases or examples discussed.
openQuestions: questions or doubts raised in the session that were left unresolved.
nextAction: one single concrete, practical next action for the participating coach to try before the next session.
topicsCovered: the actual topics or modules covered, as named in the session — not the planned curriculum.
Never assess, rank, rate or psychologically profile any individual participant. Never use speaking time, participation frequency or personality traits as a signal for anything. Report only session content.
Return only the requested structured recap content, in Italian.`;
}

function requestFor(input: AcademyRecapGenerationInput, model: string): OpenAiResponsesRequest {
  return {
    model,
    instructions: systemInstructions(),
    input: JSON.stringify({
      sessionId: input.sessionId,
      courseTitle: input.courseTitle,
      moduleTitle: input.moduleTitle,
      transcript: input.transcriptText,
    }),
    store: false,
    text: {
      format: {
        type: 'json_schema',
        name: 'academy_recap_content_v1',
        strict: true,
        schema: RECAP_CONTENT_SCHEMA,
      },
    },
  };
}

function structuredOutputText(response: OpenAiResponsesResponse): string {
  const messages = response.output.filter((item) => item.type === 'message');
  const text = messages
    .flatMap((message) => message.content ?? [])
    .filter((content) => content.type === 'output_text')
    .map((content) => content.text)
    .filter((content): content is string => typeof content === 'string');
  if (text.length !== 1) {
    throw new OpenAiAcademyRecapProviderError(
      'MALFORMED_OUTPUT',
      'La risposta OpenAI non conteneva esattamente un output strutturato.'
    );
  }
  return text[0];
}

export type OpenAiAcademyRecapProviderOptions = {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  client?: OpenAiResponsesClient;
};

/**
 * Riusa lo stesso `OpenAiResponsesHttpClient` del provider dei report AI
 * Notes (`openai-session-report-provider.ts`) — stessa API, stesso modo di
 * chiamare OpenAI — ma con un prompt e uno schema propri: il recap Academy
 * non è un report terapeutico, è il riepilogo di una sessione di
 * formazione tra coach.
 */
export class OpenAiAcademyRecapProvider implements AcademyRecapProvider {
  readonly providerName = 'openai';
  readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly client: OpenAiResponsesClient;

  constructor(options: OpenAiAcademyRecapProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new OpenAiAcademyRecapProviderError('CONFIGURATION', 'OPENAI_API_KEY è richiesta.');
    }
    if (!options.model.trim()) {
      throw new OpenAiAcademyRecapProviderError('CONFIGURATION', 'AI_NOTES_REPORT_MODEL è richiesto.');
    }
    this.modelName = options.model;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.client = options.client ?? new OpenAiResponsesHttpClient(options.apiKey);
  }

  async generateRecap(input: AcademyRecapGenerationInput): Promise<AcademyRecapContent> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: OpenAiResponsesResponse;
    try {
      response = await this.client.create(requestFor(input, this.modelName), {
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new OpenAiAcademyRecapProviderError('TIMEOUT', 'La generazione del recap è scaduta.');
      }
      if (error instanceof OpenAiAcademyRecapProviderError) throw error;
      throw new OpenAiAcademyRecapProviderError('PROVIDER_FAILED', 'La richiesta a OpenAI non è andata a buon fine.');
    } finally {
      clearTimeout(timer);
    }

    const text = structuredOutputText(response);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new OpenAiAcademyRecapProviderError('MALFORMED_OUTPUT', 'Risposta OpenAI non è JSON valido.');
    }
    if (!isRecapContentPayload(parsed)) {
      throw new OpenAiAcademyRecapProviderError('MALFORMED_OUTPUT', 'Risposta OpenAI non conforme al contratto.');
    }

    return {
      schemaVersion: ACADEMY_RECAP_SCHEMA_VERSION,
      keyConcepts: parsed.keyConcepts,
      toolsAndProtocols: parsed.toolsAndProtocols,
      practicalCases: parsed.practicalCases,
      openQuestions: parsed.openQuestions,
      nextAction: parsed.nextAction,
      topicsCovered: parsed.topicsCovered,
      generation: {
        provider: this.providerName,
        model: this.modelName,
        generatedAt: input.generatedAt,
      },
    };
  }
}

/** Legge la configurazione dall'ambiente — stessa variabile modello già usata dai report AI Notes. */
export function openAiAcademyRecapProviderFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  client?: OpenAiResponsesClient
): OpenAiAcademyRecapProvider {
  return new OpenAiAcademyRecapProvider({
    apiKey: environment.OPENAI_API_KEY?.trim() ?? '',
    model: environment.AI_NOTES_REPORT_MODEL?.trim() ?? '',
    client,
  });
}
