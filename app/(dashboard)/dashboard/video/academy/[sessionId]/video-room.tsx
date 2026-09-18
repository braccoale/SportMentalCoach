'use client';

import '@livekit/components-styles';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBackGuard } from '@/lib/hooks/use-back-guard';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { Room } from 'livekit-client';
import { Button } from '@/components/ui/button';
import { LocalizeLiveKitControls } from '@/components/livekit-call-labels';
import { X } from 'lucide-react';
import {
  ApplyInitialAudioOutput,
  ApplyRemoteVolume,
  CallDeviceSettings,
  ConnectionQualityNotice,
  KaiPaiPreJoin,
  type KaiPaiCallChoices,
} from '@/components/livekit-call-controls';
import {
  DEFAULT_REMOTE_VOLUME,
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
import { completeAcademySessionAction } from '@/app/(dashboard)/dashboard/coach/academy/actions';
import {
  AcademyRecordingConsentControl,
  type AcademyRecordingControlStatus,
} from '@/components/academy/academy-recording-consent-control';

/**
 * Stanza LiveKit per una sessione Academy. Stesso motore della videochiamata
 * coach-atleta (LiveKit, sala d'attesa, sfondo, resilienza di rete,
 * schermo intero/PiP), ma nessuna delle funzioni legate a una prenotazione:
 * niente Appunti AI, niente invito ospite (qui i partecipanti sono già tutti
 * coach della piattaforma), niente battito cardiaco — la fine è sempre una
 * scelta del docente ("Completa sessione"), mai dedotta dalla connessione.
 */
function ConnectedVideoRoom({
  serverUrl,
  token,
  sessionId,
  courseId,
  viewerIsInstructor,
  instructorIdentity,
  participantsSummary,
  backHref,
  choices,
  initialRecordingStatus,
}: {
  serverUrl: string;
  token: string;
  sessionId: number;
  courseId: number;
  viewerIsInstructor: boolean;
  instructorIdentity: string;
  participantsSummary: string;
  backHref: string;
  choices: KaiPaiCallChoices;
  initialRecordingStatus: AcademyRecordingControlStatus;
}) {
  const router = useRouter();
  const isCompact = useIsCompact();
  const caps = useCallCapabilities();
  const controls = visibleRoomControls(caps, isCompact === true);
  const room = useMemo(() => {
    const { resolution, publishDefaults } = videoPublishSettings(readIsCompact());
    return new Room({
      adaptiveStream: true,
      dynacast: true,
      webAudioMix: true,
      publishDefaults,
      audioCaptureDefaults: {
        ...KAIPAI_AUDIO_CAPTURE_DEFAULTS,
        deviceId: choices.audioDeviceId,
      },
      videoCaptureDefaults: {
        resolution,
        ...(choices.videoFacingMode
          ? { facingMode: choices.videoFacingMode }
          : { deviceId: choices.videoDeviceId }),
      },
    });
  }, [choices.audioDeviceId, choices.videoDeviceId, choices.videoFacingMode]);

  const { isReconnecting, isCameraSuspended, isOffline, reactivateCamera, handleRoomError } =
    useLiveKitRoomResilience(room);
  useWakeLock(true);

  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pending, setPending] = useState(false);
  const leftRef = useRef(false);
  const backGuard = useBackGuard(!showExitDialog);

  const handleDisconnected = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    setShowExitDialog(true);
  }, []);

  const leaveWaitingRoom = useCallback(() => {
    leftRef.current = true;
    router.push(backHref);
  }, [backHref, router]);

  function rejoin() {
    window.location.reload();
  }

  async function finish(markCompleted: boolean) {
    if (markCompleted) {
      setPending(true);
      try {
        const fd = new FormData();
        fd.set('sessionId', String(sessionId));
        fd.set('courseId', String(courseId));
        await completeAcademySessionAction({}, fd);
      } catch {
        // best-effort: si torna comunque alla dashboard
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
          choices.videoEnabled
            ? choices.videoFacingMode
              ? { facingMode: choices.videoFacingMode }
              : { deviceId: choices.videoDeviceId }
            : false
        }
        audio={
          choices.audioEnabled
            ? { ...KAIPAI_AUDIO_CAPTURE_DEFAULTS, deviceId: choices.audioDeviceId }
            : false
        }
        onDisconnected={handleDisconnected}
        onError={handleRoomError}
        style={{ height: '100%' }}
      >
        <LocalizeLiveKitControls />
        <ApplyInitialAudioOutput deviceId={choices.audioOutputDeviceId} />
        <ApplyRemoteVolume volume={choices.remoteVolume ?? DEFAULT_REMOTE_VOLUME} />
        <BackgroundSelectionApplier />
        <WaitingRoomGate
          isCoach={viewerIsInstructor}
          coachIdentity={instructorIdentity}
          choices={choices}
          onLeave={leaveWaitingRoom}
        >
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
              <span className="hidden text-xs font-medium text-white/60 sm:block">
                {participantsSummary}
              </span>
              {viewerIsInstructor && (
                <AcademyRecordingConsentControl
                  sessionId={sessionId}
                  courseId={courseId}
                  initialStatus={initialRecordingStatus}
                />
              )}
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {controls.includes('fullscreen') && <RoomFullscreenControl />}
                {controls.includes('picture-in-picture') && <PictureInPictureControl />}
                {controls.includes('connection-quality') && (
                  <ConnectionQualityNotice compact={isCompact === true} />
                )}
              </div>
            </div>
            <div className="relative min-h-0 flex-1">
              <VideoConference SettingsComponent={CallDeviceSettings} />
              {controls.includes('flip-camera') && <RoomFlipCameraControl />}
            </div>
          </div>
        </WaitingRoomGate>
      </LiveKitRoom>

      {backGuard.confirming && !showExitDialog && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Uscire dalla videochiamata?"
        >
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900">Vuoi uscire dalla videochiamata?</h2>
            <p className="mt-2 text-sm text-gray-600">
              La sessione è ancora in corso. Se esci, la chiamata si chiude per te e dovrai rientrare.
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

      {showExitDialog && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900">Sei uscito dalla call</h2>
            <p className="mt-2 text-sm text-gray-600">
              Puoi rientrare finché la stanza resta aperta.
              {viewerIsInstructor && ' Completa la sessione quando la formazione è finita.'}
            </p>
            <Button
              type="button"
              className="mt-6 w-full rounded-full bg-green-600 text-white hover:bg-green-700"
              disabled={pending}
              onClick={rejoin}
            >
              Rientra nella call
            </Button>
            <div className={isCompact ? 'mt-3 flex flex-col gap-3' : 'mt-3 flex gap-3'}>
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-full border-gray-300 bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900"
                disabled={pending}
                onClick={() => finish(false)}
              >
                Torna alla dashboard
              </Button>
              {viewerIsInstructor && (
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
  sessionId,
  courseId,
  viewerIsInstructor,
  instructorIdentity,
  instructorName,
  participantNames,
  backHref,
  initialRecordingStatus,
}: {
  serverUrl: string;
  token: string;
  preflightToken: string;
  sessionId: number;
  courseId: number;
  viewerIsInstructor: boolean;
  instructorIdentity: string;
  instructorName: string;
  participantNames: string[];
  backHref: string;
  initialRecordingStatus: AcademyRecordingControlStatus;
}) {
  const router = useRouter();
  const [choices, setChoices] = useState<KaiPaiCallChoices | null>(null);

  const participantsSummary = viewerIsInstructor
    ? participantNames.length > 0
      ? `Con ${participantNames.join(', ')}`
      : 'Nessun altro partecipante ancora'
    : `Docente: ${instructorName}`;

  if (!choices) {
    return (
      <KaiPaiPreJoin
        participantName={viewerIsInstructor ? 'Docente' : 'Coach'}
        serverUrl={serverUrl}
        preflightToken={preflightToken}
        counterpartName={participantsSummary}
        onJoin={setChoices}
        onCancel={() => router.push(backHref)}
      />
    );
  }

  return (
    <ConnectedVideoRoom
      serverUrl={serverUrl}
      token={token}
      sessionId={sessionId}
      courseId={courseId}
      viewerIsInstructor={viewerIsInstructor}
      instructorIdentity={instructorIdentity}
      participantsSummary={participantsSummary}
      backHref={backHref}
      choices={choices}
      initialRecordingStatus={initialRecordingStatus}
    />
  );
}
