'use client';

import { useEffect, useRef } from 'react';
import {
  BarVisualizer,
  MediaDeviceMenu,
} from '@livekit/components-react';
import type { LocalAudioTrack, LocalVideoTrack } from 'livekit-client';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  Mic,
  MicOff,
  Volume2,
  Wifi,
} from 'lucide-react';
import { PreviewBackgroundControls } from '@/components/livekit-background-controls';
import type { PreJoinState } from './use-prejoin-state';

function CameraPreview({ track }: { track?: LocalVideoTrack }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-neutral-900">
      {track ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-white/65">
          <CameraOff className="h-9 w-9" aria-hidden="true" />
          <span className="text-sm">Anteprima camera non disponibile</span>
        </div>
      )}
    </div>
  );
}

function DeviceMenuButton({
  kind,
  label,
  track,
  initialSelection,
  onChange,
}: {
  kind: 'audioinput' | 'videoinput';
  label: string;
  track?: LocalAudioTrack | LocalVideoTrack;
  initialSelection: string;
  onChange: (deviceId: string) => void;
}) {
  return (
    <MediaDeviceMenu
      kind={kind}
      initialSelection={initialSelection}
      tracks={{ [kind]: track }}
      requestPermissions={Boolean(track)}
      disabled={!track}
      onActiveDeviceChange={(_, deviceId) => onChange(deviceId)}
      className="!flex !h-10 !items-center !gap-2 !rounded-xl !border !border-white/15 !bg-white/10 !px-3 !text-sm !text-white hover:!bg-white/15 disabled:!opacity-40"
      aria-label={label}
    >
      <span className="max-w-36 truncate">{label}</span>
      <ChevronDown className="h-4 w-4" aria-hidden="true" />
    </MediaDeviceMenu>
  );
}

export function PreJoinDesktop({
  state,
  minHeight,
  onCancel,
}: {
  state: PreJoinState;
  minHeight: string;
  onCancel?: () => void;
}) {
  const {
    userChoices,
    saveAudioInputEnabled,
    saveVideoInputEnabled,
    saveAudioInputDeviceId,
    saveVideoInputDeviceId,
    audioTrack,
    videoTrack,
    previewError,
    outputSelectionSupported,
    audioOutputDeviceId,
    audioOutputs,
    chooseAudioOutput,
    speakerTestState,
    testSpeaker,
    networkState,
    networkResult,
    runNetworkDiagnostic,
    join,
  } = state;

  return (
    <div
      data-lk-theme="default"
      className="overflow-auto rounded-2xl border border-white/10 bg-neutral-950 p-4 text-white sm:p-6"
      style={{ minHeight }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-400">
            Controllo dispositivi
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            Preparati alla videochiamata
          </h2>
          <p className="mt-1 text-sm text-white/60">
            Verifica immagine, voce e altoparlante prima di entrare.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-4">
            <CameraPreview
              track={userChoices.videoEnabled ? videoTrack : undefined}
            />
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium">Sfondo video</p>
              <p className="mt-0.5 text-xs text-white/55">
                Scegli come apparirà lo sfondo durante la chiamata.
              </p>
              <div className="mt-3">
                <PreviewBackgroundControls
                  track={
                    userChoices.videoEnabled ? videoTrack : undefined
                  }
                  enabled={Boolean(
                    userChoices.videoEnabled && videoTrack
                  )}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Prova microfono</p>
                  <p className="text-xs text-white/55">
                    Parla: le barre devono muoversi.
                  </p>
                </div>
                <div className="h-9 w-32">
                  {audioTrack && userChoices.audioEnabled ? (
                    <BarVisualizer
                      track={audioTrack}
                      barCount={7}
                      options={{ minHeight: 8 }}
                      className="h-full"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-end text-xs text-white/40">
                      Microfono spento
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {userChoices.audioEnabled ? (
                      <Mic className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <MicOff className="h-4 w-4 text-white/45" />
                    )}
                    <span className="text-sm font-medium">Microfono</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      saveAudioInputEnabled(!userChoices.audioEnabled)
                    }
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      userChoices.audioEnabled
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {userChoices.audioEnabled ? 'Attivo' : 'Disattivato'}
                  </button>
                </div>
                <div className="mt-3">
                  <DeviceMenuButton
                    kind="audioinput"
                    label="Scegli microfono"
                    track={audioTrack}
                    initialSelection={userChoices.audioDeviceId}
                    onChange={saveAudioInputDeviceId}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {userChoices.videoEnabled ? (
                      <Camera className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <CameraOff className="h-4 w-4 text-white/45" />
                    )}
                    <span className="text-sm font-medium">Camera</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      saveVideoInputEnabled(!userChoices.videoEnabled)
                    }
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      userChoices.videoEnabled
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {userChoices.videoEnabled ? 'Attiva' : 'Disattivata'}
                  </button>
                </div>
                <div className="mt-3">
                  <DeviceMenuButton
                    kind="videoinput"
                    label="Scegli camera"
                    track={videoTrack}
                    initialSelection={userChoices.videoDeviceId}
                    onChange={saveVideoInputDeviceId}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 p-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-sky-300" />
                  <span className="text-sm font-medium">Altoparlante</span>
                </div>
                {outputSelectionSupported && audioOutputs.length > 0 && (
                  <select
                    value={audioOutputDeviceId}
                    onChange={(event) =>
                      chooseAudioOutput(event.target.value)
                    }
                    className="mt-3 h-10 w-full rounded-xl border border-white/15 bg-neutral-900 px-3 text-sm text-white"
                    aria-label="Scegli altoparlante"
                  >
                    {audioOutputs.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Altoparlante ${index + 1}`}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={testSpeaker}
                  disabled={speakerTestState === 'playing'}
                  className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-sky-500/15 px-3 text-sm font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
                >
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                  {speakerTestState === 'playing'
                    ? 'Riproduzione…'
                    : 'Prova altoparlante'}
                </button>
                {speakerTestState === 'success' && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Suono di prova riprodotto.
                  </p>
                )}
                {speakerTestState === 'error' && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Il browser ha bloccato il suono. Controlla il volume.
                  </p>
                )}
              </div>
            </div>

            <div
              role="status"
              aria-live="polite"
              className={`mt-4 rounded-xl border p-3 text-xs ${
                networkState === 'checking'
                  ? 'border-sky-400/20 bg-sky-500/10 text-sky-100'
                  : networkResult?.grade === 'good'
                    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
                    : networkResult?.grade === 'warning'
                      ? 'border-amber-400/20 bg-amber-500/10 text-amber-100'
                      : 'border-red-400/20 bg-red-500/10 text-red-100'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-2">
                  {networkState === 'checking' ? (
                    <Wifi className="mt-0.5 h-4 w-4 animate-pulse" />
                  ) : networkResult?.grade === 'good' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {networkState === 'checking'
                        ? 'Diagnostica rete in corso…'
                        : networkResult?.label ?? 'Diagnostica rete'}
                    </p>
                    <p className="mt-1 opacity-75">
                      {networkState === 'checking'
                        ? 'Verifica WebSocket, WebRTC e percorso TURN.'
                        : networkResult?.detail}
                    </p>
                  </div>
                </div>
                {networkState === 'complete' && (
                  <button
                    type="button"
                    onClick={() => void runNetworkDiagnostic()}
                    className="shrink-0 rounded-full border border-current/20 px-2.5 py-1 font-semibold hover:bg-white/10"
                  >
                    Ripeti
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-100">
              Riduzione rumore, cancellazione eco e volume automatico sono
              attivi.
            </div>

            {previewError && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-amber-500/15 p-3 text-sm text-amber-100"
              >
                {previewError}
              </p>
            )}

            <button
              type="button"
              onClick={join}
              className="mt-5 h-12 w-full rounded-full bg-red-600 px-5 text-sm font-semibold text-white shadow-lg shadow-red-950/30 hover:bg-red-500"
            >
              Entra nella videochiamata
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="mt-3 h-11 w-full rounded-full border border-white/15 px-5 text-sm font-semibold text-white/75 hover:bg-white/10 hover:text-white"
              >
                Esci senza entrare
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
