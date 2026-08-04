'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type Participant,
  type Room,
  type RoomEventCallbacks,
  type TrackPublication,
} from 'livekit-client';
import {
  getLocalMediaDiagnostics,
  pauseCameraWhileHidden,
  restoreLocalMediaIfNeeded,
  type LocalMediaPreferences,
} from '@/lib/core/video/media-resilience';

const DEVELOPMENT = process.env.NODE_ENV !== 'production';

function developmentInfo(message: string, details: unknown) {
  if (DEVELOPMENT) console.info(message, details);
}

function developmentWarn(message: string, details: unknown) {
  if (DEVELOPMENT) console.warn(message, details);
}

function updatePreference(
  preferences: LocalMediaPreferences,
  publication: TrackPublication,
  enabled: boolean
) {
  if (publication.source === Track.Source.Camera) {
    preferences.camera = enabled;
  } else if (publication.source === Track.Source.Microphone) {
    preferences.microphone = enabled;
  }
}

export function useLiveKitRoomResilience(room: Room) {
  const [isReconnecting, setIsReconnecting] = useState(false);
  const preferencesRef = useRef<LocalMediaPreferences>({
    camera: true,
    microphone: true,
  });
  const restorePromiseRef = useRef<Promise<void> | null>(null);

  const restoreMedia = useCallback(
    async (trigger: 'visibility' | 'reconnected') => {
      while (restorePromiseRef.current) {
        await restorePromiseRef.current;
      }

      const task = (async () => {
        try {
          const restored = await restoreLocalMediaIfNeeded(
            room,
            preferencesRef.current
          );
          developmentInfo('[LiveKit] Local media checked', {
            trigger,
            restored,
            ...getLocalMediaDiagnostics(room),
          });
        } catch (error) {
          console.error('[LiveKit] Failed restoring local media', {
            trigger,
            error,
            ...getLocalMediaDiagnostics(room),
          });
        }
      })();

      restorePromiseRef.current = task;
      try {
        await task;
      } finally {
        if (restorePromiseRef.current === task) {
          restorePromiseRef.current = null;
        }
      }
    },
    [room]
  );

  useEffect(() => {
    const handleReconnecting = () => {
      setIsReconnecting(true);
      developmentWarn(
        '[LiveKit] Reconnecting',
        getLocalMediaDiagnostics(room)
      );
    };
    const handleReconnected = () => {
      setIsReconnecting(false);
      developmentInfo(
        '[LiveKit] Reconnected',
        getLocalMediaDiagnostics(room)
      );
      void restoreMedia('reconnected');
    };
    const handleDisconnected: RoomEventCallbacks['disconnected'] = (reason) => {
      setIsReconnecting(false);
      console.error('[LiveKit] Disconnected', {
        reason,
        ...getLocalMediaDiagnostics(room),
      });
    };
    const handleConnectionStateChanged: RoomEventCallbacks['connectionStateChanged'] =
      (state) => {
        developmentInfo('[LiveKit] Connection state changed', {
          state,
          ...getLocalMediaDiagnostics(room),
        });
      };
    const handleTrackMuted: RoomEventCallbacks['trackMuted'] = (
      publication: TrackPublication,
      participant: Participant
    ) => {
      if (participant !== room.localParticipant) return;
      updatePreference(preferencesRef.current, publication, false);
    };
    const handleTrackUnmuted: RoomEventCallbacks['trackUnmuted'] = (
      publication: TrackPublication,
      participant: Participant
    ) => {
      if (participant !== room.localParticipant) return;
      updatePreference(preferencesRef.current, publication, true);
    };
    const handleLocalTrackPublished: RoomEventCallbacks['localTrackPublished'] =
      (publication: LocalTrackPublication) => {
        updatePreference(preferencesRef.current, publication, true);
      };
    const handleLocalTrackUnpublished: RoomEventCallbacks['localTrackUnpublished'] =
      (publication: LocalTrackPublication) => {
        developmentWarn('[LiveKit] Local track unpublished', {
          source: publication.source,
          trackSid: publication.trackSid,
          ...getLocalMediaDiagnostics(room),
        });
      };
    const handleMediaDevicesError: RoomEventCallbacks['mediaDevicesError'] = (
      error,
      kind
    ) => {
      console.error('[LiveKit] Media device error', {
        kind,
        error,
        ...getLocalMediaDiagnostics(room),
      });
    };
    const handleVisibilityChange = () => {
      developmentInfo(
        '[Page visibility]',
        getLocalMediaDiagnostics(room)
      );
      if (document.visibilityState === 'visible') {
        void restoreMedia('visibility');
        return;
      }
      // In secondo piano il browser congela i fotogrammi ma la traccia resta
      // pubblicata: l'altra persona vedrebbe un'immagine ferma continuando a
      // sentire la voce. Meglio dichiarare la pausa.
      void pauseCameraWhileHidden(room).catch((error) => {
        console.error('[LiveKit] Failed pausing camera in background', error);
      });
    };

    room
      .on(RoomEvent.Reconnecting, handleReconnecting)
      .on(RoomEvent.Reconnected, handleReconnected)
      .on(RoomEvent.Disconnected, handleDisconnected)
      .on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged)
      .on(RoomEvent.TrackMuted, handleTrackMuted)
      .on(RoomEvent.TrackUnmuted, handleTrackUnmuted)
      .on(RoomEvent.LocalTrackPublished, handleLocalTrackPublished)
      .on(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished)
      .on(RoomEvent.MediaDevicesError, handleMediaDevicesError);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      room
        .off(RoomEvent.Reconnecting, handleReconnecting)
        .off(RoomEvent.Reconnected, handleReconnected)
        .off(RoomEvent.Disconnected, handleDisconnected)
        .off(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged)
        .off(RoomEvent.TrackMuted, handleTrackMuted)
        .off(RoomEvent.TrackUnmuted, handleTrackUnmuted)
        .off(RoomEvent.LocalTrackPublished, handleLocalTrackPublished)
        .off(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished)
        .off(RoomEvent.MediaDevicesError, handleMediaDevicesError);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [restoreMedia, room]);

  const handleRoomError = useCallback((error: Error) => {
    console.error('[LiveKit] Room error', error);
  }, []);

  return { isReconnecting, handleRoomError };
}

export function ReconnectionNotice() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-gray-950 shadow-lg"
    >
      Riconnessione in corso…
    </div>
  );
}
