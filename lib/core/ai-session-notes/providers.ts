import { AiNotesProcessingError } from './processing-policy';

export type TranscriptionSegment = { startMs: number; endMs: number; text: string; confidence?: number; providerSegmentId: string };
export type TranscriptionResult = { providerOperationId?: string; model: string; segments: TranscriptionSegment[] };

/** Ciò che serve al provider per andare a prendersi l'audio da solo. */
export type TranscriptionSubmitInput = {
  audioUrl: string;
  callbackUrl: string;
  language: string;
  model: string;
};
export type TranscriptionSubmission = { providerRequestId: string };

export type SessionReportInput = { sessionId: number };
export type SessionReportResult = { providerOperationId?: string };

/**
 * Il provider consegna il lavoro e se ne va; i risultati arrivano più tardi
 * sulla callback.
 *
 * Non esiste più un metodo che attende la trascrizione: era quell'attesa,
 * dentro una function con un tetto di sessanta secondi, a rendere
 * impossibili le sessioni lunghe. Un file da due ore non stava in quel
 * budget e falliva sempre, esaurendo i tentativi.
 */
export interface SpeechToTextProvider {
  submit(input: TranscriptionSubmitInput): Promise<TranscriptionSubmission>;
  parseCallback(payload: unknown, physicalSegmentId: number): TranscriptionResult;
}
export interface SessionReportProvider { generate(input: SessionReportInput): Promise<SessionReportResult> }

export class DisabledSpeechToTextProvider implements SpeechToTextProvider {
  async submit(_input: TranscriptionSubmitInput): Promise<TranscriptionSubmission> {
    throw new AiNotesProcessingError('PROVIDER_NOT_CONFIGURED', 'Nessun provider Speech-to-Text è configurato.');
  }
  parseCallback(_payload: unknown, _physicalSegmentId: number): TranscriptionResult {
    throw new AiNotesProcessingError('PROVIDER_NOT_CONFIGURED', 'Nessun provider Speech-to-Text è configurato.');
  }
}
export class DisabledSessionReportProvider implements SessionReportProvider {
  async generate(_input: SessionReportInput): Promise<SessionReportResult> {
    throw new AiNotesProcessingError('PROVIDER_NOT_CONFIGURED', 'Nessun provider report è configurato.');
  }
}

/**
 * Converte la risposta Deepgram in segmenti nostri.
 *
 * Pura e priva di rete: la callback la usa per ingerire i risultati, i test
 * per verificarli, senza che nessuno dei due debba parlare con Deepgram.
 */
export function parseDeepgramUtterances(
  payload: unknown,
  physicalSegmentId: number
): TranscriptionResult {
  const value = payload as {
    metadata?: { request_id?: unknown };
    results?: { utterances?: unknown };
  };
  if (!Array.isArray(value.results?.utterances)) {
    throw new AiNotesProcessingError('PROVIDER_BAD_RESPONSE', 'Risposta STT priva di segmenti.');
  }
  const segments = value.results.utterances.flatMap((utterance, index) => {
    const row = utterance as Record<string, unknown>;
    const start = Number(row.start);
    const end = Number(row.end);
    const text = typeof row.transcript === 'string' ? row.transcript.trim() : '';
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || !text) return [];
    const confidence = Number(row.confidence);
    return [{
      startMs: Math.round(start * 1000),
      endMs: Math.round(end * 1000),
      text,
      confidence: Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : undefined,
      providerSegmentId: `${physicalSegmentId}:${index}`,
    }];
  });
  return {
    providerOperationId: typeof value.metadata?.request_id === 'string' ? value.metadata.request_id : undefined,
    model: process.env.AI_NOTES_STT_MODEL?.trim() || 'nova-3',
    segments,
  };
}

/** Deepgram pre-recorded `/v1/listen` in modalità callback. Nessuna URL o credenziale è controllata dal client. */
export class DeepgramNova3SpeechToTextProvider implements SpeechToTextProvider {
  constructor(private readonly apiKey: string, private readonly timeoutMs: number, private readonly fetcher: typeof fetch = fetch) {}

  async submit(input: TranscriptionSubmitInput): Promise<TranscriptionSubmission> {
    const query = new URLSearchParams({
      model: input.model,
      language: input.language,
      smart_format: 'true',
      utterances: 'true',
      punctuate: 'true',
      callback: input.callbackUrl,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      // Il corpo è un riferimento, non l'audio: è il provider a scaricarlo.
      response = await this.fetcher(`https://api.deepgram.com/v1/listen?${query}`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: input.audioUrl }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw new AiNotesProcessingError('PROVIDER_TIMEOUT', 'Provider STT non ha risposto in tempo.');
      throw new AiNotesProcessingError('TRANSCRIPTION_FAILED', 'Richiesta STT non completata.');
    } finally { clearTimeout(timer); }

    if (response.status === 401 || response.status === 403) throw new AiNotesProcessingError('PROVIDER_AUTH_FAILED', 'Autorizzazione provider STT non valida.');
    if (response.status === 429) throw new AiNotesProcessingError('PROVIDER_RATE_LIMITED', 'Provider STT temporaneamente limitato.');
    if (!response.ok) throw new AiNotesProcessingError('TRANSCRIPTION_FAILED', 'Provider STT non ha accettato la richiesta.');

    let payload: unknown;
    try { payload = await response.json(); } catch { throw new AiNotesProcessingError('PROVIDER_BAD_RESPONSE', 'Risposta STT non valida.'); }
    const requestId = (payload as { request_id?: unknown }).request_id;
    if (typeof requestId !== 'string' || !requestId) {
      // Senza identificativo non potremmo riconoscere la callback: meglio
      // fallire subito che restare in attesa di una risposta non abbinabile.
      throw new AiNotesProcessingError('PROVIDER_BAD_RESPONSE', 'Risposta STT priva di identificativo.');
    }
    return { providerRequestId: requestId };
  }

  parseCallback(payload: unknown, physicalSegmentId: number): TranscriptionResult {
    return parseDeepgramUtterances(payload, physicalSegmentId);
  }
}

function sttTimeoutMs(): number { const value = Number(process.env.AI_NOTES_STT_TIMEOUT_MS ?? 60_000); return Number.isInteger(value) && value >= 5_000 && value <= 300_000 ? value : 60_000; }
export function getSpeechToTextProvider(): { name: 'disabled' | 'deepgram'; provider: SpeechToTextProvider } {
  const selected = process.env.AI_NOTES_STT_PROVIDER?.trim() || 'disabled';
  if (selected === 'deepgram') {
    const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
    return apiKey ? { name: 'deepgram', provider: new DeepgramNova3SpeechToTextProvider(apiKey, sttTimeoutMs()) } : { name: 'deepgram', provider: new DisabledSpeechToTextProvider() };
  }
  return { name: 'disabled', provider: new DisabledSpeechToTextProvider() };
}
export function getSessionReportProvider(): { name: 'disabled'; provider: SessionReportProvider } { return { name: 'disabled', provider: new DisabledSessionReportProvider() }; }
