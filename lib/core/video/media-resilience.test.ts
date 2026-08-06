import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { ConnectionState, Room, Track } from 'livekit-client';
import {
  isCameraLive,
  pauseCameraWhileHidden,
  restoreLocalMediaIfNeeded,
  type LocalMediaPreferences,
} from './media-resilience';

type FakeTrack = {
  mediaStreamTrack: {
    readyState: MediaStreamTrackState;
    enabled: boolean;
  };
  restartTrack: () => Promise<void>;
};

type FakePublication = {
  source: Track.Source;
  isMuted: boolean;
  track?: FakeTrack;
};

function createRoom({
  state = ConnectionState.Connected,
  camera,
  microphone,
}: {
  state?: ConnectionState;
  camera?: FakePublication;
  microphone?: FakePublication;
}) {
  const calls = {
    cameraEnabled: 0,
    microphoneEnabled: 0,
    cameraRestarted: 0,
    microphoneRestarted: 0,
  };
  const publications = new Map<Track.Source, FakePublication | undefined>([
    [Track.Source.Camera, camera],
    [Track.Source.Microphone, microphone],
  ]);
  for (const publication of publications.values()) {
    if (!publication?.track) continue;
    const counter =
      publication.source === Track.Source.Camera
        ? 'cameraRestarted'
        : 'microphoneRestarted';
    publication.track.restartTrack = async () => {
      calls[counter] += 1;
    };
  }

  const room = {
    state,
    localParticipant: {
      getTrackPublication(source: Track.Source) {
        return publications.get(source);
      },
      async setCameraEnabled(enabled: boolean) {
        if (enabled) calls.cameraEnabled += 1;
      },
      async setMicrophoneEnabled(enabled: boolean) {
        if (enabled) calls.microphoneEnabled += 1;
      },
    },
  } as unknown as Room;

  return { room, calls };
}

const wantsAllMedia: LocalMediaPreferences = {
  camera: true,
  microphone: true,
};

function healthyPublication(source: Track.Source): FakePublication {
  return {
    source,
    isMuted: false,
    track: {
      mediaStreamTrack: { readyState: 'live', enabled: true },
      restartTrack: async () => {},
    },
  };
}

test('healthy local media is left untouched', async () => {
  const { room, calls } = createRoom({
    camera: healthyPublication(Track.Source.Camera),
    microphone: healthyPublication(Track.Source.Microphone),
  });

  const restored = await restoreLocalMediaIfNeeded(room, wantsAllMedia);

  assert.deepEqual(restored, { camera: false, microphone: false });
  assert.deepEqual(calls, {
    cameraEnabled: 0,
    microphoneEnabled: 0,
    cameraRestarted: 0,
    microphoneRestarted: 0,
  });
});

test('missing and muted media is restored while connected', async () => {
  const microphone = healthyPublication(Track.Source.Microphone);
  microphone.isMuted = true;
  const { room, calls } = createRoom({ microphone });

  const restored = await restoreLocalMediaIfNeeded(room, wantsAllMedia);

  assert.deepEqual(restored, { camera: true, microphone: true });
  assert.equal(calls.cameraEnabled, 1);
  assert.equal(calls.microphoneEnabled, 1);
});

test('ended tracks restart in place', async () => {
  const camera = healthyPublication(Track.Source.Camera);
  const microphone = healthyPublication(Track.Source.Microphone);
  camera.track!.mediaStreamTrack.readyState = 'ended';
  microphone.track!.mediaStreamTrack.readyState = 'ended';
  const { room, calls } = createRoom({ camera, microphone });

  const restored = await restoreLocalMediaIfNeeded(room, wantsAllMedia);

  assert.deepEqual(restored, { camera: true, microphone: true });
  assert.equal(calls.cameraRestarted, 1);
  assert.equal(calls.microphoneRestarted, 1);
  assert.equal(calls.cameraEnabled, 0);
  assert.equal(calls.microphoneEnabled, 0);
});

test('user-disabled devices are never restored', async () => {
  const { room, calls } = createRoom({});

  const restored = await restoreLocalMediaIfNeeded(room, {
    camera: false,
    microphone: false,
  });

  assert.deepEqual(restored, { camera: false, microphone: false });
  assert.equal(calls.cameraEnabled, 0);
  assert.equal(calls.microphoneEnabled, 0);
});

test('media is not touched while the room is disconnected', async () => {
  const { room, calls } = createRoom({
    state: ConnectionState.Disconnected,
  });

  const restored = await restoreLocalMediaIfNeeded(room, wantsAllMedia);

  assert.deepEqual(restored, { camera: false, microphone: false });
  assert.equal(calls.cameraEnabled, 0);
  assert.equal(calls.microphoneEnabled, 0);
});

// --- Pausa della camera in secondo piano ------------------------------------

function fakeRoom(camera: { muted: boolean; hasTrack?: boolean } | null) {
  const mute = mock.fn(async () => {});
  const publication = camera
    ? {
        isMuted: camera.muted,
        track: camera.hasTrack === false ? undefined : { mute },
      }
    : undefined;
  return {
    mute,
    room: {
      state: ConnectionState.Connected,
      localParticipant: {
        getTrackPublication: (source: Track.Source) =>
          source === Track.Source.Camera ? publication : undefined,
      },
    } as unknown as Room,
  };
}

test('mette in muto la camera quando la pagina va in secondo piano', async () => {
  const { room, mute } = fakeRoom({ muted: false });
  assert.equal(await pauseCameraWhileHidden(room), true);
  assert.equal(mute.mock.callCount(), 1);
});

test('non tocca una camera che l’utente ha già spento', async () => {
  const { room, mute } = fakeRoom({ muted: true });
  assert.equal(await pauseCameraWhileHidden(room), false);
  assert.equal(mute.mock.callCount(), 0);
});

test('non fa nulla senza una traccia camera pubblicata', async () => {
  const { room, mute } = fakeRoom(null);
  assert.equal(await pauseCameraWhileHidden(room), false);
  assert.equal(mute.mock.callCount(), 0);
});

test('non fa nulla se la stanza non è connessa', async () => {
  const { room, mute } = fakeRoom({ muted: false });
  const disconnected = {
    ...room,
    state: ConnectionState.Disconnected,
  } as unknown as Room;
  assert.equal(await pauseCameraWhileHidden(disconnected), false);
  assert.equal(mute.mock.callCount(), 0);
});

// --- Stato reale della camera ------------------------------------------------

function roomWithCamera(
  camera:
    | { muted: boolean; readyState: MediaStreamTrackState; enabled: boolean }
    | null
) {
  const publication = camera
    ? {
        isMuted: camera.muted,
        track: {
          mediaStreamTrack: {
            readyState: camera.readyState,
            enabled: camera.enabled,
          },
        },
      }
    : undefined;
  return {
    localParticipant: {
      getTrackPublication: (source: Track.Source) =>
        source === Track.Source.Camera ? publication : undefined,
    },
  } as unknown as Room;
}

test('la camera è viva solo se pubblicata, non in muto, attiva e non terminata', () => {
  assert.equal(
    isCameraLive(
      roomWithCamera({ muted: false, readyState: 'live', enabled: true })
    ),
    true
  );
  assert.equal(
    isCameraLive(
      roomWithCamera({ muted: true, readyState: 'live', enabled: true })
    ),
    false
  );
  assert.equal(
    isCameraLive(
      roomWithCamera({ muted: false, readyState: 'ended', enabled: true })
    ),
    false
  );
  assert.equal(
    isCameraLive(
      roomWithCamera({ muted: false, readyState: 'live', enabled: false })
    ),
    false
  );
  assert.equal(isCameraLive(roomWithCamera(null)), false);
});
