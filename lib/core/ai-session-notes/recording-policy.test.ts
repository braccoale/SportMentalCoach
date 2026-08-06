import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PARTICIPANT_KIND_EGRESS,
  PARTICIPANT_KIND_STANDARD,
  aggregateRecordingState,
  isIntruderParticipant,
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

// --- Il registratore non è un intruso ----------------------------------------

const PARTICIPANTS = ['user-11', 'user-22'];

test('un partecipante non previsto resta un intruso', () => {
  assert.equal(
    isIntruderParticipant({
      identity: 'user-99',
      kind: PARTICIPANT_KIND_STANDARD,
      expectedIdentities: PARTICIPANTS,
      recordingInProgress: true,
    }),
    true
  );
});

test('i due partecipanti attesi non sono mai intrusi', () => {
  for (const identity of PARTICIPANTS) {
    assert.equal(
      isIntruderParticipant({
        identity,
        kind: PARTICIPANT_KIND_STANDARD,
        expectedIdentities: PARTICIPANTS,
        recordingInProgress: true,
      }),
      false
    );
  }
});

test('l’egress che stiamo avviando non è un intruso', () => {
  // È il caso reale: LiveKit fa entrare la registrazione in stanza come
  // partecipante, con un'identità che non è né il coach né l'atleta. Senza
  // questa eccezione la guardia ferma la registrazione che ha appena avviato.
  assert.equal(
    isIntruderParticipant({
      identity: 'b84102dc9d56a753943eea91dabe3050',
      kind: PARTICIPANT_KIND_EGRESS,
      expectedIdentities: PARTICIPANTS,
      recordingInProgress: true,
    }),
    false
  );
});

test('un egress che non abbiamo avviato resta un intruso', () => {
  // Senza registrazioni in corso nessuno ha titolo per registrare: un egress
  // che compare lì è esattamente ciò da cui la guardia deve proteggere.
  assert.equal(
    isIntruderParticipant({
      identity: 'EG_qualcosa',
      kind: PARTICIPANT_KIND_EGRESS,
      expectedIdentities: PARTICIPANTS,
      recordingInProgress: false,
    }),
    true
  );
});

test('gli altri partecipanti di servizio non sono esentati', () => {
  // Ingress, SIP e agent non li avviamo noi: restano intrusi.
  for (const kind of [1, 3, 4]) {
    assert.equal(
      isIntruderParticipant({
        identity: 'servizio-x',
        kind,
        expectedIdentities: PARTICIPANTS,
        recordingInProgress: true,
      }),
      true
    );
  }
});

test('la verifica della stanza ignora gli egress in corso', () => {
  const result = verifyRoomForTrackEgress(
    [
      { identity: 'user-11', tracks: [microphone('TR_a')] },
      { identity: 'user-22', tracks: [microphone('TR_b')] },
      { identity: 'egress-in-corso', kind: PARTICIPANT_KIND_EGRESS, tracks: [] },
    ],
    expected,
    { recordingInProgress: true }
  );
  assert.equal(result.ok, true);
});

test('senza registrazioni in corso un egress in stanza blocca la verifica', () => {
  const result = verifyRoomForTrackEgress(
    [
      { identity: 'user-11', tracks: [microphone('TR_a')] },
      { identity: 'user-22', tracks: [microphone('TR_b')] },
      { identity: 'egress-estraneo', kind: PARTICIPANT_KIND_EGRESS, tracks: [] },
    ],
    expected
  );
  assert.equal(result.ok, false);
  assert.equal(
    result.ok === false && result.code,
    'UNVERIFIED_PARTICIPANT_PRESENT'
  );
});

test('una ripresa in corso conta più di un segmento fallito prima', () => {
  // Con i riavvii un segmento fallito resta nello storico per sempre: se
  // vincesse lui, l'utente vedrebbe "errore" mentre sta registrando.
  assert.equal(
    aggregateRecordingState(['failed', 'recording']),
    'recording'
  );
  assert.equal(
    aggregateRecordingState(['recorded', 'failed', 'starting']),
    'starting'
  );
  // Senza nulla in corso, l'errore resta l'informazione che conta.
  assert.equal(aggregateRecordingState(['recorded', 'failed']), 'failed');
});
