import assert from 'node:assert/strict';
import { DeepgramNova3SpeechToTextProvider } from '@/lib/core/ai-session-notes/providers';
import { buildTimeline } from '@/lib/core/ai-session-notes/timeline';

/**
 * Integrazione simulata del percorso di trascrizione: consegna al provider,
 * ingestione della callback, ricomposizione della timeline. Nessuna richiesta
 * di rete verso Deepgram, LiveKit o lo storage.
 */

let submissions = 0;
const provider = new DeepgramNova3SpeechToTextProvider(
  'mock-only',
  1_000,
  (async (url: string, init: RequestInit) => {
    assert.match(String(url), /^https:\/\/api\.deepgram\.com\/v1\/listen\?/);
    // Il corpo e' un riferimento all'audio, non l'audio.
    assert.deepEqual(JSON.parse(String(init.body)), {
      url: `https://storage.invalid/segment-${submissions + 1}.ogg`,
    });
    assert.match(String(url), /callback=/);
    submissions += 1;
    return new Response(JSON.stringify({ request_id: `mock-${submissions}` }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch
);

function callbackPayload(requestId: string, transcript: string): unknown {
  return {
    metadata: { request_id: requestId },
    results: {
      utterances: [
        { start: 0, end: 1, transcript, confidence: 0.9 },
      ],
    },
  };
}

async function main() {
  const coachSubmission = await provider.submit({
    audioUrl: 'https://storage.invalid/segment-1.ogg',
    callbackUrl: 'https://app.invalid/api/internal/ai-notes/stt-callback/a'.padEnd(
      70,
      'a'
    ),
    language: 'it',
    model: 'nova-3',
  });
  const athleteSubmission = await provider.submit({
    audioUrl: 'https://storage.invalid/segment-2.ogg',
    callbackUrl: 'https://app.invalid/api/internal/ai-notes/stt-callback/b'.padEnd(
      70,
      'b'
    ),
    language: 'it',
    model: 'nova-3',
  });
  assert.equal(coachSubmission.providerRequestId, 'mock-1');
  assert.equal(athleteSubmission.providerRequestId, 'mock-2');

  const coach = provider.parseCallback(
    callbackPayload('mock-1', 'Ciao coach'),
    1
  );
  const athlete = provider.parseCallback(
    callbackPayload('mock-2', 'Ciao atleta'),
    2
  );

  const timeline = buildTimeline([
    { id: 1, participantRecordingId: 1, participantUserId: 1, participantRole: 'coach' as const, participantSequence: 0, startMs: 0, endMs: 1000, text: coach.segments[0].text, provider: 'deepgram', model: coach.model },
    { id: 2, participantRecordingId: 2, participantUserId: 2, participantRole: 'athlete' as const, participantSequence: 0, startMs: 500, endMs: 1500, text: athlete.segments[0].text, provider: 'deepgram', model: athlete.model },
  ]);

  assert.equal(submissions, 2);
  assert.equal(timeline.segments.length, 2);
  assert.equal(timeline.segments[1].flags.overlaps_previous, true);
  console.log(
    'AI_SESSION_NOTES mocked integration: OK (no storage, LiveKit, or Deepgram network request)'
  );
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
