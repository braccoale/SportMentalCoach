'use client';

import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useConnectionState,
  useRemoteParticipants,
  useRoomContext,
} from '@livekit/components-react';
import {
  ConnectionState,
  Track,
  createLocalVideoTrack,
  type LocalVideoTrack,
  type RemoteVideoTrack,
} from 'livekit-client';
import {
  Camera,
  CameraOff,
  DoorOpen,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  VideoOff,
} from 'lucide-react';
import type { KaiPaiCallChoices } from './livekit-call-controls';
import { KAIPAI_AUDIO_CAPTURE_DEFAULTS } from '@/lib/core/video/call-settings';
import type {
  ClientVideoEventType,
  TechnicalEventDetails,
} from '@/lib/core/video/technical-events';

type TechnicalEventHandler = (
  eventType: ClientVideoEventType,
  details?: TechnicalEventDetails
) => void;

type PictureInPictureVideo = HTMLVideoElement & {
  autoPictureInPicture?: boolean;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

type AutomaticPictureInPictureMediaSession = {
  setActionHandler: (
    action: 'enterpictureinpicture',
    handler: (() => void) | null
  ) => void;
};

function WaitingCameraPreview({
  track,
}: {
  track: LocalVideoTrack;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="aspect-video w-full rounded-2xl bg-black object-cover"
      aria-label="Anteprima privata della videocamera"
    />
  );
}

function standardPictureInPictureSupported() {
  return (
    typeof document !== 'undefined' &&
    'pictureInPictureEnabled' in document &&
    Boolean(document.pictureInPictureEnabled)
  );
}

type WebkitFullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function currentFullscreenElement(): Element | null {
  const fullscreenDocument = document as WebkitFullscreenDocument;
  return (
    document.fullscreenElement ??
    fullscreenDocument.webkitFullscreenElement ??
    null
  );
}

export function RoomFullscreenControl() {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const fullscreenDocument = document as WebkitFullscreenDocument;
    const update = () => {
      const element = currentFullscreenElement();
      setActive(
        element?.matches('[data-kaipai-video-shell]') ?? false
      );
    };
    const prototype = HTMLElement.prototype as WebkitFullscreenElement;
    setSupported(
      typeof prototype.requestFullscreen === 'function' ||
        typeof prototype.webkitRequestFullscreen === 'function'
    );
    update();
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, []);

  const toggle = async (
    event: MouseEvent<HTMLButtonElement>
  ) => {
    const shell = event.currentTarget.closest<HTMLElement>(
      '[data-kaipai-video-shell]'
    );
    if (!shell) return;

    const fullscreenDocument = document as WebkitFullscreenDocument;
    const fullscreenShell = shell as WebkitFullscreenElement;
    try {
      if (currentFullscreenElement()) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else {
          await Promise.resolve(
            fullscreenDocument.webkitExitFullscreen?.()
          );
        }
      } else if (fullscreenShell.requestFullscreen) {
        await fullscreenShell.requestFullscreen();
      } else {
        await Promise.resolve(
          fullscreenShell.webkitRequestFullscreen?.()
        );
      }
    } catch (error) {
      console.warn('[LiveKit] Fullscreen unavailable', error);
    }
  };

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={
        active
          ? 'Esci dalla modalità a schermo intero'
          : 'Mostra tutta la videochiamata a schermo intero'
      }
      aria-pressed={active}
      className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-xs font-medium text-white/85 hover:bg-black/65"
    >
      {active ? (
        <Minimize2 className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
      )}
      {active ? 'Riduci' : 'Schermo intero'}
    </button>
  );
}

export function PictureInPictureControl({
  onTechnicalEvent,
}: {
  onTechnicalEvent?: TechnicalEventHandler;
}) {
  const participants = useRemoteParticipants();
  const videoRef = useRef<PictureInPictureVideo>(null);
  const automaticPictureInPicture = useRef(false);
  const [active, setActive] = useState(false);
  const cameraTrack = useMemo(() => {
    for (const participant of participants) {
      const publication = participant.getTrackPublication(Track.Source.Camera);
      if (publication?.track) {
        return publication.track as RemoteVideoTrack;
      }
    }
    return undefined;
  }, [participants]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !cameraTrack) return;
    cameraTrack.attach(element);
    return () => {
      cameraTrack.detach(element);
    };
  }, [cameraTrack]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    const entered = () => {
      setActive(true);
      onTechnicalEvent?.('picture_in_picture_started');
    };
    const left = () => {
      setActive(false);
      automaticPictureInPicture.current = false;
      onTechnicalEvent?.('picture_in_picture_stopped');
    };
    element.addEventListener('enterpictureinpicture', entered);
    element.addEventListener('leavepictureinpicture', left);
    return () => {
      element.removeEventListener('enterpictureinpicture', entered);
      element.removeEventListener('leavepictureinpicture', left);
    };
  }, [onTechnicalEvent]);

  useEffect(() => {
    const element = videoRef.current;
    if (
      !element ||
      !cameraTrack ||
      !standardPictureInPictureSupported() ||
      !('mediaSession' in navigator)
    ) {
      return;
    }

    const mediaSession = navigator.mediaSession as unknown as
      AutomaticPictureInPictureMediaSession;
    const enterAutomatically = () => {
      const video = videoRef.current;
      if (!video || document.pictureInPictureElement) return;
      void video
        .requestPictureInPicture()
        .then(() => {
          automaticPictureInPicture.current = true;
        })
        .catch((error) => {
          console.info(
            '[LiveKit] Automatic Picture-in-Picture not allowed',
            error
          );
        });
    };
    const closeWhenVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        automaticPictureInPicture.current &&
        document.pictureInPictureElement === element
      ) {
        void document.exitPictureInPicture().catch(() => {});
      }
    };

    try {
      element.autoPictureInPicture = true;
      mediaSession.setActionHandler(
        'enterpictureinpicture',
        enterAutomatically
      );
    } catch {
      element.autoPictureInPicture = false;
      return;
    }
    document.addEventListener('visibilitychange', closeWhenVisible);
    return () => {
      element.autoPictureInPicture = false;
      document.removeEventListener(
        'visibilitychange',
        closeWhenVisible
      );
      try {
        mediaSession.setActionHandler('enterpictureinpicture', null);
      } catch {
        // The browser removed support while the page was active.
      }
    };
  }, [cameraTrack]);

  const supported = useMemo(() => {
    if (standardPictureInPictureSupported()) return true;
    const prototype = HTMLVideoElement.prototype as PictureInPictureVideo;
    return typeof prototype.webkitSetPresentationMode === 'function';
  }, []);

  const toggle = async () => {
    const element = videoRef.current;
    if (!element || !cameraTrack) return;
    try {
      if (standardPictureInPictureSupported()) {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await element.requestPictureInPicture();
        }
        return;
      }
      if (element.webkitSetPresentationMode) {
        const nextMode =
          element.webkitPresentationMode === 'picture-in-picture'
            ? 'inline'
            : 'picture-in-picture';
        element.webkitSetPresentationMode(nextMode);
        setActive(nextMode === 'picture-in-picture');
        onTechnicalEvent?.(
          nextMode === 'picture-in-picture'
            ? 'picture_in_picture_started'
            : 'picture_in_picture_stopped'
        );
      }
    } catch (error) {
      console.warn('[LiveKit] Picture-in-Picture unavailable', error);
    }
  };

  if (!supported) return null;

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="pointer-events-none fixed bottom-0 right-0 h-px w-px opacity-0"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={toggle}
        disabled={!cameraTrack}
        title={
          cameraTrack
            ? 'Mostra il video sopra le altre finestre'
            : 'Picture-in-Picture disponibile quando arriva il partecipante'
        }
        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-xs font-medium text-white/85 hover:bg-black/65 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <PictureInPicture2 className="h-4 w-4" aria-hidden="true" />
        {active ? 'Chiudi mini video' : 'Mini video'}
      </button>
    </>
  );
}

export function WaitingRoomGate({
  isCoach,
  coachIdentity,
  choices,
  children,
  onTechnicalEvent,
}: {
  isCoach: boolean;
  coachIdentity: string;
  choices: KaiPaiCallChoices;
  children: ReactNode;
  onTechnicalEvent?: TechnicalEventHandler;
}) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const remoteParticipants = useRemoteParticipants();
  const [admitted, setAdmitted] = useState(isCoach);
  const [previewRequested, setPreviewRequested] = useState(
    !isCoach && choices.videoEnabled
  );
  const [previewTrack, setPreviewTrack] =
    useState<LocalVideoTrack>();
  const [previewError, setPreviewError] = useState<string | null>(null);
  const admissionStarted = useRef(false);
  const waitingReported = useRef(false);
  const previewCreating = useRef(false);
  const previewTrackRef = useRef<LocalVideoTrack | undefined>(undefined);
  const coachPresent = remoteParticipants.some(
    (participant) => participant.identity === coachIdentity
  );

  useEffect(() => {
    previewTrackRef.current = previewTrack;
  }, [previewTrack]);

  useEffect(() => {
    if (
      isCoach ||
      admitted ||
      !previewRequested ||
      previewTrack ||
      previewCreating.current
    ) {
      return;
    }

    let cancelled = false;
    previewCreating.current = true;
    setPreviewError(null);
    void createLocalVideoTrack({
      deviceId: choices.videoDeviceId,
    })
      .then((track) => {
        if (cancelled) {
          track.stop();
          return;
        }
        setPreviewTrack(track);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewRequested(false);
          setPreviewError(
            'Impossibile avviare l’anteprima. Controlla i permessi della camera.'
          );
        }
      })
      .finally(() => {
        previewCreating.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [
    admitted,
    choices.videoDeviceId,
    isCoach,
    previewRequested,
    previewTrack,
  ]);

  useEffect(
    () => () => {
      previewTrackRef.current?.stop();
    },
    []
  );

  useEffect(() => {
    if (
      isCoach ||
      connectionState !== ConnectionState.Connected ||
      waitingReported.current
    ) {
      return;
    }
    waitingReported.current = true;
    onTechnicalEvent?.('waiting_room_entered');
  }, [connectionState, isCoach, onTechnicalEvent]);

  useEffect(() => {
    if (
      admitted ||
      isCoach ||
      !coachPresent ||
      connectionState !== ConnectionState.Connected ||
      (previewRequested && !previewTrack) ||
      admissionStarted.current
    ) {
      return;
    }
    admissionStarted.current = true;
    const existingCamera =
      room.localParticipant.getTrackPublication(Track.Source.Camera);
    const publishCamera = previewTrack && !existingCamera
      ? room.localParticipant.publishTrack(previewTrack, {
          source: Track.Source.Camera,
        })
      : Promise.resolve(existingCamera);
    void Promise.all([
      room.localParticipant.setMicrophoneEnabled(
        choices.audioEnabled,
        choices.audioEnabled
          ? {
              ...KAIPAI_AUDIO_CAPTURE_DEFAULTS,
              deviceId: choices.audioDeviceId,
            }
          : undefined
      ),
      publishCamera,
    ])
      .then(() => {
        setAdmitted(true);
        onTechnicalEvent?.('waiting_room_admitted');
      })
      .catch((error) => {
        admissionStarted.current = false;
        console.error('[LiveKit] Unable to publish after lobby admission', error);
      });
  }, [
    admitted,
    choices,
    coachPresent,
    connectionState,
    isCoach,
    onTechnicalEvent,
    previewRequested,
    previewTrack,
    room,
  ]);

  const leave = useCallback(() => {
    void room.disconnect();
  }, [room]);

  const disablePreview = useCallback(() => {
    previewTrack?.stop();
    setPreviewTrack(undefined);
    setPreviewRequested(false);
  }, [previewTrack]);

  return (
    <>
      {admitted ? (
        children
      ) : (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-950 p-3 text-white sm:p-5">
          <div className="max-h-[calc(100%-0.5rem)] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl sm:p-8">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/15 text-amber-300">
              {connectionState === ConnectionState.Connected ? (
                <DoorOpen className="h-7 w-7" />
              ) : (
                <VideoOff className="h-7 w-7" />
              )}
            </span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
              Sala d’attesa
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              {connectionState === ConnectionState.Connected
                ? 'In attesa del coach'
                : 'Connessione alla sala…'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Il microfono resta spento e l’anteprima video rimane privata.
              Entrerai automaticamente quando il coach sarà collegato.
            </p>
            <div className="mx-auto mt-5 h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-amber-400" />
            </div>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
              {previewTrack ? (
                <>
                  <WaitingCameraPreview track={previewTrack} />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-emerald-200">
                      Anteprima privata: gli altri partecipanti non possono
                      ancora vederti.
                    </p>
                    <button
                      type="button"
                      onClick={disablePreview}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/10"
                    >
                      <CameraOff className="h-3.5 w-3.5" />
                      Disattiva anteprima
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setPreviewRequested(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/15"
                >
                  <Camera className="h-4 w-4" />
                  Attiva anteprima privata
                </button>
              )}
              {previewError && (
                <p className="mt-2 text-xs text-amber-200">
                  {previewError}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={leave}
              className="mt-6 rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
            >
              Esci dalla sala
            </button>
          </div>
        </div>
      )}
    </>
  );
}
