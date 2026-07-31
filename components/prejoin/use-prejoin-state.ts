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

export type PreJoinState = {
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
      video: userChoices.videoEnabled
        ? {
            deviceId: userChoices.videoDeviceId,
          }
        : false,
    }),
    [
      userChoices.audioDeviceId,
      userChoices.audioEnabled,
      userChoices.videoDeviceId,
      userChoices.videoEnabled,
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
    if (!audioTrack || !navigator.mediaDevices) return;
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
  }, [audioTrack]);

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
    });
  }, [audioOutputDeviceId, onJoin, participantName, userChoices]);

  const flipCamera = useCallback(() => {
    if (videoInputs.length < 2) return;
    const current = videoInputs.findIndex(
      (device) => device.deviceId === userChoices.videoDeviceId
    );
    const next = videoInputs[(current + 1) % videoInputs.length];
    if (next) saveVideoInputDeviceId(next.deviceId);
  }, [saveVideoInputDeviceId, userChoices.videoDeviceId, videoInputs]);

  return {
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
    join,
    flipCamera,
  };
}
