'use client';
import { ExitNote } from '@/components/session-compass/exit-note';

import '@livekit/components-styles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBackGuard } from '@/lib/hooks/use-back-guard';
import {
  LiveKitRoom,
  VideoConference,
  useLocalParticipant,
  useConnectionState,
} from '@livekit/components-react';
import {
  ConnectionQuality,
  ConnectionState,
  Room,
  RoomEvent,
  type LocalVideoTrack,
  type Participant,
} from 'livekit-client';
import {
  BackgroundProcessor,
  supportsBackgroundProcessors,
  type BackgroundProcessorWrapper,
} from '@livekit/track-processors';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/share-button';
import { ResendAthleteCallLinkButton } from '@/components/resend-athlete-call-link-button';
import { AiSessionNotesControl } from '@/components/ai-session-notes-control';
import { LocalizeLiveKitLeaveButton } from '@/components/livekit-call-labels';
import { X } from 'lucide-react';
import {
  ApplyInitialAudioOutput,
  CallDeviceSettings,
  ConnectionQualityNotice,
  KaiPaiPreJoin,
  type KaiPaiCallChoices,
} from '@/components/livekit-call-controls';
import {
  KAIPAI_AUDIO_CAPTURE_DEFAULTS,
  videoPublishSettings,
} from '@/lib/core/video/call-settings';
import {
  CameraSuspendedNotice,
  OfflineNotice,
  ReconnectionNotice,
  ScreenLockHint,
  useLiveKitRoomResilience,
} from '@/components/livekit-room-resilience';
import { useWakeLock } from '@/lib/hooks/use-wake-lock';
import {
  PictureInPictureControl,
  RoomFullscreenControl,
  WaitingRoomGate,
} from '@/components/livekit-call-extras';
import { BackgroundSelectionApplier } from '@/components/livekit-background-controls';
import { RoomFlipCameraControl } from '@/components/room-flip-camera-control';
import { readIsCompact, useIsCompact } from '@/lib/hooks/use-is-compact';
import { useCallCapabilities } from '@/lib/core/video/capabilities-client';
import { visibleRoomControls } from '@/lib/core/video/capabilities';
import type {
  ClientVideoEventType,
  TechnicalEventDetails,
} from '@/lib/core/video/technical-events';
import { completeBookingAction } from '@/app/(dashboard)/dashboard/coach/actions';

/* Background options. Image backgrounds are either a shipped asset (`src`, e.g.
   the branded KaiPai backdrop) or a runtime-generated gradient (`from`/`to`). */
type BgOption =
  | { id: 'none'; label: string; kind: 'none' }
  | { id: 'blur'; label: string; kind: 'blur' }
  | { id: string; label: string; kind: 'image'; src: string }
  | { id: string; label: string; kind: 'image'; from: string; to: string };

/** Renders a diagonal two-stop gradient to a data-URL usable as a background. */
function gradientDataUrl(from: string, to: string): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

const BG_OPTIONS: BgOption[] = [
  { id: 'none', label: 'Nessuno', kind: 'none' },
  { id: 'blur', label: 'Sfoca', kind: 'blur' },
  { id: 'kaipai', label: 'KaiPai', kind: 'image', src: '/kaipai-vc-bg.jpg' },
  { id: 'studio', label: 'Studio', kind: 'image', from: '#0f172a', to: '#334155' },
];

/**
 * Camera background controls (blur / virtual background). Must live inside
 * <LiveKitRoom> so it can reach the local camera track. Applies a single
 * reusable processor and switches modes on the fly to avoid visual artifacts.
 */
function BackgroundControls() {
  const { cameraTrack, isCameraEnabled } = useLocalParticipant();
  const [selected, setSelected] = useState<string>('none');
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null);
  const supported = useMemo(() => supportsBackgroundProcessors(), []);

  // Resolve each image option to a usable path: shipped asset (`src`) as-is,
  // or a runtime-generated gradient data-URL.
  const images = useMemo(() => {
    const map: Record<string, string> = {};
    for (const o of BG_OPTIONS) {
      if (o.kind !== 'image') continue;
      map[o.id] = 'src' in o ? o.src : gradientDataUrl(o.from, o.to);
    }
    return map;
  }, []);

  const track = cameraTrack?.track as LocalVideoTrack | undefined;

  // Apply the selected effect whenever it — or the underlying camera track
  // (e.g. after toggling the camera) — changes.
  useEffect(() => {
    if (!supported || !track) return;
    const option = BG_OPTIONS.find((o) => o.id === selected);
    if (!option) return;

    let cancelled = false;
    (async () => {
      try {
        if (option.kind === 'none') {
          if (track.getProcessor()) await track.stopProcessor();
          return;
        }
        const opts =
          option.kind === 'blur'
            ? ({ mode: 'background-blur', blurRadius: 24 } as const)
            : ({ mode: 'virtual-background', imagePath: images[option.id] } as const);

        if (!processorRef.current) {
          processorRef.current = BackgroundProcessor(opts);
        }
        if (cancelled) return;
        if (track.getProcessor() !== processorRef.current) {
          await track.setProcessor(processorRef.current);
        }
        if (cancelled) return;
        await processorRef.current.switchTo(opts);
      } catch (err) {
        console.error('background processor failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supported, track, selected, images]);

  if (!supported) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-white/60">Sfondo</span>
      {BG_OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setSelected(o.id)}
          disabled={!isCameraEnabled}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            selected === o.id
              ? 'bg-red-600 text-white'
              : 'bg-white/10 text-white/80 hover:bg-white/20'
          }`}
        >
          {o.label}
        </button>
      ))}
      {!isCameraEnabled && (
        <span className="text-[11px] text-white/40">
          Attiva la camera per cambiare sfondo
        </span>
      )}
    </div>
  );
}

/**
 * Records the real session duration: while connected to the room, pings the
 * heartbeat endpoint on connect and every 15s. Renders nothing.
 */
function SessionTracker({ bookingId }: { bookingId: number }) {
  const state = useConnectionState();

  useEffect(() => {
    if (state !== ConnectionState.Connected) return;
    let active = true;
    const ping = () => {
      if (!active) return;
      fetch(`/api/video/${bookingId}/heartbeat`, { method: 'POST' }).catch(
        () => {}
      );
    };
    ping();
    const id = setInterval(ping, 15_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [state, bookingId]);

  return null;
}

/**
 * LiveKit room client. Connects with a server-minted token and renders the
 * standard conference UI (camera/mic publish + remote participants), plus a
 * background blur / virtual-background toolbar for the local camera.
 */
function ConnectedVideoRoom({
  serverUrl,
  token,
  bookingId,
  viewerIsCoach,
  canStartAiNotes,
  coachIdentity,
  backHref,
  counterpartName,
  choices,
}: {
  serverUrl: string;
  token: string;
  bookingId: number;
  viewerIsCoach: boolean;
  canStartAiNotes: boolean;
  coachIdentity: string;
  backHref: string;
  counterpartName?: string;
  choices: KaiPaiCallChoices;
}) {
  const router = useRouter();
  const isCompact = useIsCompact();
  const caps = useCallCapabilities();
  const controls = visibleRoomControls(caps, isCompact === true);
  const room = useMemo(
    () => {
      // Letto qui e non da `useIsCompact`: la stanza si configura una volta
      // sola, alla creazione, e attendere il primo effetto significherebbe
      // ricrearla a chiamata avviata.
      const { resolution, publishDefaults } = videoPublishSettings(
        readIsCompact()
      );
      return new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults,
        audioCaptureDefaults: {
          ...KAIPAI_AUDIO_CAPTURE_DEFAULTS,
          deviceId: choices.audioDeviceId,
        },
        // Se nel pre-join è stato scelto un lato del telefono, quello comanda:
        // su mobile il vincolo per identificativo viene ignorato dal browser.
        videoCaptureDefaults: {
          resolution,
          ...(choices.videoFacingMode
            ? { facingMode: choices.videoFacingMode }
            : { deviceId: choices.videoDeviceId }),
        },
      });
    },
    [choices.audioDeviceId, choices.videoDeviceId, choices.videoFacingMode]
  );
  const {
    isReconnecting,
    isCameraSuspended,
    isOffline,
    reactivateCamera,
    handleRoomError,
  } = useLiveKitRoomResilience(room);
  // Lo schermo che si spegne sospende la cattura: si chiede al sistema di
  // tenerlo acceso finché si è in stanza.
  useWakeLock(true);
  // A disconnect is not the same as completing the appointment. Keep both
  // participants on a recovery screen so an accidental exit can be reversed.
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pending, setPending] = useState(false);
  const leftRef = useRef(false);
  // Su Android il tasto Indietro e' a un millimetro dai controlli della
  // chiamata, e senza guardia la fa cadere senza chiedere nulla. Attiva solo
  // finche' si e' davvero in chiamata: dopo l'uscita l'Indietro torna normale.
  const backGuard = useBackGuard(!showExitDialog);
  const recordTechnicalEvent = useCallback(
    (
      eventType: ClientVideoEventType,
      details: TechnicalEventDetails = {}
    ) => {
      void fetch(`/api/video/${bookingId}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventType, details }),
        keepalive: true,
      }).catch(() => {});
    },
    [bookingId]
  );

  useEffect(() => {
    const reconnecting = () => recordTechnicalEvent('reconnecting');
    const reconnected = () => recordTechnicalEvent('reconnected');
    const mediaDeviceError = (error: Error) =>
      recordTechnicalEvent('media_device_error', {
        reason: error.name,
      });
    const qualityChanged = (
      quality: ConnectionQuality,
      participant: Participant
    ) => {
      if (
        participant.identity === room.localParticipant.identity &&
        (quality === ConnectionQuality.Poor ||
          quality === ConnectionQuality.Lost)
      ) {
        recordTechnicalEvent('connection_quality', { quality });
      }
    };
    room.on(RoomEvent.Reconnecting, reconnecting);
    room.on(RoomEvent.Reconnected, reconnected);
    room.on(RoomEvent.MediaDevicesError, mediaDeviceError);
    room.on(RoomEvent.ConnectionQualityChanged, qualityChanged);
    return () => {
      room.off(RoomEvent.Reconnecting, reconnecting);
      room.off(RoomEvent.Reconnected, reconnected);
      room.off(RoomEvent.MediaDevicesError, mediaDeviceError);
      room.off(RoomEvent.ConnectionQualityChanged, qualityChanged);
    };
  }, [recordTechnicalEvent, room]);

  const handleDisconnected = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    setShowExitDialog(true);
  }, []);

  /**
   * Uscita dalla sala d'attesa: si torna da dove si è arrivati, senza passare
   * per il dialog "sei uscito dalla call". Chi lascia la sala ha già deciso, e
   * proporgli "rientra" sarebbe rifargli la stessa domanda. `leftRef` viene
   * alzato prima di chiudere la connessione proprio per zittire quel dialog.
   */
  const leaveWaitingRoom = useCallback(() => {
    leftRef.current = true;
    router.push(backHref);
  }, [backHref, router]);

  function rejoin() {
    // Reloading obtains a fresh short-lived token and a fresh Room instance.
    window.location.reload();
  }

  async function finish(markCompleted: boolean) {
    if (markCompleted) {
      setPending(true);
      try {
        const fd = new FormData();
        fd.set('bookingId', String(bookingId));
        await completeBookingAction({}, fd);
      } catch {
        // best-effort: navigate back regardless
      }
    }
    router.push(backHref);
  }

  return (
    <div
      data-lk-theme="default"
      data-kaipai-video-shell
      className={
        isCompact
          ? 'fixed inset-0 z-50 h-dvh w-screen overflow-hidden bg-neutral-950'
          : 'relative h-[70vh] overflow-hidden rounded-lg border border-gray-200 bg-neutral-950 fullscreen:h-dvh fullscreen:w-screen fullscreen:rounded-none fullscreen:border-0'
      }
    >
      {/* Un avviso alla volta, dal più grave: sovrapporli su un telefono
          coprirebbe il video con più cartelli che immagine. */}
      {isOffline ? (
        <OfflineNotice />
      ) : isReconnecting ? (
        <ReconnectionNotice />
      ) : isCameraSuspended ? (
        <CameraSuspendedNotice onReactivate={reactivateCamera} />
      ) : null}
      {isCompact === true && <ScreenLockHint />}
      <LiveKitRoom
        room={room}
        serverUrl={serverUrl}
        token={token}
        connect
        video={
          viewerIsCoach && choices.videoEnabled
            ? choices.videoFacingMode
              ? { facingMode: choices.videoFacingMode }
              : { deviceId: choices.videoDeviceId }
            : false
        }
        audio={
          viewerIsCoach && choices.audioEnabled
            ? {
                ...KAIPAI_AUDIO_CAPTURE_DEFAULTS,
                deviceId: choices.audioDeviceId,
              }
            : false
        }
        onDisconnected={handleDisconnected}
        onError={handleRoomError}
        style={{ height: '100%' }}
      >
        <LocalizeLiveKitLeaveButton />
        <ApplyInitialAudioOutput
          deviceId={choices.audioOutputDeviceId}
        />
        <BackgroundSelectionApplier />
        <WaitingRoomGate
          isCoach={viewerIsCoach}
          coachIdentity={coachIdentity}
          choices={choices}
          onTechnicalEvent={recordTechnicalEvent}
          onLeave={leaveWaitingRoom}
        >
        <AiSessionNotesControl
          bookingId={bookingId}
          canStart={canStartAiNotes}
        />
        <SessionTracker bookingId={bookingId} />
        <div className="flex h-full flex-col">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 bg-black/40 px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
            {controls.includes('exit') && (
              <button
                type="button"
                onClick={() => router.push(backHref)}
                aria-label="Chiudi videochiamata"
                className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {controls.includes('fullscreen') && <RoomFullscreenControl />}
              {controls.includes('picture-in-picture') && (
                <PictureInPictureControl
                  onTechnicalEvent={recordTechnicalEvent}
                />
              )}
              {controls.includes('connection-quality') && (
                <ConnectionQualityNotice compact={isCompact === true} />
              )}
              {controls.includes('share') && (
                <ShareButton bookingId={bookingId} appearance="room" />
              )}
              {controls.includes('share') && viewerIsCoach && isCompact !== true && (
                <ResendAthleteCallLinkButton
                  bookingId={bookingId}
                  athleteName={counterpartName ?? 'l’atleta'}
                  appearance="room"
                />
              )}
            </div>
            {controls.includes('share') && viewerIsCoach && isCompact === true && (
              <div className="order-last w-full">
                <ResendAthleteCallLinkButton
                  bookingId={bookingId}
                  athleteName={counterpartName ?? 'l’atleta'}
                  appearance="room-compact"
                />
              </div>
            )}
          </div>
          <div className="relative min-h-0 flex-1">
            {/* VideoConference renders its own RoomAudioRenderer internally —
                do not add a second one or remote audio plays twice/garbled. */}
            <VideoConference SettingsComponent={CallDeviceSettings} />
            {controls.includes('flip-camera') && <RoomFlipCameraControl />}
          </div>
        </div>
        </WaitingRoomGate>
      </LiveKitRoom>

      {/* Conferma sul tasto Indietro. Sta sopra tutto (z-30) perche' compare
          mentre la chiamata e' ancora viva: la connessione non si e' chiusa,
          l'utente puo' semplicemente restare. */}
      {backGuard.confirming && !showExitDialog && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Uscire dalla videochiamata?"
        >
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900">
              Vuoi uscire dalla videochiamata?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              La sessione è ancora in corso. Se esci, la chiamata si chiude per
              te e dovrai rientrare.
            </p>
            <Button
              type="button"
              className="mt-6 w-full rounded-full bg-green-600 text-white hover:bg-green-700"
              onClick={backGuard.stay}
            >
              Resta nella call
            </Button>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full rounded-full border-gray-300 bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900"
              onClick={() => backGuard.leave(() => router.push(backHref))}
            >
              Chiudi
            </Button>
          </div>
        </div>
      )}

      {/* Sopra la sala d'attesa (z-30): la connessione può cadere prima di
          essere ammessi, e un dialog nascosto dietro l'overlay lascerebbe la
          persona davanti a "Connessione alla sala…" senza via d'uscita. */}
      {showExitDialog && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900">
              Sei uscito dalla call
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Puoi rientrare subito: l’appuntamento resta attivo finché non
              viene completato o termina la finestra prevista.
            </p>

            {/* Il momento in cui il coach ha ancora tutto in mente, e in cui
                il microfono e' finalmente libero: durante la call e' di
                LiveKit. Compare solo se una sessione AI esiste davvero. */}
            {viewerIsCoach ? <ExitNote bookingId={bookingId} /> : null}
            <Button
              type="button"
              className="mt-6 w-full rounded-full bg-green-600 text-white hover:bg-green-700"
              disabled={pending}
              onClick={rejoin}
            >
              Rientra nella call
            </Button>
            <div
              className={
                isCompact ? 'mt-3 flex flex-col gap-3' : 'mt-3 flex gap-3'
              }
            >
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-full border-gray-300 bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900"
                disabled={pending}
                onClick={() => finish(false)}
              >
                Torna alla dashboard
              </Button>
              {viewerIsCoach && (
                <Button
                  type="button"
                  className="flex-1 rounded-full"
                  disabled={pending}
                  onClick={() => finish(true)}
                >
                  Completa sessione
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function VideoRoom({
  serverUrl,
  token,
  preflightToken,
  bookingId,
  viewerIsCoach,
  canStartAiNotes,
  coachIdentity,
  backHref,
  counterpartName,
}: {
  serverUrl: string;
  token: string;
  preflightToken: string;
  bookingId: number;
  viewerIsCoach: boolean;
  canStartAiNotes: boolean;
  coachIdentity: string;
  backHref: string;
  counterpartName?: string;
}) {
  const router = useRouter();
  const [choices, setChoices] = useState<KaiPaiCallChoices | null>(null);

  if (!choices) {
    return (
      <KaiPaiPreJoin
        participantName={viewerIsCoach ? 'Coach' : 'Atleta'}
        serverUrl={serverUrl}
        preflightToken={preflightToken}
        counterpartName={counterpartName}
        onDiagnostic={(details) => {
          void fetch(`/api/video/${bookingId}/events`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              eventType: 'preflight_result',
              details,
            }),
            keepalive: true,
          }).catch(() => {});
        }}
        onJoin={setChoices}
        onCancel={() => router.push(backHref)}
      />
    );
  }

  return (
    <ConnectedVideoRoom
      serverUrl={serverUrl}
      token={token}
      bookingId={bookingId}
      viewerIsCoach={viewerIsCoach}
      canStartAiNotes={canStartAiNotes}
      coachIdentity={coachIdentity}
      backHref={backHref}
      counterpartName={counterpartName}
      choices={choices}
    />
  );
}
