/**
 * Con quanta banda l'app pubblica la voce.
 *
 * Gemello dichiarato di `KAIPAI_AUDIO_PUBLISH_PRESET` in
 * `lib/core/video/call-settings.ts`: i due valori devono restare uguali. Non
 * si importa quello del web perche' l'app non condivide il bundle, ma la
 * ragione e` la stessa e vale per entrambi i lati.
 *
 * L'egress di LiveKit registra la traccia cosi' come arriva, senza
 * ricodificarla: questo numero moltiplicato per la durata della seduta e` il
 * file che finisce nello storage. Lasciato al valore di fabbrica
 * (`AudioPresets.music`, 48 kbps, raddoppiati da `red`) una seduta di un'ora
 * supera i 40 MB, e il 16 agosto la traccia dell'atleta ha sfondato il limite
 * del bucket: caricamento fallito con `413`, file perso per intero, riepilogo
 * mai generato.
 *
 * 32 kbps sono trasparenti per il parlato e lasciano margine anche nel caso
 * peggiore dello stop di sicurezza a tre ore.
 */
export const KAIPAI_AUDIO_PUBLISH_PRESET = { maxBitrate: 32_000 };

/** Le opzioni di stanza con cui l'app entra in chiamata. */
export const KAIPAI_ROOM_OPTIONS = {
  publishDefaults: {
    audioPreset: KAIPAI_AUDIO_PUBLISH_PRESET,
  },
};
