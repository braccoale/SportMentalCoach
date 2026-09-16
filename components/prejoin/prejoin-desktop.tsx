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
  ShieldCheck,
  Volume2,
  Wifi,
} from 'lucide-react';
import { PreviewBackgroundControls } from '@/components/livekit-background-controls';
import { InAppBrowserNotice } from '@/components/in-app-browser-notice';
import {
  MAX_REMOTE_VOLUME,
  MIN_REMOTE_VOLUME,
  playRemoteVolumeFeedbackBeep,
} from '@/lib/core/video/call-settings';
import type { PreJoinState } from './use-prejoin-state';
import type { NetworkDiagnosticResult } from './use-prejoin-state';

/** Non un beep per pixel trascinato: solo uno ogni tot, o si trasforma in un ronzio. */
const REMOTE_VOLUME_BEEP_THROTTLE_MS = 120;

/**
 * Un'icona con lo stato al posto di un riquadro a piena larghezza. La
 * diagnostica rete e l'avviso su riduzione rumore/eco occupavano una fascia
 * intera ciascuno per dire, per lo più, "va tutto bene" — informazione che
 * conta solo quando qualcosa non va, non un ingombro permanente. Il
 * dettaglio resta raggiungibile al passaggio del mouse o con la tastiera
 * (`title`), non sparisce.
 */
function StatusIcon({
  icon,
  label,
  detail,
  tone,
  onClick,
  busy,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  tone: 'neutral' | 'good' | 'warning' | 'danger';
  onClick?: () => void;
  busy?: boolean;
}) {
  const toneClasses = {
    neutral: 'border-white/15 bg-white/10 text-white/70',
    good: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-400/25 bg-amber-500/10 text-amber-300',
    danger: 'border-red-400/25 bg-red-500/10 text-red-300',
  }[tone];
  const title = `${label} — ${detail}`;

  if (!onClick) {
    return (
      <span
        role="img"
        aria-label={title}
        title={title}
        className={`flex h-10 w-10 items-center justify-center rounded-full border ${toneClasses}`}
      >
        {icon}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-label={title}
      className={`flex h-10 w-10 items-center justify-center rounded-full border disabled:opacity-60 ${toneClasses}`}
    >
      {icon}
    </button>
  );
}

function networkTone(
  networkState: 'idle' | 'checking' | 'complete',
  result: NetworkDiagnosticResult | null
): 'neutral' | 'good' | 'warning' | 'danger' {
  if (networkState !== 'complete' || !result) return 'neutral';
  if (result.grade === 'good') return 'good';
  if (result.grade === 'warning') return 'warning';
  return 'danger';
}

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

/**
 * Il nome del dispositivo davvero attivo, non un'etichetta fissa: "Scegli
 * microfono" ha senso solo finché non se n'è scelto uno, e a quel punto
 * dovrebbe dire *quale*, non se stessa.
 */
function selectedDeviceLabel(
  devices: MediaDeviceInfo[],
  deviceId: string,
  placeholder: string
): string {
  const match = devices.find((device) => device.deviceId === deviceId);
  return match?.label || devices[0]?.label || placeholder;
}

function DeviceMenuButton({
  kind,
  placeholder,
  ariaLabel,
  track,
  devices,
  initialSelection,
  onChange,
}: {
  kind: 'audioinput' | 'videoinput';
  /** Mostrato solo finché il nome del dispositivo attivo non è ancora noto. */
  placeholder: string;
  ariaLabel: string;
  track?: LocalAudioTrack | LocalVideoTrack;
  devices: MediaDeviceInfo[];
  initialSelection: string;
  onChange: (deviceId: string) => void;
}) {
  const label = selectedDeviceLabel(devices, initialSelection, placeholder);
  return (
    <MediaDeviceMenu
      kind={kind}
      initialSelection={initialSelection}
      tracks={{ [kind]: track }}
      requestPermissions={Boolean(track)}
      disabled={!track}
      onActiveDeviceChange={(_, deviceId) => onChange(deviceId)}
      className="!flex !h-10 !w-full !items-center !justify-between !gap-2 !rounded-xl !border !border-white/15 !bg-white/10 !px-3 !text-sm !text-white hover:!bg-white/15 disabled:!opacity-40"
      aria-label={ariaLabel}
    >
      <span className="truncate" title={label}>
        {label}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
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
    audioInputs,
    videoInputs,
    previewError,
    outputSelectionSupported,
    audioOutputDeviceId,
    audioOutputs,
    chooseAudioOutput,
    speakerTestState,
    testSpeaker,
    remoteVolume,
    setRemoteVolume,
    networkState,
    networkResult,
    runNetworkDiagnostic,
    join,
  } = state;
  const lastBeepAtRef = useRef(0);

  function handleRemoteVolumeChange(value: number) {
    setRemoteVolume(value);
    const now = Date.now();
    if (now - lastBeepAtRef.current >= REMOTE_VOLUME_BEEP_THROTTLE_MS) {
      lastBeepAtRef.current = now;
      playRemoteVolumeFeedbackBeep();
    }
  }

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

        {/* Anche qui, non solo su mobile: un tablet in un browser interno
            arriva a questo layout e fallisce allo stesso modo. */}
        <InAppBrowserNotice className="mb-5" />

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
              {/* Rete e riduzione rumore dicono per lo più "va tutto
                  bene": due icone qui, non un riquadro a parte — il
                  dettaglio resta a un passaggio del mouse (o un tocco),
                  non sparisce. */}
              <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
                <StatusIcon
                  icon={
                    networkState === 'checking' ? (
                      <Wifi className="h-4 w-4 animate-pulse" />
                    ) : networkResult?.grade === 'good' ? (
                      <Wifi className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )
                  }
                  label={
                    networkState === 'checking'
                      ? 'Diagnostica rete in corso…'
                      : (networkResult?.label ?? 'Diagnostica rete')
                  }
                  detail={
                    networkState === 'checking'
                      ? 'Verifica WebSocket, WebRTC e percorso TURN. Tocca per ripetere.'
                      : `${networkResult?.detail ?? ''} Tocca per ripetere.`
                  }
                  tone={networkTone(networkState, networkResult)}
                  busy={networkState === 'checking'}
                  onClick={() => void runNetworkDiagnostic()}
                />
                <StatusIcon
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label="Audio protetto"
                  detail="Riduzione rumore, cancellazione eco e volume automatico attivi."
                  tone="good"
                />
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
                    placeholder="Scegli microfono"
                    ariaLabel="Scegli microfono"
                    track={audioTrack}
                    devices={audioInputs}
                    initialSelection={userChoices.audioDeviceId}
                    onChange={saveAudioInputDeviceId}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                  <span className="text-xs text-white/55">
                    Parla: le barre devono muoversi.
                  </span>
                  <div className="h-9 w-28 shrink-0">
                    {audioTrack && userChoices.audioEnabled ? (
                      <BarVisualizer
                        track={audioTrack}
                        barCount={7}
                        options={{ minHeight: 8 }}
                        className="h-full"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-end text-xs text-white/40">
                        Spento
                      </div>
                    )}
                  </div>
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
                    placeholder="Scegli camera"
                    ariaLabel="Scegli camera"
                    track={videoTrack}
                    devices={videoInputs}
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
                {/* Non regola il suono di prova qui sopra — quello verifica
                    l'altoparlante, non il volume di chi chiama, che qui non
                    è ancora connesso. Si applica dal momento in cui si entra
                    in chiamata, ed è modificabile anche durante, dal pannello
                    impostazioni. */}
                <div className="mt-3 border-t border-white/10 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-white/75">
                      Volume di chi chiama
                    </span>
                    <span className="text-xs tabular-nums text-white/50">
                      {Math.round(remoteVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={MIN_REMOTE_VOLUME}
                    max={MAX_REMOTE_VOLUME}
                    step={0.05}
                    value={remoteVolume}
                    onChange={(event) =>
                      handleRemoteVolumeChange(Number(event.target.value))
                    }
                    aria-label="Volume di chi chiama"
                    className="mt-2 w-full accent-sky-400"
                  />
                </div>
              </div>
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
