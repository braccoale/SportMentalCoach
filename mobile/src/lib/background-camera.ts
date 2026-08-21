/**
 * La fotocamera quando l'app esce di scena.
 *
 * Fino a oggi la regola era una sola e implicita: si va in secondo piano, si
 * spegne la telecamera. Era la scelta giusta finche' tenerla accesa era
 * impossibile — e non lo e' piu':
 *
 * - **iOS 18** concede l'accesso alla fotocamera fuori dal primo piano alle
 *   app di videoconferenza, quelle che dichiarano `voip` fra gli
 *   `UIBackgroundModes`. Lo si abilita con `enableMultitaskingCameraAccess`
 *   nel plugin Expo di LiveKit, che questo progetto ha gia' installato.
 * - **Android** lo concede a chi tiene attivo un foreground service di tipo
 *   `camera` — la notifica persistente che si vede durante una chiamata Meet.
 *   Quel servizio, in questo progetto, non esiste ancora.
 *
 * Le due condizioni sono diverse, arrivano in momenti diversi e possono
 * cambiare sotto i piedi: un utente su iOS 17, una build senza il servizio.
 * Per questo la decisione sta qui, in una funzione pura con i suoi test, e non
 * dentro un `useEffect` dove nessuno puo' leggerla senza un telefono in mano.
 *
 * Il microfono non compare in questo modulo, ed e' voluto: non si tocca in
 * nessuno dei due casi. Uscire un attimo dall'app per guardare qualcosa non
 * deve zittire chi sta parlando — e' la differenza fra posare il telefono e
 * riagganciare.
 */

/** La versione minima di iOS che concede la fotocamera in multitasking. */
export const IOS_MULTITASKING_CAMERA_MIN_VERSION = 18;

export type PlatformFacts = {
  os: string;
  /** `Platform.Version`: stringa su iOS ("18.1"), numero su Android (API level). */
  version: string | number;
  /** `ios.enableMultitaskingCameraAccess`, come dichiarato in `app.json`. */
  multitaskingCameraAccess: boolean;
  /** Il foreground service di tipo `camera` e' dichiarato **e** avviabile. */
  androidCameraService: boolean;
};

/**
 * La major di iOS da `Platform.Version`.
 *
 * Su iOS e' una stringa, e non sempre nella forma che ci si aspetta: "18",
 * "18.1", "18.1.1". Su Android e' un numero, e qui non significa niente.
 */
export function iosMajorVersion(version: string | number): number | null {
  const raw = typeof version === 'number' ? String(version) : version;
  const match = /^(\d+)/.exec(raw.trim());
  if (!match) return null;
  const major = Number(match[1]);
  return Number.isFinite(major) ? major : null;
}

/**
 * La piattaforma lascia riprendere mentre l'app non e' in primo piano.
 *
 * Nessuna delle due condizioni e' deducibile dall'altra, e nessuna delle due
 * si puo' dare per vera guardando il codice: dipendono da come la build e'
 * stata compilata e da che telefono la sta eseguendo.
 */
export function keepsCameraInBackground(facts: PlatformFacts): boolean {
  if (facts.os === 'ios') {
    if (!facts.multitaskingCameraAccess) return false;
    const major = iosMajorVersion(facts.version);
    return major !== null && major >= IOS_MULTITASKING_CAMERA_MIN_VERSION;
  }
  if (facts.os === 'android') {
    return facts.androidCameraService;
  }
  return false;
}

export type AppStatePhase = 'active' | 'background' | 'inactive' | string;

export type CameraAction =
  /** Spegnerla noi, perche' il sistema la sospenderebbe comunque. */
  | 'release'
  /** Riaccenderla: l'avevamo spenta noi. */
  | 'restore'
  /**
   * Controllare che stia ancora riprendendo davvero.
   *
   * E' il caso in cui la piattaforma *dice* di consentirlo ma il sistema si
   * riprende comunque la fotocamera — Android lo fa, sotto pressione di
   * memoria o se un'altra app la richiede. La traccia resta pubblicata e
   * l'altra persona guarda un fermo immagine credendo di essere vista.
   */
  | 'verify'
  | 'none';

export type CameraActionInput = {
  next: AppStatePhase;
  /** L'esito di `keepsCameraInBackground` per questa build e questo telefono. */
  keepsCapture: boolean;
  /** L'utente vuole la camera accesa (non l'ha spenta lui dal pulsante). */
  cameraWanted: boolean;
  /** L'avevamo spenta noi andando in secondo piano. */
  releasedByUs: boolean;
};

/**
 * Che cosa fare della fotocamera a ogni cambio di stato dell'app.
 *
 * `inactive` e' trattato come `background` di proposito: su iOS e' lo stato
 * del centro di controllo aperto, di una chiamata in arrivo, dello switcher —
 * e in tutti quei casi la fotocamera e' gia' sospesa dal sistema. Aspettare
 * `background` significherebbe accorgersene troppo tardi.
 */
export function cameraActionFor(input: CameraActionInput): CameraAction {
  const { next, keepsCapture, cameraWanted, releasedByUs } = input;

  if (next === 'background' || next === 'inactive') {
    if (!cameraWanted) return 'none';
    return keepsCapture ? 'none' : 'release';
  }

  if (next === 'active') {
    if (releasedByUs) return 'restore';
    if (keepsCapture && cameraWanted) return 'verify';
    return 'none';
  }

  return 'none';
}

/** Il nome del plugin Expo di LiveKit dentro `app.json`. */
export const LIVEKIT_EXPO_PLUGIN = '@livekit/react-native-expo-plugin';

export type LiveKitPluginFlags = {
  multitaskingCameraAccess: boolean;
  screenShareService: boolean;
};

/**
 * I flag del plugin, letti dalla configurazione invece che riscritti.
 *
 * `enableMultitaskingCameraAccess` vive in `app.json`, dove il plugin lo
 * trasforma in una chiave dell'Info.plist al momento della build. Il codice
 * JavaScript ha bisogno di sapere se quella build e' stata preparata o no, e
 * l'alternativa — un secondo flag in `extra`, scritto a mano accanto al primo —
 * e' la ricetta perfetta per una build in cui i due dicono cose diverse e
 * nessuno se ne accorge finche' un coach non si ritrova la camera spenta.
 *
 * Percio' si legge il plugin stesso, da `Constants.expoConfig.plugins`, dove
 * ogni voce e' un nome oppure una coppia `[nome, opzioni]`.
 */
export function readLiveKitPluginFlags(plugins: unknown): LiveKitPluginFlags {
  const fallback: LiveKitPluginFlags = {
    multitaskingCameraAccess: false,
    screenShareService: false,
  };
  if (!Array.isArray(plugins)) return fallback;

  for (const entry of plugins) {
    if (!Array.isArray(entry) || entry[0] !== LIVEKIT_EXPO_PLUGIN) continue;

    const options = entry[1];
    if (typeof options !== 'object' || options === null) return fallback;

    const ios = (options as { ios?: unknown }).ios;
    const android = (options as { android?: unknown }).android;

    return {
      multitaskingCameraAccess:
        typeof ios === 'object' &&
        ios !== null &&
        (ios as { enableMultitaskingCameraAccess?: unknown })
          .enableMultitaskingCameraAccess === true,
      screenShareService:
        typeof android === 'object' &&
        android !== null &&
        (android as { enableScreenShareService?: unknown })
          .enableScreenShareService === true,
    };
  }

  return fallback;
}
