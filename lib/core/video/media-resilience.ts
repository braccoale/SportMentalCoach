import {
  ConnectionState,
  Track,
  type LocalTrackPublication,
  type Room,
} from 'livekit-client';

export type LocalMediaPreferences = {
  camera: boolean;
  microphone: boolean;
};

export type LocalMediaRestoreResult = {
  camera: boolean;
  microphone: boolean;
};

function getPublication(room: Room, source: Track.Source) {
  return room.localParticipant.getTrackPublication(source);
}

function needsRestore(publication: LocalTrackPublication | undefined): boolean {
  const mediaTrack = publication?.track?.mediaStreamTrack;
  return (
    !publication ||
    !mediaTrack ||
    publication.isMuted ||
    mediaTrack.readyState === 'ended' ||
    !mediaTrack.enabled
  );
}

async function restorePublication(
  room: Room,
  source: Track.Source.Camera | Track.Source.Microphone
): Promise<boolean> {
  const publication = getPublication(room, source);
  if (!needsRestore(publication)) return false;

  const localTrack = publication?.track;
  if (localTrack?.mediaStreamTrack.readyState === 'ended') {
    await localTrack.restartTrack();
    return true;
  }

  if (source === Track.Source.Camera) {
    await room.localParticipant.setCameraEnabled(true);
  } else {
    await room.localParticipant.setMicrophoneEnabled(true);
  }
  return true;
}

/**
 * Mette in pausa la camera quando la pagina va in secondo piano.
 *
 * Perché serve. Su mobile il browser sospende la cattura video appena l'utente
 * cambia app: la traccia resta pubblicata ma smette di produrre fotogrammi, e
 * l'altra persona vede un'immagine congelata mentre continua a sentire la voce.
 * È l'esito peggiore: sembra un difetto della piattaforma, e chi guarda non
 * capisce se l'interlocutore c'è ancora.
 *
 * Non è aggirabile — nessuna pagina web può tenere viva la telecamera in
 * secondo piano, ed è una scelta di privacy dei browser, non un limite tecnico
 * da superare. Quello che si può fare è dirlo: mettendo in muto la traccia,
 * LiveKit informa l'altro lato e al posto del fotogramma congelato compare il
 * segnaposto del partecipante. Uno stato onesto invece di un'immagine che
 * mente.
 *
 * Il ritorno in primo piano non richiede nulla di nuovo:
 * `restoreLocalMediaIfNeeded` considera già una traccia in muto come da
 * ripristinare.
 */
export async function pauseCameraWhileHidden(room: Room): Promise<boolean> {
  if (room.state !== ConnectionState.Connected) return false;

  const publication = getPublication(room, Track.Source.Camera);
  const localTrack = publication?.track;
  // Già in muto: o l'ha fatto l'utente, o ci siamo già passati. In entrambi i
  // casi non c'è nulla da fare, e rimutare cancellerebbe l'intento dell'utente.
  if (!publication || !localTrack || publication.isMuted) return false;

  await localTrack.mute();
  return true;
}

/**
 * Restores only local media the user still intends to publish. It never
 * connects a room and never turns a user-muted device back on.
 */
export async function restoreLocalMediaIfNeeded(
  room: Room,
  preferences: Readonly<LocalMediaPreferences>
): Promise<LocalMediaRestoreResult> {
  const restored: LocalMediaRestoreResult = {
    camera: false,
    microphone: false,
  };
  if (room.state !== ConnectionState.Connected) return restored;

  const restoreTasks: Promise<void>[] = [];
  if (preferences.camera) {
    restoreTasks.push(
      restorePublication(room, Track.Source.Camera).then((didRestore) => {
        restored.camera = didRestore;
      })
    );
  }
  if (preferences.microphone) {
    restoreTasks.push(
      restorePublication(room, Track.Source.Microphone).then((didRestore) => {
        restored.microphone = didRestore;
      })
    );
  }
  await Promise.all(restoreTasks);
  return restored;
}

/**
 * Safe diagnostic snapshot: deliberately excludes token, server URL, identity,
 * participant names and media content.
 */
export function getLocalMediaDiagnostics(room: Room) {
  const cameraPublication = getPublication(room, Track.Source.Camera);
  const microphonePublication = getPublication(
    room,
    Track.Source.Microphone
  );
  const cameraTrack = cameraPublication?.track?.mediaStreamTrack;
  const microphoneTrack = microphonePublication?.track?.mediaStreamTrack;

  return {
    visibilityState:
      typeof document === 'undefined' ? 'unavailable' : document.visibilityState,
    roomState: room.state,
    localParticipantSid: room.localParticipant.sid || undefined,
    cameraPublished: Boolean(cameraPublication),
    cameraMuted: cameraPublication?.isMuted,
    cameraReadyState: cameraTrack?.readyState,
    cameraEnabled: cameraTrack?.enabled,
    microphonePublished: Boolean(microphonePublication),
    microphoneMuted: microphonePublication?.isMuted,
    microphoneReadyState: microphoneTrack?.readyState,
    microphoneEnabled: microphoneTrack?.enabled,
  };
}
