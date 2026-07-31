import assert from 'node:assert/strict';
import { DeepgramNova3SpeechToTextProvider } from '@/lib/core/ai-session-notes/providers';
import { buildTimeline } from '@/lib/core/ai-session-notes/timeline';

let requests = 0;
const provider = new DeepgramNova3SpeechToTextProvider('mock-only', 1_000, async (url) => {
  assert.match(String(url), /^https:\/\/api\.deepgram\.com\/v1\/listen\?/);
  requests += 1;
  return new Response(JSON.stringify({ metadata: { request_id: `mock-${requests}` }, results: { utterances: [{ start: 0, end: 1, transcript: requests === 1 ? 'Ciao coach' : 'Ciao atleta', confidence: 0.9 }] } }), { status: 200 });
});
const input = (physicalSegmentId: number) => ({ sessionId: 1, participantRecordingId: physicalSegmentId, physicalSegmentId, audio: new Uint8Array([79,103,103,83]), mimeType: 'audio/ogg' as const, language: 'it', model: 'nova-3' });
async function main() {
const coach = await provider.transcribe(input(1)); const athlete = await provider.transcribe(input(2));
const timeline = buildTimeline([
  { id: 1, participantRecordingId: 1, participantUserId: 1, participantRole: 'coach' as const, participantSequence: 0, startMs: 0, endMs: 1000, text: coach.segments[0].text, provider: 'deepgram', model: coach.model },
  { id: 2, participantRecordingId: 2, participantUserId: 2, participantRole: 'athlete' as const, participantSequence: 0, startMs: 500, endMs: 1500, text: athlete.segments[0].text, provider: 'deepgram', model: athlete.model },
]);
assert.equal(requests, 2); assert.equal(timeline.segments.length, 2); assert.equal(timeline.segments[1].flags.overlaps_previous, true);
console.log('AI_SESSION_NOTES mocked integration: OK (no storage, LiveKit, or Deepgram network request)');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
