import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DisabledSessionReportProvider,
  DisabledSpeechToTextProvider,
  DeepgramNova3SpeechToTextProvider,
  getSessionReportProvider,
  getSpeechToTextProvider,
  parseDeepgramUtterances,
} from './providers';
import { AiNotesProcessingError } from './processing-policy';

const SUBMIT_INPUT = {
  audioUrl: 'https://storage.invalid/a.ogg',
  callbackUrl: 'https://app.invalid/api/internal/ai-notes/stt-callback/tok',
  language: 'it',
  model: 'nova-3',
};

function jsonResponder(body: unknown, status = 200) {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

test('disabled provider registries never select an external implementation', () => {
  assert.equal(getSpeechToTextProvider().name, 'disabled');
  assert.equal(getSessionReportProvider().name, 'disabled');
});

test('il parsing della callback estrae le utterance valide', () => {
  const result = parseDeepgramUtterances(
    {
      metadata: { request_id: 'request-1' },
      results: {
        utterances: [
          { start: 0, end: 1.25, transcript: ' Ciao mondo. ', confidence: 0.93 },
          { start: 4, end: 5, transcript: '   ', confidence: 0.8 },
          { start: 9, end: 8, transcript: 'invertito' },
        ],
      },
    },
    3
  );

  assert.equal(result.providerOperationId, 'request-1');
  assert.deepEqual(result.segments, [
    {
      startMs: 0,
      endMs: 1250,
      text: 'Ciao mondo.',
      confidence: 0.93,
      providerSegmentId: '3:0',
    },
  ]);
});

test('una callback priva di utterance viene rifiutata', () => {
  assert.throws(
    () => parseDeepgramUtterances({ results: {} }, 1),
    (error: unknown) =>
      error instanceof AiNotesProcessingError &&
      error.code === 'PROVIDER_BAD_RESPONSE'
  );
});

test('submit consegna audio e callback e restituisce il request id', async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const provider = new DeepgramNova3SpeechToTextProvider(
    'test-key',
    1_000,
    (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: String(init.body) });
      return new Response(JSON.stringify({ request_id: 'request-42' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch
  );

  const submission = await provider.submit(SUBMIT_INPUT);

  assert.equal(submission.providerRequestId, 'request-42');
  assert.ok(calls[0].url.includes('model=nova-3'));
  assert.ok(
    calls[0].url.includes(
      `callback=${encodeURIComponent(SUBMIT_INPUT.callbackUrl)}`
    )
  );
  // I byte dell'audio non passano mai da noi: al provider va un riferimento.
  assert.deepEqual(JSON.parse(calls[0].body), {
    url: SUBMIT_INPUT.audioUrl,
  });
});

test('submit senza request id fallisce invece di fingere successo', async () => {
  const provider = new DeepgramNova3SpeechToTextProvider(
    'test-key',
    1_000,
    jsonResponder({})
  );

  await assert.rejects(
    () => provider.submit(SUBMIT_INPUT),
    (error: unknown) =>
      error instanceof AiNotesProcessingError &&
      error.code === 'PROVIDER_BAD_RESPONSE'
  );
});

test('submit classifica limiti di frequenza e autorizzazione', async () => {
  const rateLimited = new DeepgramNova3SpeechToTextProvider(
    'test-key',
    1_000,
    jsonResponder({}, 429)
  );
  await assert.rejects(
    () => rateLimited.submit(SUBMIT_INPUT),
    (error: unknown) =>
      error instanceof AiNotesProcessingError &&
      error.code === 'PROVIDER_RATE_LIMITED'
  );

  const unauthorized = new DeepgramNova3SpeechToTextProvider(
    'test-key',
    1_000,
    jsonResponder({}, 401)
  );
  await assert.rejects(
    () => unauthorized.submit(SUBMIT_INPUT),
    (error: unknown) =>
      error instanceof AiNotesProcessingError &&
      error.code === 'PROVIDER_AUTH_FAILED'
  );
});

test('disabled STT and report providers fail with typed configuration errors', async () => {
  await assert.rejects(
    () => new DisabledSpeechToTextProvider().submit(SUBMIT_INPUT),
    (error: unknown) =>
      error instanceof AiNotesProcessingError &&
      error.code === 'PROVIDER_NOT_CONFIGURED'
  );
  assert.throws(
    () => new DisabledSpeechToTextProvider().parseCallback({}, 1),
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

/**
 * La rinuncia al programma di miglioramento dei modelli di Deepgram.
 *
 * Non è un dettaglio di configurazione: la partecipazione è il comportamento
 * predefinito, e senza questo parametro l'audio di una seduta e la sua
 * trascrizione rientrano fra i dati che il fornitore può conservare e usare per
 * addestrare i propri modelli.
 *
 * L'informativa privacy dichiara agli utenti il contrario. Questo test esiste
 * perché quella frase resti vera anche fra due anni: toglierlo dalla query non
 * romperebbe niente e non darebbe nessun errore — si vedrebbe solo qui.
 */
test('la trascrizione rinuncia all’addestramento dei modelli del fornitore', async () => {
  const calls: string[] = [];
  const provider = new DeepgramNova3SpeechToTextProvider(
    'test-key',
    1_000,
    (async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ request_id: 'request-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch
  );

  await provider.submit(SUBMIT_INPUT);

  assert.ok(
    calls[0].includes('mip_opt_out=true'),
    'la richiesta deve rinunciare al programma di miglioramento dei modelli'
  );
});
