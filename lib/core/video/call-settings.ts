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
      },
    };
  }
  return {
    resolution: VideoPresets.h720,
    publishDefaults: {
      simulcast: true,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      videoCodec: 'vp8',
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
