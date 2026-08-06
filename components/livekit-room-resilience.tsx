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
  isCameraLive,
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

/**
 * Se il mini video (Picture-in-Picture) è aperto, nei due dialetti esistenti:
 * lo standard e quello di Safari, che non implementa il primo.
 */
function isPictureInPictureActive(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.pictureInPictureElement) return true;
  return Array.from(document.querySelectorAll('video')).some(
    (video) =>
      (video as HTMLVideoElement & { webkitPresentationMode?: string })
        .webkitPresentationMode === 'picture-in-picture'
  );
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
  /**
   * La camera doveva essere accesa ma non lo è: il ripristino automatico è
   * stato tentato e non è bastato. È l'unico caso in cui l'utente deve fare
   * qualcosa, e finché resta vero gli si mostra il pulsante per farlo.
   */
  const [isCameraSuspended, setIsCameraSuspended] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const preferencesRef = useRef<LocalMediaPreferences>({
    camera: true,
    microphone: true,
  });
  const restorePromiseRef = useRef<Promise<void> | null>(null);

  const restoreMedia = useCallback(
    async (trigger: 'visibility' | 'reconnected' | 'online' | 'manual') => {
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
        } finally {
          // Conta come è finita davvero, non se il tentativo è stato fatto:
          // un permesso revocato o una camera occupata da un'altra app
          // fallisce in silenzio, e senza questo controllo l'utente
          // resterebbe a parlare a una telecamera spenta.
          setIsCameraSuspended(
            preferencesRef.current.camera && !isCameraLive(room)
          );
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
      // Spegnere la camera a pagina visibile è una scelta dell'utente, non un
      // guasto: l'avviso non deve comparire (né restare) per quello.
      if (
        publication.source === Track.Source.Camera &&
        document.visibilityState === 'visible'
      ) {
        setIsCameraSuspended(false);
      }
    };
    const handleTrackUnmuted: RoomEventCallbacks['trackUnmuted'] = (
      publication: TrackPublication,
      participant: Participant
    ) => {
      if (participant !== room.localParticipant) return;
      updatePreference(preferencesRef.current, publication, true);
      if (publication.source === Track.Source.Camera) {
        setIsCameraSuspended(false);
      }
    };
    const handleLocalTrackPublished: RoomEventCallbacks['localTrackPublished'] =
      (publication: LocalTrackPublication) => {
        updatePreference(preferencesRef.current, publication, true);
        if (publication.source === Track.Source.Camera) {
          setIsCameraSuspended(false);
        }
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
    /**
     * La pagina esce di scena: `visibilitychange` copre il cambio di app,
     * `pagehide` copre i casi in cui Safari congela la pagina senza passare
     * dal primo (bfcache, blocco schermo, chiusura della scheda).
     */
    const suspendCapture = () => {
      // Col mini video aperto la pausa non va imposta: su Android la cattura
      // continua, ed è esattamente ciò che serve a chi ha ridotto la chiamata
      // per prendere appunti restando visibile. Dove invece il sistema
      // sospende davvero la sorgente, è LiveKit a dichiararlo da sé quando la
      // traccia emette `mute`, quindi l'altra persona non resta comunque
      // davanti a un'immagine ferma.
      if (isPictureInPictureActive()) return;
      // In secondo piano il browser congela i fotogrammi ma la traccia resta
      // pubblicata: l'altra persona vedrebbe un'immagine ferma continuando a
      // sentire la voce. Meglio dichiarare la pausa.
      void pauseCameraWhileHidden(room)
        .then((paused) => {
          if (paused) setIsCameraSuspended(preferencesRef.current.camera);
        })
        .catch((error) => {
          console.error('[LiveKit] Failed pausing camera in background', error);
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
      suspendCapture();
    };

    const handlePageHide = () => {
      developmentInfo('[Page hide]', getLocalMediaDiagnostics(room));
      suspendCapture();
    };

    /**
     * Ritorno dal bfcache: su iOS è questo, non `visibilitychange`, l'evento
     * che segnala che la pagina è tornata viva dopo il blocco schermo.
     */
    const handlePageShow = () => {
      developmentInfo('[Page show]', getLocalMediaDiagnostics(room));
      void restoreMedia('visibility');
    };

    const handleOffline = () => {
      setIsOffline(true);
      developmentWarn('[Network] Offline', getLocalMediaDiagnostics(room));
    };

    /**
     * La rete è tornata. LiveKit riconnette da sé, ma le tracce locali
     * possono essere rimaste indietro: un giro di controllo costa nulla e
     * copre il caso in cui la riconnessione avvenga senza `Reconnected`.
     */
    const handleOnline = () => {
      setIsOffline(false);
      void restoreMedia('online');
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
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOffline(typeof navigator !== 'undefined' && !navigator.onLine);

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
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [restoreMedia, room]);

  const handleRoomError = useCallback((error: Error) => {
    console.error('[LiveKit] Room error', error);
  }, []);

  /** Ritentare a mano: è ciò che fa il pulsante "Riattiva videocamera". */
  const reactivateCamera = useCallback(async () => {
    preferencesRef.current.camera = true;
    await restoreMedia('manual');
  }, [restoreMedia]);

  return {
    isReconnecting,
    isCameraSuspended,
    isOffline,
    reactivateCamera,
    handleRoomError,
  };
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

/** La rete è caduta: LiveKit riconnette da solo, ma va detto perché si è fermo. */
export function OfflineNotice() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-notice"
      className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg"
    >
      Sei offline: riconnessione appena torna la rete.
    </div>
  );
}

/**
 * La camera è ferma e il ripristino automatico non è bastato.
 *
 * Compare solo quando l'utente vuole la camera accesa e non lo è: è l'unico
 * stato in cui c'è davvero qualcosa da fare, e il pulsante fa esattamente
 * quella cosa invece di rimandare l'utente nelle impostazioni.
 */
export function CameraSuspendedNotice({
  onReactivate,
}: {
  onReactivate: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="camera-suspended-notice"
      className="absolute left-1/2 top-3 z-20 flex w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col gap-2 rounded-2xl bg-gray-950/90 px-4 py-3 text-sm text-white shadow-lg ring-1 ring-white/15"
    >
      <p className="font-semibold">Videocamera in pausa</p>
      <p className="text-white/70">
        Il telefono l’ha sospesa quando sei uscito dalla pagina. L’audio è
        rimasto attivo.
      </p>
      <button
        type="button"
        disabled={retrying}
        onClick={async () => {
          setRetrying(true);
          try {
            await onReactivate();
          } finally {
            setRetrying(false);
          }
        }}
        className="mt-1 rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
      >
        {retrying ? 'Riattivazione…' : 'Riattiva videocamera'}
      </button>
    </div>
  );
}

/**
 * Istruzione preventiva sui telefoni.
 *
 * Il wake lock copre il blocco schermo dove esiste, ma nessuna API può
 * impedire all'utente di cambiare applicazione: lì l'unico strumento è dirlo
 * prima. Si mostra per pochi secondi all'ingresso — un avviso permanente
 * verrebbe letto una volta e poi ignorato, rubando spazio allo schermo per
 * tutta la sessione.
 */
export function ScreenLockHint({ seconds = 8 }: { seconds?: number }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), seconds * 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  if (!visible) return null;

  return (
    <div
      role="status"
      data-testid="screen-lock-hint"
      className="pointer-events-none absolute bottom-24 left-1/2 z-20 w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl bg-gray-950/85 px-4 py-3 text-center text-xs text-white/85 shadow-lg ring-1 ring-white/10"
    >
      Durante la sessione non bloccare lo schermo e non cambiare applicazione:
      la videocamera verrebbe sospesa dal telefono.
    </div>
  );
}
