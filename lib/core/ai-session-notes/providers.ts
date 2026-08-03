import { AiNotesProcessingError } from './processing-policy';

export type TranscriptionInput = {
  sessionId: number;
  participantRecordingId: number;
  physicalSegmentId: number;
  audio: Uint8Array;
  mimeType: 'audio/ogg';
  language: string;
  model: string;
};
export type TranscriptionSegment = { startMs: number; endMs: number; text: string; confidence?: number; providerSegmentId: string };
export type TranscriptionResult = { providerOperationId?: string; model: string; segments: TranscriptionSegment[] };
export type SessionReportInput = { sessionId: number };
export type SessionReportResult = { providerOperationId?: string };
export interface SpeechToTextProvider { transcribe(input: TranscriptionInput): Promise<TranscriptionResult> }
export interface SessionReportProvider { generate(input: SessionReportInput): Promise<SessionReportResult> }

export class DisabledSpeechToTextProvider implements SpeechToTextProvider {
  async transcribe(_input: TranscriptionInput): Promise<TranscriptionResult> {
    throw new AiNotesProcessingError('PROVIDER_NOT_CONFIGURED', 'Nessun provider Speech-to-Text è configurato.');
  }
}
export class DisabledSessionReportProvider implements SessionReportProvider {
  async generate(_input: SessionReportInput): Promise<SessionReportResult> {
    throw new AiNotesProcessingError('PROVIDER_NOT_CONFIGURED', 'Nessun provider report è configurato.');
  }
}

/** Deepgram pre-recorded `/v1/listen` adapter. No URL or credential is client-controlled. */
export class DeepgramNova3SpeechToTextProvider implements SpeechToTextProvider {
  constructor(private readonly apiKey: string, private readonly timeoutMs: number, private readonly fetcher: typeof fetch = fetch) {}
  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const query = new URLSearchParams({ model: input.model, language: input.language, smart_format: 'true', utterances: 'true', punctuate: 'true' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(`https://api.deepgram.com/v1/listen?${query}`, { method: 'POST', headers: { Authorization: `Token ${this.apiKey}`, 'Content-Type': input.mimeType }, body: input.audio, signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw new AiNotesProcessingError('PROVIDER_TIMEOUT', 'Provider STT non ha risposto in tempo.');
      throw new AiNotesProcessingError('TRANSCRIPTION_FAILED', 'Richiesta STT non completata.');
    } finally { clearTimeout(timer); }
    if (response.status === 401 || response.status === 403) throw new AiNotesProcessingError('PROVIDER_AUTH_FAILED', 'Autorizzazione provider STT non valida.');
    if (response.status === 429) throw new AiNotesProcessingError('PROVIDER_RATE_LIMITED', 'Provider STT temporaneamente limitato.');
    if (!response.ok) throw new AiNotesProcessingError('TRANSCRIPTION_FAILED', 'Provider STT non ha completato la trascrizione.');
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new AiNotesProcessingError('PROVIDER_BAD_RESPONSE', 'Risposta STT non valida.'); }
    const value = payload as { metadata?: { request_id?: unknown }; results?: { utterances?: unknown } };
    if (!Array.isArray(value.results?.utterances)) throw new AiNotesProcessingError('PROVIDER_BAD_RESPONSE', 'Risposta STT priva di segmenti.');
    const segments = value.results.utterances.flatMap((utterance, index) => {
      const row = utterance as Record<string, unknown>; const start = Number(row.start); const end = Number(row.end); const text = typeof row.transcript === 'string' ? row.transcript.trim() : '';
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || !text) return [];
      const confidence = Number(row.confidence);
      return [{ startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), text, confidence: Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : undefined, providerSegmentId: `${input.physicalSegmentId}:${index}` }];
    });
    return { providerOperationId: typeof value.metadata?.request_id === 'string' ? value.metadata.request_id : undefined, model: input.model, segments };
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
