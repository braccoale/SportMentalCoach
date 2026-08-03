import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateRecordingState,
  isEmptyRecordingMutationBody,
  isRecordingStoppable,
  isWebhookTimestampAcceptable,
  verifyRoomForTrackEgress,
} from './recording-policy';

const expected = [
  { userId: 11, role: 'coach' as const, identity: 'user-11' },
  { userId: 22, role: 'athlete' as const, identity: 'user-22' },
];
const microphone = (sid: string) => ({
  sid,
  type: 'audio',
  source: 'microphone',
});

test('verifies exactly the two booking identities and their microphone tracks', () => {
  const result = verifyRoomForTrackEgress(
    [
      { identity: 'user-11', tracks: [microphone('TR_coach')] },
      { identity: 'user-22', tracks: [microphone('TR_athlete')] },
    ],
    expected
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(
      result.microphones.map((track) => track.trackSid),
      ['TR_coach', 'TR_athlete']
    );
  }
});

test('blocks guests, unknown users, bots and service participants', () => {
  for (const identity of [
    'guest-random',
    'user-999',
    'agent-helper',
    'egress-service',
  ]) {
    const result = verifyRoomForTrackEgress(
      [
        { identity: 'user-11', tracks: [microphone('TR_coach')] },
        { identity: 'user-22', tracks: [microphone('TR_athlete')] },
        { identity, tracks: [] },
      ],
      expected
    );
    assert.deepEqual(result, {
      ok: false,
      code: 'UNVERIFIED_PARTICIPANT_PRESENT',
    });
  }
});

test('requires both participants and both microphone tracks', () => {
  assert.deepEqual(
    verifyRoomForTrackEgress(
      [{ identity: 'user-11', tracks: [microphone('TR_coach')] }],
      expected
    ),
    { ok: false, code: 'REQUIRED_PARTICIPANT_MISSING' }
  );
  assert.deepEqual(
    verifyRoomForTrackEgress(
      [
        { identity: 'user-11', tracks: [microphone('TR_coach')] },
        {
          identity: 'user-22',
          tracks: [{ sid: 'TR_camera', type: 'video', source: 'camera' }],
        },
      ],
      expected
    ),
    { ok: false, code: 'REQUIRED_AUDIO_TRACK_MISSING' }
  );
});

test('webhook time window accepts retries but rejects stale and future replay', () => {
  const now = new Date('2026-07-30T12:00:00Z');
  assert.equal(
    isWebhookTimestampAcceptable({
      createdAt: new Date('2026-07-30T11:00:00Z'),
      now,
      maxAgeSeconds: 86_400,
    }),
    true
  );
  assert.equal(
    isWebhookTimestampAcceptable({
      createdAt: new Date('2026-07-28T12:00:00Z'),
      now,
      maxAgeSeconds: 86_400,
    }),
    false
  );
  assert.equal(
    isWebhookTimestampAcceptable({
      createdAt: new Date('2026-07-30T12:06:00Z'),
      now,
      maxAgeSeconds: 86_400,
    }),
    false
  );
});

test('only non-terminal recordings are stoppable', () => {
  assert.equal(isRecordingStoppable('starting'), true);
  assert.equal(isRecordingStoppable('recording'), true);
  assert.equal(isRecordingStoppable('stopping'), false);
  assert.equal(isRecordingStoppable('recorded'), false);
});

test('partial track failure remains visible in the aggregate state', () => {
  assert.equal(
    aggregateRecordingState(['recorded', 'failed']),
    'failed'
  );
  assert.equal(
    aggregateRecordingState(['recording', 'recording']),
    'recording'
  );
  assert.equal(aggregateRecordingState([]), 'not_started');
});

test('client cannot select room, track, user, bucket or object key', () => {
  assert.equal(isEmptyRecordingMutationBody(''), true);
  assert.equal(isEmptyRecordingMutationBody('{}'), true);
  for (const body of [
    '{"trackSid":"TR_attacker"}',
    '{"roomName":"booking-999"}',
    '{"userId":999}',
    '{"bucket":"public"}',
    '{"storageObjectKey":"chosen.ogg"}',
    'not-json',
  ]) {
    assert.equal(isEmptyRecordingMutationBody(body), false);
  }
});
