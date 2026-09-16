import type {
  AudioCaptureOptions,
  TrackPublishDefaults,
  VideoPreset,
} from 'livekit-client';
import { ConnectionQuality, VideoPresets } from 'livekit-client';

export const KAIPAI_AUDIO_CAPTURE_DEFAULTS = {
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: true,
  voiceIsolation: true,
} satisfies AudioCaptureOptions;

/**
 * Con quanta banda si pubblica la voce.
 *
 * Il valore non è un dettaglio di qualità audio: è la dimensione del file che
 * finisce nello storage. L'egress di LiveKit registra la traccia **così come
 * arriva**, senza ricodificarla, quindi il bitrate scelto qui moltiplicato per
 * la durata della seduta è, byte più byte meno, il file `.ogg` da caricare.
 *
 * Lasciato al valore di fabbrica, `livekit-client` pubblica con
 * `AudioPresets.music` (48 kbps) e `red: true` — la ridondanza raddoppia il
 * payload. Sono ~96 kbps per una voce sola: la seduta 72 ha prodotto 40,4 MB
 * in 62 minuti, e la traccia dell'altro partecipante ha superato i 50 MB
 * consentiti dal bucket, tornando `413 EntityTooLarge`. Non si è persa
 * l'eccedenza: si è perso **tutto** il file, e con esso il riepilogo.
 *
 * 32 kbps è ampiamente trasparente per il parlato — Opus lo è già a 24 — e
 * lascia un margine di quattro volte rispetto al tetto, anche nel caso
 * peggiore dello stop di sicurezza a tre ore. `red` resta acceso: protegge la
 * conversazione dal vero, che è il mestiere principale della chiamata.
 */
export const KAIPAI_AUDIO_PUBLISH_PRESET = { maxBitrate: 32_000 };

/**
 * Il volume con cui si sente chi è dall'altra parte, non la propria voce
 * pubblicata: quella non cambia con questo controllo.
 *
 * `1` è il volume nativo del browser. Sopra `1` non esisterebbe senza
 * `webAudioMix` sulla `Room` (vedi video-room.tsx) — senza, `setVolume` di
 * livekit-client ricade su `elementVolume`, che lo spec dei media element
 * limita a `[0, 1]`. Con `webAudioMix` passa invece da un `GainNode`, che
 * *può* amplificare oltre l'ingresso originale: è la differenza fra "il
 * massimo che il sistema permetteva" e "più forte di quello".
 *
 * Il tetto a `2` (200%) non è arbitrario quanto sembra: oltre quel punto un
 * segnale già registrato a un livello normale inizia a distorcere in modo
 * udibile — non c'è più voce da amplificare, solo rumore. Il minimo resta
 * `0.5` apposta: il controllo serve ad alzare un audio troppo basso, non a
 * silenziare chi chiama — per quello c'è il mute del partecipante.
 */
export const REMOTE_VOLUME_STORAGE_KEY = 'kaipai-livekit-remote-volume';
export const DEFAULT_REMOTE_VOLUME = 1;
export const MIN_REMOTE_VOLUME = 0.5;
export const MAX_REMOTE_VOLUME = 2;

export function clampRemoteVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_REMOTE_VOLUME;
  return Math.min(MAX_REMOTE_VOLUME, Math.max(MIN_REMOTE_VOLUME, value));
}

let remoteVolumeBeepContext: AudioContext | null = null;
let remoteVolumeBeepBuffer: AudioBuffer | null = null;
let activeRemoteVolumeBeep: {
  source: AudioBufferSourceNode;
  gain: GainNode;
} | null = null;

/**
 * Il campione, sintetizzato una volta sola e riusato per ogni riscontro —
 * mai ricreato da zero a ogni trascinamento.
 *
 * Non il file audio vero di Windows: è di Microsoft, protetto da
 * copyright, e KaiPai è un prodotto distribuito pubblicamente —
 * incorporarlo sarebbe un problema di licenza reale, non un dettaglio
 * tecnico da aggirare (e comunque non esiste un'API browser per
 * richiamare un suono di sistema del sistema operativo).
 *
 * Quello che si può fare è imitarne la *sagoma* acustica: il vero suono
 * di cambio volume di Windows non è una melodia, è un "tick" secco e
 * cortissimo — poco più di un click, con una leggera discesa di
 * intonazione. Un primo tentativo qui era un accordo di due note a
 * 150ms, che suonava come un campanello, non come un tick di sistema —
 * per questo la durata scende a 45ms e la forma diventa un impulso che
 * scende di frequenza, non un tono sostenuto.
 */
function buildRemoteVolumeBeepBuffer(ctx: AudioContext): AudioBuffer {
  const duration = 0.045;
  const length = Math.round(duration * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const startFrequency = 1800;
  const endFrequency = 700;
  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate;
    const progress = t / duration;
    const frequency =
      startFrequency + (endFrequency - startFrequency) * progress;
    const envelope = Math.exp(-t * 140);
    const tone = Math.sin(2 * Math.PI * frequency * t);
    // Un filo di rumore dà consistenza da "click" fisico invece di un
    // tono puro, che suonerebbe elettronico anche a questa durata.
    const noise = (Math.random() * 2 - 1) * 0.12;
    data[i] = (tone * 0.88 + noise * 0.12) * envelope;
  }
  return buffer;
}

/**
 * Riscontro sonoro mentre si trascina lo slider "Volume di chi chiama",
 * non il suono di prova dell'altoparlante (quello resta fisso apposta —
 * verifica l'hardware, non il guadagno).
 *
 * Sempre lo stesso campione (vedi `buildRemoteVolumeBeepBuffer`), mai un
 * suono diverso per ogni livello: cambia solo il guadagno con cui viene
 * riprodotto, pari al valore stesso dello slider — 0.5 (50%, il minimo)
 * suona piano, 2 (200%, il massimo) suona forte, esattamente come il
 * riscontro di sistema quando si alza o abbassa un volume reale. A un
 * valore pari o sotto zero non suona nulla: è il caso "muto".
 *
 * Il trascinamento genera un trigger per ogni variazione, molti al
 * secondo: lasciarli accumulare produrrebbe decine di campioni accavallati
 * invece di un riscontro continuo. Non un throttle a tempo (che a scatti
 * salterebbe variazioni reali) — il campione precedente, se ancora in
 * corso, viene interrotto con una rampa di pochi millisecondi (evita il
 * click di uno stop secco) e sostituito subito dal nuovo.
 */
export function playRemoteVolumeFeedbackBeep(volume: number): void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
    return;
  }
  if (volume <= 0) return;
  try {
    const ctx = (remoteVolumeBeepContext ??= new AudioContext());
    if (ctx.state === 'suspended') void ctx.resume();
    const buffer = (remoteVolumeBeepBuffer ??= buildRemoteVolumeBeepBuffer(ctx));
    const now = ctx.currentTime;

    if (activeRemoteVolumeBeep) {
      const previous = activeRemoteVolumeBeep;
      activeRemoteVolumeBeep = null;
      previous.gain.gain.cancelScheduledValues(now);
      previous.gain.gain.setValueAtTime(previous.gain.gain.value, now);
      previous.gain.gain.linearRampToValueAtTime(0, now + 0.008);
      previous.source.stop(now + 0.01);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = clampRemoteVolume(volume);
    source.connect(gain);
    gain.connect(ctx.destination);
    const entry = { source, gain };
    activeRemoteVolumeBeep = entry;
    source.onended = () => {
      if (activeRemoteVolumeBeep === entry) activeRemoteVolumeBeep = null;
    };
    source.start(now);
  } catch {
    // Riscontro sonoro accessorio: se il browser lo rifiuta, lo slider
    // continua comunque a funzionare.
  }
}

export type VideoPublishSettings = {
  /** Cosa si chiede alla telecamera di catturare. */
  resolution: VideoPreset;
  /** Cosa si pubblica verso gli altri partecipanti. */
  publishDefaults: TrackPublishDefaults;
};

/**
 * Quanto video catturare e pubblicare, secondo il tipo di schermo.
 *
 * Su un telefono i 720p del desktop sono sprecati tre volte: la finestra in cui
 * l'altro appare è alta poche centinaia di pixel, la codifica scalda il
 * dispositivo (e un telefono caldo abbassa da solo il framerate, con l'utente
 * che vede scatti senza capirne il motivo), e la rete è quasi sempre mobile.
 * 360p a 24 fps sono più che sufficienti per un volto che parla.
 *
 * Anche i livelli simulcast scendono a due: pubblicarne tre significa
 * codificare tre volte lo stesso flusso, ed è proprio il costo che si sta
 * cercando di evitare.
 */
export function videoPublishSettings(compact: boolean): VideoPublishSettings {
  if (compact) {
    return {
      resolution: VideoPresets.h360,
      publishDefaults: {
        simulcast: true,
        videoSimulcastLayers: [VideoPresets.h180],
        videoCodec: 'vp8',
        audioPreset: KAIPAI_AUDIO_PUBLISH_PRESET,
      },
    };
  }
  return {
    resolution: VideoPresets.h720,
    publishDefaults: {
      simulcast: true,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      videoCodec: 'vp8',
      audioPreset: KAIPAI_AUDIO_PUBLISH_PRESET,
    },
  };
}

export type ConnectionQualityPresentation = {
  label: string;
  detail: string;
  tone: 'neutral' | 'good' | 'warning' | 'danger';
};

export function connectionQualityPresentation(
  quality: ConnectionQuality
): ConnectionQualityPresentation {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return {
        label: 'Connessione ottima',
        detail: 'Audio e video sono stabili.',
        tone: 'good',
      };
    case ConnectionQuality.Good:
      return {
        label: 'Connessione buona',
        detail: 'La qualità della chiamata è regolare.',
        tone: 'good',
      };
    case ConnectionQuality.Poor:
      return {
        label: 'Connessione instabile',
        detail:
          'Se audio o video scattano, prova a disattivare temporaneamente la camera.',
        tone: 'warning',
      };
    case ConnectionQuality.Lost:
      return {
        label: 'Connessione interrotta',
        detail: 'Tentativo di riconnessione in corso.',
        tone: 'danger',
      };
    default:
      return {
        label: 'Verifica connessione',
        detail: 'Stiamo misurando la qualità della rete.',
        tone: 'neutral',
      };
  }
}

export type NetworkDiagnosticStatus =
  | 'success'
  | 'warning'
  | 'failed'
  | 'unavailable';

export type NetworkDiagnosticSummary = {
  grade: 'good' | 'warning' | 'poor';
  label: string;
  detail: string;
};

export function summarizeNetworkDiagnostic(input: {
  online: boolean;
  websocket: NetworkDiagnosticStatus;
  webrtc: NetworkDiagnosticStatus;
  turn: NetworkDiagnosticStatus;
  effectiveType?: string;
  rttMs?: number;
  downlinkMbps?: number;
}): NetworkDiagnosticSummary {
  if (
    !input.online ||
    input.websocket === 'failed' ||
    input.webrtc === 'failed'
  ) {
    return {
      grade: 'poor',
      label: 'Rete non pronta',
      detail:
        'La connessione video non è raggiungibile. Controlla rete, VPN o firewall e riprova.',
    };
  }

  const slowConnection =
    input.effectiveType === 'slow-2g' ||
    input.effectiveType === '2g' ||
    (typeof input.rttMs === 'number' && input.rttMs > 350) ||
    (typeof input.downlinkMbps === 'number' && input.downlinkMbps < 1.5);
  if (
    slowConnection ||
    input.turn === 'failed' ||
    input.websocket === 'warning' ||
    input.webrtc === 'warning'
  ) {
    return {
      grade: 'warning',
      label: 'Rete utilizzabile con cautela',
      detail:
        'La chiamata può funzionare, ma in caso di scatti disattiva temporaneamente la videocamera.',
    };
  }

  return {
    grade: 'good',
    label: 'Rete pronta',
    detail: 'LiveKit e il percorso WebRTC sono raggiungibili.',
  };
}

export function mediaDeviceErrorMessage(error: Error): string {
  if (
    error.name === 'NotAllowedError' ||
    error.name === 'PermissionDeniedError'
  ) {
    return 'Consenti l’accesso a microfono e camera nelle impostazioni del browser.';
  }
  if (
    error.name === 'NotFoundError' ||
    error.name === 'DevicesNotFoundError'
  ) {
    return 'Non è stato trovato un dispositivo compatibile.';
  }
  if (
    error.name === 'NotReadableError' ||
    error.name === 'TrackStartError'
  ) {
    return 'Il dispositivo è già utilizzato da un’altra applicazione.';
  }
  return 'Non è stato possibile avviare il dispositivo. Controlla le impostazioni del browser.';
}
