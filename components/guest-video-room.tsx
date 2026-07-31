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
import {
  ApplyInitialAudioOutput,
  CallDeviceSettings,
  ConnectionQualityNotice,
  KaiPaiPreJoin,
  type KaiPaiCallChoices,
} from './livekit-call-controls';
import { KAIPAI_AUDIO_CAPTURE_DEFAULTS } from '@/lib/core/video/call-settings';
import {
  ReconnectionNotice,
  useLiveKitRoomResilience,
} from './livekit-room-resilience';
import {
  PictureInPictureControl,
  RoomFullscreenControl,
  WaitingRoomGate,
} from './livekit-call-extras';
import { BackgroundSelectionApplier } from './livekit-background-controls';
import { useIsCompact } from '@/lib/hooks/use-is-compact';
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
    () =>
      new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          ...KAIPAI_AUDIO_CAPTURE_DEFAULTS,
          deviceId: choices.audioDeviceId,
        },
        // Se nel pre-join è stato scelto un lato del telefono, quello comanda:
        // su mobile il vincolo per identificativo viene ignorato dal browser.
        videoCaptureDefaults: choices.videoFacingMode
          ? { facingMode: choices.videoFacingMode }
          : { deviceId: choices.videoDeviceId },
      }),
    [choices.audioDeviceId, choices.videoDeviceId, choices.videoFacingMode]
  );
  const { isReconnecting, handleRoomError } =
    useLiveKitRoomResilience(room);
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
        data-lk-theme="default"
        className="relative"
        style={{ height: '100%' }}
      >
        {isReconnecting && <ReconnectionNotice />}
        <SetParticipantName name={name} />
        <ApplyInitialAudioOutput
          deviceId={choices.audioOutputDeviceId}
        />
        <BackgroundSelectionApplier />
        <WaitingRoomGate
          isCoach={false}
          coachIdentity={coachIdentity}
          choices={choices}
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
            <div className="min-h-0 flex-1">
              <VideoConference SettingsComponent={CallDeviceSettings} />
            </div>
          </div>
        </WaitingRoomGate>
      </LiveKitRoom>
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
