'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  usePersistentUserChoices,
  usePreviewTracks,
  type LocalUserChoices,
} from '@livekit/components-react';
import {
  CheckStatus,
  ConnectionCheck,
  Track,
  type LocalAudioTrack,
  type LocalVideoTrack,
} from 'livekit-client';
import {
  KAIPAI_AUDIO_CAPTURE_DEFAULTS,
  mediaDeviceErrorMessage,
  summarizeNetworkDiagnostic,
  type NetworkDiagnosticStatus,
  type NetworkDiagnosticSummary,
} from '@/lib/core/video/call-settings';
import { COMPACT_MEDIA_QUERY } from '@/lib/core/video/capabilities';
import type { TechnicalEventDetails } from '@/lib/core/video/technical-events';
import type { KaiPaiCallChoices } from '@/components/livekit-call-controls';

export const AUDIO_OUTPUT_STORAGE_KEY = 'kaipai-livekit-audio-output';

type AudioElementWithSink = HTMLAudioElement & {
  setSinkId?: (deviceId: string) => Promise<void>;
};

type BrowserNetworkInformation = {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
};

type NetworkNavigator = Navigator & {
  connection?: BrowserNetworkInformation;
};

export type NetworkDiagnosticResult = NetworkDiagnosticSummary & {
  websocket: NetworkDiagnosticStatus;
  webrtc: NetworkDiagnosticStatus;
  turn: NetworkDiagnosticStatus;
  durationMs: number;
  effectiveType?: string;
  rttMs?: number;
  downlinkMbps?: number;
};

export function supportsAudioOutputSelection(): boolean {
  return (
    typeof HTMLMediaElement !== 'undefined' &&
    'setSinkId' in HTMLMediaElement.prototype
  );
}

function diagnosticStatus(
  status: CheckStatus,
  hasWarnings: boolean
): NetworkDiagnosticStatus {
  if (status === CheckStatus.FAILED) return 'failed';
  if (status === CheckStatus.SKIPPED) return 'unavailable';
  if (status === CheckStatus.SUCCESS && hasWarnings) return 'warning';
  return status === CheckStatus.SUCCESS ? 'success' : 'unavailable';
}

function createSpeakerTestUrl(): string {
  const sampleRate = 44_100;
  const durationSeconds = 0.45;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, sampleCount * 2, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / sampleCount;
    const envelope = Math.min(1, progress * 14, (1 - progress) * 14);
    const sample =
      Math.sin((2 * Math.PI * 660 * index) / sampleRate) *
      envelope *
      0.22;
    view.setInt16(44 + index * 2, sample * 0x7fff, true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

export async function playSpeakerTest(deviceId: string): Promise<void> {
  const url = createSpeakerTestUrl();
  const audio = new Audio(url) as AudioElementWithSink;
  try {
    if (audio.setSinkId && deviceId) {
      await audio.setSinkId(deviceId);
    }
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () =>
        reject(new Error('Impossibile riprodurre il suono di prova.'));
      audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type PreJoinStateOptions = {
  participantName: string;
  serverUrl: string;
  preflightToken: string;
  onDiagnostic?: (details: TechnicalEventDetails) => void;
  onJoin: (choices: KaiPaiCallChoices) => void;
};

/** Lato del telefono da cui riprendere: frontale o posteriore. */
export type VideoFacingMode = 'user' | 'environment';

export type PreJoinState = {
  /**
   * Nome del partecipante deciso dall'app, non quello di `userChoices`: quel
   * campo viene fuso da LiveKit con un valore rimasto in `localStorage`, che
   * su un dispositivo condiviso può appartenere a un'altra persona.
   */
  participantName: string;
  userChoices: LocalUserChoices;
  saveAudioInputEnabled: (value: boolean) => void;
  saveVideoInputEnabled: (value: boolean) => void;
  saveAudioInputDeviceId: (deviceId: string) => void;
  saveVideoInputDeviceId: (deviceId: string) => void;
  audioTrack?: LocalAudioTrack;
  videoTrack?: LocalVideoTrack;
  previewError: string | null;
  outputSelectionSupported: boolean;
  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
  audioOutputDeviceId: string;
  audioOutputs: MediaDeviceInfo[];
  chooseAudioOutput: (deviceId: string) => void;
  speakerTestState: 'idle' | 'playing' | 'success' | 'error';
  testSpeaker: () => Promise<void>;
  networkState: 'idle' | 'checking' | 'complete';
  networkResult: NetworkDiagnosticResult | null;
  runNetworkDiagnostic: () => Promise<void>;
  join: () => void;
  flipCamera: () => void;
  /**
   * Lato del dispositivo richiesto per la camera, oppure `null` se non è mai
   * stato scelto (caso desktop, dove vale la selezione per dispositivo).
   */
  videoFacingMode: VideoFacingMode | null;
};

export function usePreJoinState({
  participantName,
  serverUrl,
  preflightToken,
  onDiagnostic,
  onJoin,
}: PreJoinStateOptions): PreJoinState {
  const {
    userChoices,
    saveAudioInputEnabled,
    saveVideoInputEnabled,
    saveAudioInputDeviceId,
    saveVideoInputDeviceId,
  } = usePersistentUserChoices({
    defaults: { username: participantName },
  });
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [speakerTestState, setSpeakerTestState] = useState<
    'idle' | 'playing' | 'success' | 'error'
  >('idle');
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState('default');
  // Su un telefono si parte sempre dalla frontale, e lo si chiede in modo
  // esplicito: lasciarlo decidere al browser significherebbe subire un
  // `videoDeviceId` rimasto in localStorage da una sessione precedente, che
  // può puntare alla posteriore. Su desktop resta `null`, dove comanda la
  // scelta per dispositivo. Calcolato in modo pigro al primo render client,
  // così non provoca un secondo avvio della sorgente.
  const [videoFacingMode, setVideoFacingMode] = useState<
    VideoFacingMode | null
  >(() =>
    typeof window !== 'undefined' &&
    window.matchMedia(COMPACT_MEDIA_QUERY).matches
      ? 'user'
      : null
  );
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [networkState, setNetworkState] = useState<
    'idle' | 'checking' | 'complete'
  >('idle');
  const [networkResult, setNetworkResult] =
    useState<NetworkDiagnosticResult | null>(null);
  const outputSelectionSupported = useMemo(
    () => supportsAudioOutputSelection(),
    []
  );
  const diagnosticStarted = useRef(false);

  const runNetworkDiagnostic = useCallback(async () => {
    setNetworkState('checking');
    const startedAt = performance.now();
    const connection = (navigator as NetworkNavigator).connection;
    try {
      const checker = new ConnectionCheck(serverUrl, preflightToken, {
        errorsAsWarnings: false,
      });
      const websocketCheck = await checker.checkWebsocket();
      const webRtcCheck = await checker.checkWebRTC();
      const turnCheck = await checker.checkTURN();
      const websocket = diagnosticStatus(
        websocketCheck.status,
        websocketCheck.logs.some((log) => log.level === 'warning')
      );
      const webrtc = diagnosticStatus(
        webRtcCheck.status,
        webRtcCheck.logs.some((log) => log.level === 'warning')
      );
      const turn = diagnosticStatus(
        turnCheck.status,
        turnCheck.logs.some((log) => log.level === 'warning')
      );
      const input = {
        online: navigator.onLine,
        websocket,
        webrtc,
        turn,
        effectiveType: connection?.effectiveType,
        rttMs: connection?.rtt,
        downlinkMbps: connection?.downlink,
      };
      const result: NetworkDiagnosticResult = {
        ...summarizeNetworkDiagnostic(input),
        websocket,
        webrtc,
        turn,
        durationMs: Math.round(performance.now() - startedAt),
        effectiveType: connection?.effectiveType,
        rttMs: connection?.rtt,
        downlinkMbps: connection?.downlink,
      };
      setNetworkResult(result);
      onDiagnostic?.({
        grade: result.grade,
        durationMs: result.durationMs,
        effectiveType: result.effectiveType ?? null,
        rttMs: result.rttMs ?? null,
        downlinkMbps: result.downlinkMbps ?? null,
        websocket: result.websocket,
        webrtc: result.webrtc,
        turn: result.turn,
      });
    } catch {
      const result: NetworkDiagnosticResult = {
        ...summarizeNetworkDiagnostic({
          online: navigator.onLine,
          websocket: 'failed',
          webrtc: 'failed',
          turn: 'unavailable',
        }),
        websocket: 'failed',
        webrtc: 'failed',
        turn: 'unavailable',
        durationMs: Math.round(performance.now() - startedAt),
      };
      setNetworkResult(result);
      onDiagnostic?.({
        grade: result.grade,
        durationMs: result.durationMs,
        websocket: result.websocket,
        webrtc: result.webrtc,
        turn: result.turn,
      });
    } finally {
      setNetworkState('complete');
    }
  }, [onDiagnostic, preflightToken, serverUrl]);

  useEffect(() => {
    if (diagnosticStarted.current) return;
    diagnosticStarted.current = true;
    void runNetworkDiagnostic();
  }, [runNetworkDiagnostic]);

  useEffect(() => {
    const stored = window.localStorage.getItem(AUDIO_OUTPUT_STORAGE_KEY);
    if (stored) setAudioOutputDeviceId(stored);
  }, []);

  const handlePreviewError = useCallback((error: Error) => {
    setPreviewError(mediaDeviceErrorMessage(error));
  }, []);

  const previewOptions = useMemo(
    () => ({
      audio: userChoices.audioEnabled
        ? {
            ...KAIPAI_AUDIO_CAPTURE_DEFAULTS,
            deviceId: userChoices.audioDeviceId,
          }
        : false,
      // Appena l'utente sceglie un lato del telefono si smette di chiedere un
      // dispositivo per identificativo: sui browser mobili `deviceId` è una
      // preferenza che il browser può ignorare — e lo fa — restituendo
      // comunque la camera predefinita. `facingMode` è la domanda che
      // rispettano.
      video: userChoices.videoEnabled
        ? videoFacingMode
          ? { facingMode: videoFacingMode }
          : { deviceId: userChoices.videoDeviceId }
        : false,
    }),
    [
      userChoices.audioDeviceId,
      userChoices.audioEnabled,
      userChoices.videoDeviceId,
      userChoices.videoEnabled,
      videoFacingMode,
    ]
  );
  const previewTracks = usePreviewTracks(
    previewOptions,
    handlePreviewError
  );
  const audioTrack = previewTracks?.find(
    (track) => track.kind === Track.Kind.Audio
  ) as LocalAudioTrack | undefined;
  const videoTrack = previewTracks?.find(
    (track) => track.kind === Track.Kind.Video
  ) as LocalVideoTrack | undefined;

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    let active = true;
    const refresh = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!active) return;
      setAudioInputs(devices.filter((d) => d.kind === 'audioinput'));
      setVideoInputs(devices.filter((d) => d.kind === 'videoinput'));
      setAudioOutputs(devices.filter((d) => d.kind === 'audiooutput'));
    };
    void refresh();
    navigator.mediaDevices.addEventListener?.('devicechange', refresh);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener?.('devicechange', refresh);
    };
  }, [audioTrack, videoTrack]);

  const chooseAudioOutput = (deviceId: string) => {
    setAudioOutputDeviceId(deviceId);
    window.localStorage.setItem(AUDIO_OUTPUT_STORAGE_KEY, deviceId);
    setSpeakerTestState('idle');
  };

  const testSpeaker = async () => {
    setSpeakerTestState('playing');
    try {
      await playSpeakerTest(audioOutputDeviceId);
      setSpeakerTestState('success');
    } catch {
      setSpeakerTestState('error');
    }
  };

  const join = useCallback(() => {
    onJoin({
      ...userChoices,
      username: participantName,
      audioOutputDeviceId,
      // Senza questo, chi inverte la camera nel pre-join entrerebbe comunque
      // in chiamata con la frontale: la stanza ricrea le tracce per conto suo.
      videoFacingMode: videoFacingMode ?? undefined,
    });
  }, [
    audioOutputDeviceId,
    onJoin,
    participantName,
    userChoices,
    videoFacingMode,
  ]);

  const flipCamera = useCallback(() => {
    // Alla prima pressione si passa alla posteriore; poi si alterna.
    setVideoFacingMode((current) =>
      current === 'environment' ? 'user' : 'environment'
    );
  }, []);

  return {
    participantName,
    userChoices,
    saveAudioInputEnabled,
    saveVideoInputEnabled,
    saveAudioInputDeviceId,
    saveVideoInputDeviceId,
    audioTrack,
    videoTrack,
    previewError,
    outputSelectionSupported,
    audioInputs,
    videoInputs,
    audioOutputDeviceId,
    audioOutputs,
    chooseAudioOutput,
    speakerTestState,
    testSpeaker,
    networkState,
    networkResult,
    runNetworkDiagnostic,
    videoFacingMode,
    join,
    flipCamera,
  };
}
