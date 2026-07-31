import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DisabledSessionReportProvider,
  DisabledSpeechToTextProvider,
  DeepgramNova3SpeechToTextProvider,
  getSessionReportProvider,
  getSpeechToTextProvider,
} from './providers';
import { AiNotesProcessingError } from './processing-policy';

test('disabled provider registries never select an external implementation', () => {
  assert.equal(getSpeechToTextProvider().name, 'disabled');
  assert.equal(getSessionReportProvider().name, 'disabled');
});

test('Deepgram adapter maps utterances without exposing its response shape', async () => {
  const provider = new DeepgramNova3SpeechToTextProvider(
    'test-key',
    1_000,
    async () => new Response(JSON.stringify({
      metadata: { request_id: 'request-1' },
      results: { utterances: [{ start: 0, end: 1.25, transcript: ' Ciao mondo. ', confidence: 0.93 }] },
    }), { status: 200 })
  );
  const result = await provider.transcribe({ sessionId: 1, participantRecordingId: 2, physicalSegmentId: 3, audio: new Uint8Array([1]), mimeType: 'audio/ogg', language: 'it', model: 'nova-3' });
  assert.deepEqual(result, { providerOperationId: 'request-1', model: 'nova-3', segments: [{ startMs: 0, endMs: 1250, text: 'Ciao mondo.', confidence: 0.93, providerSegmentId: '3:0' }] });
});

test('Deepgram adapter classifies rate limits and malformed responses', async () => {
  const rateLimited = new DeepgramNova3SpeechToTextProvider('test-key', 1_000, async () => new Response('', { status: 429 }));
  const input = { sessionId: 1, participantRecordingId: 2, physicalSegmentId: 3, audio: new Uint8Array([1]), mimeType: 'audio/ogg' as const, language: 'it', model: 'nova-3' };
  await assert.rejects(() => rateLimited.transcribe(input), (error: unknown) => error instanceof AiNotesProcessingError && error.code === 'PROVIDER_RATE_LIMITED');
  const malformed = new DeepgramNova3SpeechToTextProvider('test-key', 1_000, async () => new Response('{}', { status: 200 }));
  await assert.rejects(() => malformed.transcribe(input), (error: unknown) => error instanceof AiNotesProcessingError && error.code === 'PROVIDER_BAD_RESPONSE');
});

test('disabled STT and report providers fail with typed configuration errors', async () => {
  await assert.rejects(
    () =>
      new DisabledSpeechToTextProvider().transcribe({
        sessionId: 1,
        participantRecordingId: 2,
        physicalSegmentId: 3,
        audio: new Uint8Array(),
        mimeType: 'audio/ogg',
        language: 'it',
        model: 'nova-3',
      }),
    (error: unknown) =>
      error instanceof AiNotesProcessingError &&
      error.code === 'PROVIDER_NOT_CONFIGURED'
  );
  await assert.rejects(
    () => new DisabledSessionReportProvider().generate({ sessionId: 1 }),
    (error: unknown) =>
      error instanceof AiNotesProcessingError &&
      error.code === 'PROVIDER_NOT_CONFIGURED'
  );
});
