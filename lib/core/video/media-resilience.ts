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

/**
 * Se la sorgente ha smesso di produrre e va riaperta dal sistema.
 *
 * `ended` è solo il caso più visibile. Tornando da un'altra app un telefono
 * lascia quasi sempre la traccia "viva" ma sospesa — `MediaStreamTrack.muted`
 * a `true`, che è una proprietà di sola lettura decisa dal sistema operativo —
 * oppure disabilitata. In tutti questi casi l'unico rimedio è ri-acquisirla.
 */
function needsReacquisition(track: MediaStreamTrack | undefined): boolean {
  if (!track) return false;
  return track.readyState !== 'live' || track.muted || !track.enabled;
}

/**
 * Rimette in funzione una sorgente locale.
 *
 * L'ordine conta, e non è intercambiabile. `unmute()` di LiveKit ri-apre il
 * dispositivo solo per il microfono: per la camera si limita a rimettere
 * `enabled = true`, che su una traccia sospesa dal sistema non riporta un solo
 * fotogramma. Per questo prima si ri-acquisisce la sorgente e poi si toglie il
 * muto — e servono entrambe, perché `restartTrack()` lascia la pubblicazione
 * in muto e l'altra persona continuerebbe a non vedere nulla.
 *
 * C'è anche un motivo per cui non basta lasciar fare alla libreria: LiveKit
 * ri-acquisisce da sé al rientro in primo piano, ma solo su tracce non in
 * muto. Mettendo la camera in pausa in background — cosa che si fa apposta,
 * per non mostrare un fotogramma congelato — quel recupero automatico non
 * scatta più, e tocca a noi.
 */
async function restorePublication(
  room: Room,
  source: Track.Source.Camera | Track.Source.Microphone
): Promise<boolean> {
  const publication = getPublication(room, source);
  if (!needsRestore(publication)) return false;

  const localTrack = publication?.track;
  const mediaTrack = localTrack?.mediaStreamTrack;

  if (localTrack && needsReacquisition(mediaTrack)) {
    await localTrack.restartTrack();
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
 * Quando ritentare il ripristino della camera, tornando in primo piano.
 *
 * Un solo tentativo, immediato, è quello con meno probabilità di riuscire:
 * l'app da cui si sta tornando può non aver ancora rilasciato il dispositivo,
 * e su Android questo è il caso normale, non l'eccezione. Il primo tentativo
 * fallisce, compare l'avviso «Videocamera in pausa», e l'utente si ritrova a
 * premere un pulsante per una cosa che si sarebbe risolta da sola in mezzo
 * secondo.
 *
 * Tre tentativi in poco più di un secondo e mezzo. Oltre non ha senso: se
 * dopo un secondo e mezzo la camera non è tornata, il motivo non è più il
 * tempo — è un permesso revocato o un dispositivo occupato, e lì l'unica cosa
 * onesta è dirlo e offrire il pulsante.
 */
export const CAMERA_RESTORE_DELAYS_MS = [0, 350, 1200] as const;

export type RestoreAttempt = {
  /** Quanti tentativi sono già stati fatti. */
  attempt: number;
  /** La camera sta producendo immagine adesso. */
  cameraLive: boolean;
  /** L'utente vuole la camera accesa. */
  cameraWanted: boolean;
};

/**
 * L'attesa prima del prossimo tentativo, oppure `null` se non se ne fanno più.
 *
 * Pura di proposito: la sequenza dei tentativi è la parte che si può sbagliare
 * senza che nessun errore lo dica — un ciclo che non termina, o che rinuncia
 * al primo colpo — e sbagliarla si paga con una camera spenta durante una
 * seduta vera.
 */
export function nextRestoreDelayMs(state: RestoreAttempt): number | null {
  if (!state.cameraWanted) return null;
  if (state.cameraLive) return null;
  if (state.attempt >= CAMERA_RESTORE_DELAYS_MS.length) return null;
  return CAMERA_RESTORE_DELAYS_MS[state.attempt] ?? null;
}

/**
 * Se in questo momento la camera sta davvero producendo immagine.
 *
 * Serve a distinguere "ripristino tentato" da "ripristino riuscito": dopo un
 * rientro dal secondo piano il browser può rifiutare di riavviare la cattura
 * (permesso revocato, dispositivo occupato da un'altra app), e in quel caso
 * l'utente va avvisato invece di essere lasciato a parlare a una camera spenta.
 */
export function isCameraLive(room: Room): boolean {
  const publication = getPublication(room, Track.Source.Camera);
  return !needsRestore(publication);
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
