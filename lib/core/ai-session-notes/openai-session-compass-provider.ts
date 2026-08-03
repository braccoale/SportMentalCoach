/**
 * Adapter OpenAI per Session Compass v1.
 *
 * Invia solo il transcript già normalizzato e il contesto lecito, chiede
 * output JSON strict e non costruisce mai da sé il contenuto: il montaggio e
 * la verifica delle evidenze restano nel modulo provider-neutro.
 */

import {
  MAX_KEY_MOMENTS,
  MAX_NEXT_SESSION_PREP,
  MAX_QUOTE_LENGTH,
  MAX_THEMES,
  minuteFromMs,
} from './session-compass-contract';
import {
  assembleSessionCompassReport,
  type RawCompassContent,
  type SessionCompassGenerationInput,
  type SessionCompassReportProvider,
} from './session-compass-provider';
import type { SessionCompassReport } from './session-compass-contract';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_TIMEOUT_MS = 60_000;

export type OpenAiSessionCompassErrorCode =
  | 'CONFIGURATION'
  | 'PROMPT_VERSION_MISMATCH'
  | 'TIMEOUT'
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'PROVIDER_FAILED'
  | 'MALFORMED_OUTPUT';

/** Errore sanificato: non espone mai il payload del provider. */
export class OpenAiSessionCompassError extends Error {
  constructor(
    public readonly code: OpenAiSessionCompassErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'OpenAiSessionCompassError';
  }
}

export type OpenAiCompassRequest = {
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

export type OpenAiCompassResponse = {
  output: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
};

export interface OpenAiCompassClient {
  create(
    request: OpenAiCompassRequest,
    options: { signal: AbortSignal }
  ): Promise<OpenAiCompassResponse>;
}

type OpenAiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class OpenAiCompassHttpClient implements OpenAiCompassClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: OpenAiFetch = fetch
  ) {}

  async create(
    request: OpenAiCompassRequest,
    options: { signal: AbortSignal }
  ): Promise<OpenAiCompassResponse> {
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
      throw new OpenAiSessionCompassError('PROVIDER_FAILED', 'Richiesta Session Compass non completata.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new OpenAiSessionCompassError('AUTHENTICATION_FAILED', 'Autorizzazione OpenAI non valida.');
    }
    if (response.status === 429) {
      throw new OpenAiSessionCompassError('RATE_LIMITED', 'Richiesta OpenAI limitata.');
    }
    if (!response.ok) {
      throw new OpenAiSessionCompassError('PROVIDER_FAILED', 'Richiesta OpenAI non riuscita.');
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new OpenAiSessionCompassError('MALFORMED_OUTPUT', 'Risposta OpenAI non valida.');
    }
    if (!isCompassResponse(payload)) {
      throw new OpenAiSessionCompassError('MALFORMED_OUTPUT', 'Risposta OpenAI incompleta.');
    }
    return payload;
  }
}

export type OpenAiSessionCompassProviderOptions = {
  apiKey: string;
  model: string;
  promptVersion: string;
  timeoutMs?: number;
  client?: OpenAiCompassClient;
};

export class OpenAiSessionCompassReportProvider
  implements SessionCompassReportProvider
{
  readonly providerName = 'openai';
  readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly client: OpenAiCompassClient;

  constructor(private readonly options: OpenAiSessionCompassProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new OpenAiSessionCompassError('CONFIGURATION', 'OPENAI_API_KEY è richiesta.');
    }
    if (!options.model.trim()) {
      throw new OpenAiSessionCompassError('CONFIGURATION', 'AI_NOTES_COMPASS_MODEL è richiesto.');
    }
    if (!options.promptVersion.trim()) {
      throw new OpenAiSessionCompassError('CONFIGURATION', 'AI_NOTES_COMPASS_PROMPT_VERSION è richiesta.');
    }
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new OpenAiSessionCompassError('CONFIGURATION', 'Timeout non valido.');
    }
    this.modelName = options.model;
    this.client = options.client ?? new OpenAiCompassHttpClient(options.apiKey);
  }

  async generateReport(
    input: SessionCompassGenerationInput
  ): Promise<SessionCompassReport> {
    if (input.promptVersion !== this.options.promptVersion) {
      throw new OpenAiSessionCompassError(
        'PROMPT_VERSION_MISMATCH',
        'La versione prompt non corrisponde alla configurazione del provider.'
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: OpenAiCompassResponse;
    try {
      response = await this.client.create(
        requestFor(input, this.modelName, this.options.promptVersion),
        { signal: controller.signal }
      );
    } catch (error) {
      if (controller.signal.aborted) {
        throw new OpenAiSessionCompassError('TIMEOUT', 'Richiesta Session Compass scaduta.');
      }
      if (error instanceof OpenAiSessionCompassError) throw error;
      throw new OpenAiSessionCompassError('PROVIDER_FAILED', 'Richiesta Session Compass non completata.');
    } finally {
      clearTimeout(timer);
    }
    return assembleSessionCompassReport(parsedContent(response), input, this);
  }
}

/**
 * Legge configurazione server-only. Per l'MVP impostare
 * `AI_NOTES_COMPASS_MODEL=gpt-5-mini`; il dominio non ha un default di modello.
 */
export function openAiSessionCompassProviderFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  client?: OpenAiCompassClient
): OpenAiSessionCompassReportProvider {
  return new OpenAiSessionCompassReportProvider({
    apiKey: environment.OPENAI_API_KEY?.trim() ?? '',
    model: environment.AI_NOTES_COMPASS_MODEL?.trim() ?? '',
    promptVersion: environment.AI_NOTES_COMPASS_PROMPT_VERSION?.trim() ?? '',
    client,
  });
}

function requestFor(
  input: SessionCompassGenerationInput,
  model: string,
  promptVersion: string
): OpenAiCompassRequest {
  return {
    model,
    instructions: systemInstructions(promptVersion),
    input: JSON.stringify(promptPayload(input)),
    store: false,
    text: {
      format: {
        type: 'json_schema',
        name: 'session_compass_v1',
        strict: true,
        schema: COMPASS_CONTENT_SCHEMA,
      },
    },
  };
}

function promptPayload(input: SessionCompassGenerationInput): Record<string, unknown> {
  return {
    sessionId: input.sessionId,
    language: input.language,
    coach: { name: input.context.coachName, role: input.context.coachRole },
    athlete: { sport: input.context.athleteSport },
    pathGoal: input.context.pathGoal,
    previousApprovedReports: input.context.previousApprovedReports.slice(0, 2),
    transcript: input.segments.map((segment) => ({
      transcriptSegmentId: segment.transcriptSegmentId,
      speaker: segment.speaker,
      minute: minuteFromMs(segment.startMs),
      text: segment.text,
    })),
  };
}

function systemInstructions(promptVersion: string): string {
  return `Prompt version: ${promptVersion}
Prepari "Session Compass", un report post-sessione riservato al coach mentale sportivo. Non è visibile all'atleta.
Non sei uno psicologo né un medico. Non fare diagnosi, non proporre trattamenti, non produrre punteggi o indicatori psicologici numerici.
Non presentare mai una relazione causale come un fatto. Non scrivere frasi come "l'infortunio è causato da". Usa un linguaggio prudente: "emerge", "l'atleta riferisce", "possibile associazione da approfondire".
Usa esclusivamente il transcript fornito e il contesto fornito. Non inventare contenuti, nomi, date o citazioni.
Ogni elemento deve citare un'evidenza: transcriptSegmentId presente nel transcript e quote copiata alla lettera da quel segmento (massimo ${MAX_QUOTE_LENGTH} caratteri). Se non trovi un'evidenza sufficiente, ometti l'elemento invece di inventarlo.
sessionOverview.summary: sintesi concisa e neutra. themes: da 2 a ${MAX_THEMES} temi principali emersi. emergingResource: una sola risorsa o leva emersa, oppure null se non supportata.
keyMoments: massimo ${MAX_KEY_MOMENTS} momenti significativi, con titolo, spiegazione prudente e lo speaker del segmento citato.
commitments: solo azioni concrete effettivamente concordate, con owner "coach" oppure "athlete". Indica dueDate (YYYY-MM-DD) solo se la scadenza è detta esplicitamente, altrimenti null.
nextSessionPrep: massimo ${MAX_NEXT_SESSION_PREP} punti che il coach può verificare o esplorare alla prossima sessione, derivati da temi, impegni o incertezze emerse. Nessun consiglio clinico generico.
Rispondi nella lingua indicata da language. Restituisci solo il contenuto strutturato richiesto.`;
}

function parsedContent(response: OpenAiCompassResponse): RawCompassContent {
  const messages = response.output.filter((item) => item.type === 'message');
  const texts = messages
    .flatMap((message) => message.content ?? [])
    .filter((content) => content.type === 'output_text')
    .map((content) => content.text)
    .filter((text): text is string => typeof text === 'string');
  if (texts.length !== 1) {
    throw new OpenAiSessionCompassError('MALFORMED_OUTPUT', 'Risposta OpenAI priva di un unico output strutturato.');
  }
  let value: unknown;
  try {
    value = JSON.parse(texts[0]);
  } catch {
    throw new OpenAiSessionCompassError('MALFORMED_OUTPUT', 'Output OpenAI non è JSON valido.');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OpenAiSessionCompassError('MALFORMED_OUTPUT', 'Output OpenAI non ha la struttura richiesta.');
  }
  return value as RawCompassContent;
}

function evidenceSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['transcriptSegmentId', 'quote'],
    properties: {
      transcriptSegmentId: { type: 'integer' },
      quote: { type: 'string' },
    },
  };
}

const COMPASS_CONTENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['sessionOverview', 'keyMoments', 'commitments', 'nextSessionPrep'],
  properties: {
    sessionOverview: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'summaryEvidence', 'themes', 'emergingResource'],
      properties: {
        summary: { type: 'string' },
        summaryEvidence: { type: 'array', items: evidenceSchema() },
        themes: {
          type: 'array',
          maxItems: MAX_THEMES,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['text', 'evidence'],
            properties: { text: { type: 'string' }, evidence: evidenceSchema() },
          },
        },
        emergingResource: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['text', 'evidence'],
          properties: { text: { type: 'string' }, evidence: evidenceSchema() },
        },
      },
    },
    keyMoments: {
      type: 'array',
      maxItems: MAX_KEY_MOMENTS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'explanation', 'speaker', 'evidence'],
        properties: {
          title: { type: 'string' },
          explanation: { type: 'string' },
          speaker: { type: 'string', enum: ['coach', 'athlete'] },
          evidence: evidenceSchema(),
        },
      },
    },
    commitments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'owner', 'dueDate', 'evidence'],
        properties: {
          text: { type: 'string' },
          owner: { type: 'string', enum: ['coach', 'athlete'] },
          dueDate: { type: ['string', 'null'] },
          evidence: evidenceSchema(),
        },
      },
    },
    nextSessionPrep: {
      type: 'array',
      maxItems: MAX_NEXT_SESSION_PREP,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'origin', 'evidence'],
        properties: {
          text: { type: 'string' },
          origin: { type: 'string', enum: ['theme', 'commitment', 'open_question'] },
          evidence: evidenceSchema(),
        },
      },
    },
  },
};

function isCompassResponse(value: unknown): value is OpenAiCompassResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { output?: unknown }).output)
  );
}
