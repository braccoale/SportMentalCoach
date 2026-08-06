'use client';

import { useEffect, useMemo, useState } from 'react';
import '@livekit/components-styles';
import {
  LiveKitRoom,
  VideoConference,
  useRoomContext,
  useConnectionState,
} from '@livekit/components-react';
import { ConnectionState, Room } from 'livekit-client';
import { DoorOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ApplyInitialAudioOutput,
  CallDeviceSettings,
  ConnectionQualityNotice,
  KaiPaiPreJoin,
  type KaiPaiCallChoices,
} from './livekit-call-controls';
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
} from './livekit-room-resilience';
import {
  PictureInPictureControl,
  RoomFullscreenControl,
  WaitingRoomGate,
} from './livekit-call-extras';
import { BackgroundSelectionApplier } from './livekit-background-controls';
import { RoomFlipCameraControl } from './room-flip-camera-control';
import { readIsCompact, useIsCompact } from '@/lib/hooks/use-is-compact';
import { useWakeLock } from '@/lib/hooks/use-wake-lock';
import { useCallCapabilities } from '@/lib/core/video/capabilities-client';
import { visibleRoomControls } from '@/lib/core/video/capabilities';

/**
 * Imposta il nome del partecipante locale non appena la connessione è stabilita.
 */
function SetParticipantName({ name }: { name: string }) {
  const room = useRoomContext();
  const connectionState = useConnectionState();

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      room.localParticipant.setName(name);
    }
  }, [connectionState, room, name]);

  return null;
}

/**
 * Perché l'ospite non è più nella sala. La distinzione serve alle parole: dire
 * "hai lasciato la sala" a chi è appena caduto di linea sarebbe falso, e chi
 * legge si chiederebbe cosa ha sbagliato.
 */
type GuestExitReason = 'left' | 'disconnected';

/**
 * Schermata di uscita dell'ospite.
 *
 * Un ospite arriva da un link d'invito e non ha una dashboard dove tornare:
 * senza questa schermata, uscire dalla sala lo lascerebbe davanti alla sala
 * stessa. Serve anche quando la connessione cade da sola, perché il risultato
 * per chi guarda è lo stesso — non si è più dentro — e l'unica cosa utile da
 * offrire è rientrare.
 */
function GuestLeftRoom({
  reason,
  onRejoin,
}: {
  reason: GuestExitReason;
  onRejoin: () => void;
}) {
  const byChoice = reason === 'left';
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-2xl">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <DoorOpen className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">
          {byChoice ? 'Hai lasciato la sala' : 'Non sei più nella sala'}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {byChoice
            ? 'Puoi rientrare finché la sessione è in corso. Se l’invito è scaduto dovrai chiederne uno nuovo.'
            : 'La connessione si è chiusa, oppure la sessione è terminata. Se è ancora in corso puoi rientrare.'}
        </p>
        <Button
          type="button"
          onClick={onRejoin}
          className="mt-6 w-full rounded-full bg-green-600 text-white hover:bg-green-700"
        >
          Rientra nella sala
        </Button>
      </div>
    </div>
  );
}

function ConnectedGuestVideoRoom({
  serverUrl,
  token,
  name,
  coachIdentity,
  choices,
}: {
  serverUrl: string;
  token: string;
  name: string;
  coachIdentity: string;
  choices: KaiPaiCallChoices;
}) {
  const room = useMemo(
    () => {
      // Come nella stanza principale: la configurazione si decide una volta
      // sola, quindi lo schermo si legge qui e non dal primo effetto.
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
  useWakeLock(true);
  // `null` finché si è dentro. L'uscita voluta viene registrata dal gate
  // prima che arrivi `onDisconnected`, così non viene riscritta in "caduta".
  const [exitReason, setExitReason] = useState<GuestExitReason | null>(null);
  const isCompact = useIsCompact();
  const caps = useCallCapabilities();
  const controls = visibleRoomControls(caps, isCompact === true).filter(
    (control) => control !== 'share' && control !== 'exit'
  );

  return (
    <div
      data-kaipai-video-shell
      className={
        isCompact
          ? 'fixed inset-0 z-50 h-dvh w-screen overflow-hidden bg-neutral-950'
          : 'relative h-full overflow-hidden bg-neutral-950 fullscreen:h-dvh fullscreen:w-screen'
      }
    >
      <LiveKitRoom
        room={room}
        serverUrl={serverUrl}
        token={token}
        connect={true}
        audio={false}
        video={false}
        onError={handleRoomError}
        onDisconnected={() =>
          setExitReason((current) => current ?? 'disconnected')
        }
        data-lk-theme="default"
        className="relative"
        style={{ height: '100%' }}
      >
        {isOffline ? (
          <OfflineNotice />
        ) : isReconnecting ? (
          <ReconnectionNotice />
        ) : isCameraSuspended ? (
          <CameraSuspendedNotice onReactivate={reactivateCamera} />
        ) : null}
        {isCompact === true && <ScreenLockHint />}
        <SetParticipantName name={name} />
        <ApplyInitialAudioOutput
          deviceId={choices.audioOutputDeviceId}
        />
        <BackgroundSelectionApplier />
        <WaitingRoomGate
          isCoach={false}
          coachIdentity={coachIdentity}
          choices={choices}
          onLeave={() => setExitReason('left')}
        >
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 bg-black/40 px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {controls.includes('fullscreen') && <RoomFullscreenControl />}
                {controls.includes('picture-in-picture') && (
                  <PictureInPictureControl />
                )}
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

      {/* Fuori da LiveKitRoom e sopra la sala d'attesa (z-30): deve restare
          visibile anche a chi è uscito prima di essere ammesso. */}
      {exitReason && (
        <GuestLeftRoom
          reason={exitReason}
          onRejoin={() => window.location.reload()}
        />
      )}
    </div>
  );
}

export function GuestVideoRoom({
  serverUrl,
  token,
  preflightToken,
  name,
  coachIdentity,
}: {
  serverUrl: string;
  token: string;
  preflightToken: string;
  name: string;
  coachIdentity: string;
}) {
  const [choices, setChoices] = useState<KaiPaiCallChoices | null>(null);

  if (!choices) {
    return (
      <KaiPaiPreJoin
        participantName={name}
        serverUrl={serverUrl}
        preflightToken={preflightToken}
        onJoin={setChoices}
        minHeight="100%"
      />
    );
  }

  return (
    <ConnectedGuestVideoRoom
      serverUrl={serverUrl}
      token={token}
      name={name}
      coachIdentity={coachIdentity}
      choices={choices}
    />
  );
}
