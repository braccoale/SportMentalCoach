/**
 * Adapter OpenAI per Session Compass v1.
 *
 * Invia solo il transcript già normalizzato e il contesto lecito, chiede
 * output JSON strict e non costruisce mai da sé il contenuto: il montaggio e
 * la verifica delle evidenze restano nel modulo provider-neutro.
 */

import {
  KEY_MOMENT_CATEGORIES,
  MAX_EMOTIONAL_TREND_POINTS,
  MAX_KEY_MOMENTS,
  MAX_NEXT_SESSION_PREP,
  MAX_QUOTE_LENGTH,
  MAX_SESSION_METRICS,
  MAX_THEMES,
  METRIC_CONFIDENCE_LEVELS,
  CONVERSATION_TONE_KEYS,
  SESSION_METRIC_KEYS,
  minuteFromMs,
  MAX_MISSED_OPPORTUNITIES,
  MAX_NARRATIVE_BEATS,
} from './session-compass-contract';
import {
  assembleSessionCompassReport,
  type RawCompassContent,
  type SessionCompassGenerationInput,
  type SessionCompassReportProvider,
} from './session-compass-provider';
import type { SessionCompassReport } from './session-compass-contract';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
// Lascia margine alla funzione Vercel (60 s) per validare e persistere il
// report. Un timeout uguale a quello della function poteva interrompere il
// processo prima che il job venisse chiuso correttamente.
const DEFAULT_TIMEOUT_MS = 45_000;
export const SESSION_COMPASS_PROMPT_REVISION = 'coach-context-v5' as const;

export function effectiveSessionCompassPromptVersion(value: string): string {
  const base = value.trim();
  if (!base) return '';
  return base.endsWith(`:${SESSION_COMPASS_PROMPT_REVISION}`)
    ? base
    : `${base}:${SESSION_COMPASS_PROMPT_REVISION}`;
}

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
  reasoning: {
    effort: 'minimal';
  };
  max_output_tokens: number;
  text: {
    verbosity: 'low';
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
      throw new OpenAiSessionCompassError('PROVIDER_FAILED', 'Richiesta del riepilogo sessione non completata.');
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
        throw new OpenAiSessionCompassError('TIMEOUT', 'Richiesta del riepilogo sessione scaduta.');
      }
      if (error instanceof OpenAiSessionCompassError) throw error;
      throw new OpenAiSessionCompassError('PROVIDER_FAILED', 'Richiesta del riepilogo sessione non completata.');
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
    promptVersion: effectiveSessionCompassPromptVersion(
      environment.AI_NOTES_COMPASS_PROMPT_VERSION ?? ''
    ),
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
    // Session Compass è estrazione strutturata e verificabile, non richiede
    // una catena di ragionamento estesa. Ridurre l'effort abbatte la latenza
    // di gpt-5-mini senza eliminare schema strict o controlli sulle evidenze.
    reasoning: { effort: 'minimal' },
    max_output_tokens: 4_000,
    text: {
      verbosity: 'low',
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
    previousApprovedReports: input.context.previousApprovedReports.slice(0, 4),
    coachBookmarksMinutes: input.context.coachBookmarksMs.map(minuteFromMs),
    coachNotes: input.context.coachNotes.slice(0, 4),
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
Prepari un "Riepilogo sessione", un report post-sessione riservato al coach mentale sportivo. Non è visibile all'atleta.
Non sei uno psicologo né un medico. Non fare diagnosi e non proporre trattamenti. Le metriche richieste sono stime operative AI su scala 1–5, non misurazioni cliniche.
Non presentare mai una relazione causale come un fatto. Non scrivere frasi come "l'infortunio è causato da". Usa un linguaggio prudente: "emerge", "l'atleta riferisce", "possibile associazione da approfondire".
Usa esclusivamente il transcript fornito e il contesto fornito. Non inventare contenuti, nomi, date o citazioni.
Hai un contesto che un modello generico non ha: chi e' il coach, lo sport e l'obiettivo del percorso dell'atleta, i report approvati delle sedute precedenti, i minuti che il coach ha marcato dal vivo in "coachBookmarksMinutes" e le sue annotazioni in "coachNotes". Usalo.
I minuti marcati dal coach sono indizi su dove guardare: esaminali con attenzione quando cerchi momenti chiave e spunti rimasti aperti.
"coachNotes" serve solo a orientarti e puo' contenere fatti che la trascrizione non ha. Non citarlo mai come evidenza, non riportarlo come una tua osservazione e non ripetere le conclusioni del coach come se fossero tue: il coach deve poter confrontare la tua lettura con la sua, non ritrovarsi la propria restituita.
Quando i report precedenti mostrano un tema che ritorna, un impegno rimasto aperto o un cambiamento rispetto a prima, dillo esplicitamente e collega la seduta di oggi a quelle: e' cio' che rende utile un riepilogo dentro un percorso invece che isolato.
In "narrative" racconta la seduta in ordine cronologico, da 3 a ${MAX_NARRATIVE_BEATS} passaggi: come si e' aperta, cosa e' emerso, dove la conversazione ha girato, come si e' chiusa. Ogni passaggio ha un titolo breve (per esempio "L'apertura", "Il punto di svolta", "La chiusura") e due o tre frasi di testo scorrevole. E' un racconto, non un elenco: usa un linguaggio piano e prudente, senza gergo e senza termini diagnostici. Serve al coach per ricordare come e' andata senza rileggere la trascrizione.
In "missedOpportunities" elenca al massimo ${MAX_MISSED_OPPORTUNITIES} passaggi in cui l'ATLETA ha aperto uno spiraglio — una dichiarazione carica, un accenno a qualcosa di personale, un disagio nominato di sfuggita — e la conversazione è andata altrove senza approfondirlo. L'evidenza deve essere sempre una frase dell'atleta, mai del coach. In "followUp" scrivi la domanda da fare la prossima volta, formulata come domanda aperta: è materiale per la prossima seduta, non un giudizio su quella passata. Se non ne trovi, restituisci un elenco vuoto: inventarne una vale meno di zero.
Ogni elemento deve citare un'evidenza: transcriptSegmentId presente nel transcript e quote copiata alla lettera da quel segmento (massimo ${MAX_QUOTE_LENGTH} caratteri). Se non trovi un'evidenza sufficiente, ometti l'elemento invece di inventarlo.
sessionOverview.summary: sintesi concisa e neutra. themes: da 2 a ${MAX_THEMES} temi principali emersi. emergingResource: una sola risorsa o leva emersa, oppure null se non supportata.
sessionOverview.metrics: massimo ${MAX_SESSION_METRICS} metriche fra ${SESSION_METRIC_KEYS.join(', ')}. Inserisci una metrica solo quando una frase esplicita dell'atleta la sostiene; value è un intero 1–5 e confidence è low, medium o high. Un array vuoto è preferibile a una stima debole. Non dedurre un valore dall'assenza di parole.
sessionOverview.emotionalTrend: massimo ${MAX_EMOTIONAL_TREND_POINTS} punti ordinati nel tempo, value intero da -2 (forte difficoltà o tensione riferita) a +2 (forte risorsa o slancio riferito), label breve e prudente, sempre con evidenza. Non usare termini diagnostici.
sessionOverview.conversationTone: un solo tono linguistico dell'atleta fra ${CONVERSATION_TONE_KEYS.join(', ')}, oppure null. Descrivi soltanto ciò che emerge dalle sue parole e cita una sua frase. Non valutare l'intonazione della voce, la personalità, l'interesse, il coinvolgimento o il valore di una persona. Poche parole o silenzi non sono prova di scarso interesse.
keyMoments: massimo ${MAX_KEY_MOMENTS} momenti significativi, con titolo, spiegazione prudente, speaker, category fra ${KEY_MOMENT_CATEGORIES.join(', ')}, tema sintetico o null e relevance 1–3.
commitments: solo azioni concrete effettivamente concordate, con owner "coach" oppure "athlete". Indica dueDate (YYYY-MM-DD) solo se la scadenza è detta esplicitamente, altrimenti null.
nextSessionPrep: massimo ${MAX_NEXT_SESSION_PREP} punti che il coach può verificare o esplorare alla prossima sessione, derivati da temi, impegni o incertezze emerse. Nessun consiglio clinico generico.
La lingua è vincolante: se language è "it", ogni testo prodotto (sintesi, temi, titoli, spiegazioni, azioni e descrizioni) deve essere in italiano. Non tradurre solo le etichette e non alternare italiano e inglese. Applica lo stesso vincolo alla lingua indicata per ogni altro valore di language.
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
  required: ['sessionOverview', 'narrative', 'keyMoments', 'missedOpportunities', 'commitments', 'nextSessionPrep'],
  properties: {
    sessionOverview: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'summaryEvidence', 'themes', 'emergingResource', 'metrics', 'emotionalTrend', 'conversationTone'],
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
        metrics: {
          type: 'array',
          maxItems: MAX_SESSION_METRICS,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['key', 'value', 'confidence', 'evidence'],
            properties: {
              key: { type: 'string', enum: [...SESSION_METRIC_KEYS] },
              value: { type: 'integer', minimum: 1, maximum: 5 },
              confidence: { type: 'string', enum: [...METRIC_CONFIDENCE_LEVELS] },
              evidence: evidenceSchema(),
            },
          },
        },
        emotionalTrend: {
          type: 'array',
          maxItems: MAX_EMOTIONAL_TREND_POINTS,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['value', 'label', 'evidence'],
            properties: {
              value: { type: 'integer', minimum: -2, maximum: 2 },
              label: { type: 'string' },
              evidence: evidenceSchema(),
            },
          },
        },
        conversationTone: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['key', 'description', 'confidence', 'evidence'],
          properties: {
            key: { type: 'string', enum: [...CONVERSATION_TONE_KEYS] },
            description: { type: 'string' },
            confidence: { type: 'string', enum: [...METRIC_CONFIDENCE_LEVELS] },
            evidence: evidenceSchema(),
          },
        },
      },
    },
    narrative: {
      type: 'array',
      maxItems: MAX_NARRATIVE_BEATS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'text', 'evidence'],
        properties: {
          title: { type: 'string' },
          text: { type: 'string' },
          evidence: evidenceSchema(),
        },
      },
    },
    missedOpportunities: {
      type: 'array',
      maxItems: MAX_MISSED_OPPORTUNITIES,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'followUp', 'evidence'],
        properties: {
          text: { type: 'string' },
          followUp: { type: 'string' },
          evidence: evidenceSchema(),
        },
      },
    },
    keyMoments: {
      type: 'array',
      maxItems: MAX_KEY_MOMENTS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'explanation', 'speaker', 'category', 'theme', 'relevance', 'evidence'],
        properties: {
          title: { type: 'string' },
          explanation: { type: 'string' },
          speaker: { type: 'string', enum: ['coach', 'athlete'] },
          category: { type: 'string', enum: [...KEY_MOMENT_CATEGORIES] },
          theme: { type: ['string', 'null'] },
          relevance: { type: 'integer', minimum: 1, maximum: 3 },
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
