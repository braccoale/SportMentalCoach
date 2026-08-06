import assert from 'node:assert/strict';
import test from 'node:test';
import { ConnectionQuality } from 'livekit-client';
import {
  KAIPAI_AUDIO_CAPTURE_DEFAULTS,
  videoPublishSettings,
  connectionQualityPresentation,
  mediaDeviceErrorMessage,
  summarizeNetworkDiagnostic,
} from './call-settings';

test('conference audio explicitly enables browser audio processing', () => {
  assert.deepEqual(KAIPAI_AUDIO_CAPTURE_DEFAULTS, {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
    voiceIsolation: true,
  });
});

test('poor connection quality produces an actionable Italian warning', () => {
  assert.deepEqual(
    connectionQualityPresentation(ConnectionQuality.Poor),
    {
      label: 'Connessione instabile',
      detail:
        'Se audio o video scattano, prova a disattivare temporaneamente la camera.',
      tone: 'warning',
    }
  );
});

test('media permission errors explain how to recover', () => {
  const error = new Error('Permission denied');
  error.name = 'NotAllowedError';

  assert.equal(
    mediaDeviceErrorMessage(error),
    'Consenti l’accesso a microfono e camera nelle impostazioni del browser.'
  );
});

test('pre-call diagnostics distinguish ready and blocked networks', () => {
  assert.equal(
    summarizeNetworkDiagnostic({
      online: true,
      websocket: 'success',
      webrtc: 'success',
      turn: 'success',
      effectiveType: '4g',
      rttMs: 45,
      downlinkMbps: 20,
    }).grade,
    'good'
  );
  assert.equal(
    summarizeNetworkDiagnostic({
      online: true,
      websocket: 'success',
      webrtc: 'failed',
      turn: 'unavailable',
    }).grade,
    'poor'
  );
});

test('su schermo compatto la cattura video è più leggera che su desktop', () => {
  const compact = videoPublishSettings(true);
  const desktop = videoPublishSettings(false);

  assert.ok(
    compact.resolution.height <= 360,
    'un telefono non deve catturare più di 360p'
  );
  assert.ok(desktop.resolution.height >= 540);
  assert.ok(
    (compact.resolution.encoding?.maxBitrate ?? 0) <
      (desktop.resolution.encoding?.maxBitrate ?? 0)
  );
  assert.ok(
    (compact.resolution.encoding?.maxFramerate ?? 99) <=
      (desktop.resolution.encoding?.maxFramerate ?? 99)
  );
});

test('il telefono pubblica meno livelli simulcast del desktop', () => {
  const compact = videoPublishSettings(true);
  const desktop = videoPublishSettings(false);
  assert.ok(
    (compact.publishDefaults.videoSimulcastLayers?.length ?? 0) <
      (desktop.publishDefaults.videoSimulcastLayers?.length ?? 0)
  );
  // Il livello più alto pubblicato non può superare ciò che si cattura.
  for (const layer of compact.publishDefaults.videoSimulcastLayers ?? []) {
    assert.ok(layer.height <= compact.resolution.height);
  }
});
