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

/*
 * Il guasto vero: la seduta del 16 agosto ha perso l'intera voce dell'atleta.
 * L'egress ha registrato un'ora a 91 kbps — il valore di fabbrica di
 * `livekit-client`, 48 kbps di preset `music` raddoppiati da `red` — e il
 * caricamento è morto con `413 EntityTooLarge` contro il limite di 50 MB del
 * bucket. Non si perde l'eccedenza: si perde tutto il file.
 *
 * Questo test è la soglia, scritta una volta. Se qualcuno toglie il preset o
 * lo alza, qui si vede prima che in una seduta vera.
 */
const STOP_DI_SICUREZZA_SECONDI = 3 * 60 * 60;

/*
 * Il tetto che il codice chiede per il bucket audio: il default di
 * `getAiNotesAudioMaxBytes` in `lib/core/ai-session-notes/recording-config.ts`.
 *
 * In produzione il bucket era fermo a 50 MB — Supabase non alza un bucket
 * sopra il limite globale del progetto e non lo dice — ed è il numero che ha
 * fatto fallire il caricamento. Abbassare il bitrate non bastava da solo: a
 * 32 kbps tre ore fanno comunque 82 MB. Questo test è il posto in cui quel
 * conto viene fatto invece che sperato.
 */
const LIMITE_BUCKET_BYTE = 128 * 1024 * 1024;

test('la voce si pubblica abbastanza leggera da stare nel bucket per tutta la seduta', () => {
  for (const compact of [true, false]) {
    const { publishDefaults } = videoPublishSettings(compact);
    const bitrate = publishDefaults.audioPreset?.maxBitrate;
    assert.ok(
      bitrate !== undefined,
      'senza preset esplicito valgono i 48 kbps di fabbrica, che con red diventano ~96'
    );

    // `red: true` è il default e resta acceso: la ridondanza raddoppia il
    // payload effettivo, e il conto va fatto sul caso peggiore, non sul
    // nominale.
    const byteAlSecondo = (bitrate * 2) / 8;
    const peggioreCaso = byteAlSecondo * STOP_DI_SICUREZZA_SECONDI;
    assert.ok(
      peggioreCaso < LIMITE_BUCKET_BYTE,
      `a ${bitrate / 1000} kbps una seduta al limite delle tre ore produrrebbe ` +
        `${Math.round(peggioreCaso / 1024 / 1024)} MB, oltre il tetto del bucket`
    );
  }
});
