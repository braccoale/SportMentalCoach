import assert from 'node:assert/strict';
import test from 'node:test';
import { ConnectionQuality } from 'livekit-client';
import {
  KAIPAI_AUDIO_CAPTURE_DEFAULTS,
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
