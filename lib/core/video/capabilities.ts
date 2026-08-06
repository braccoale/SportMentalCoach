/**
 * Decisioni pure su quali comandi mostrare durante una videochiamata.
 *
 * Qui dentro non si accede al DOM: queste funzioni ricevono le capability già
 * rilevate (vedi `capabilities-client.ts`) e il fatto che il layout sia
 * compatto, e rispondono con l'elenco ordinato di ciò che va reso visibile.
 * Tenerle pure è ciò che le rende verificabili senza un browser.
 */

/** Layout compatto: schermo stretto oppure puntatore touch. */
export const COMPACT_MEDIA_QUERY = '(max-width: 767px), (pointer: coarse)';

export type CallCapabilities = {
  /** Il browser sa dirigere l'audio su un'uscita scelta (`setSinkId`). */
  audioOutputSelection: boolean;
  /** Picture-in-Picture disponibile. */
  pictureInPicture: boolean;
  /** Sfocatura e sfondi virtuali eseguibili. */
  backgroundProcessors: boolean;
  /** L'elemento può essere portato a schermo intero. */
  fullscreen: boolean;
  /** Safari su iOS/iPadOS: vincoli propri su audio e PiP. */
  isIosSafari: boolean;
};

export type InAppBrowserSeverity = 'blocking' | 'warning';

export type InAppBrowser = {
  /** Nome dell'app che ospita la pagina, da mostrare all'utente. */
  label: string;
  /**
   * `blocking` quando la videochiamata lì dentro non può funzionare,
   * `warning` quando funziona ma con difetti frequenti.
   */
  severity: InAppBrowserSeverity;
  /** Come uscirne, nelle parole dell'app ospite. */
  howToExit: string;
};

/**
 * Firme dei browser interni: frammenti di user-agent che quelle app aggiungono
 * al proprio WebView. È l'unico modo per riconoscerli — nessuna feature
 * detection distingue un WebView dal browser di sistema prima di aver già
 * chiesto camera e microfono, cioè troppo tardi per avvisare.
 */
const IN_APP_SIGNATURES: { label: string; patterns: RegExp[] }[] = [
  { label: 'Instagram', patterns: [/Instagram/i] },
  { label: 'Facebook', patterns: [/FBAN|FBAV|FB_IAB|FB4A/i] },
  // Il confine iniziale evita che "MicroMessenger" (WeChat) finisca qui.
  { label: 'Messenger', patterns: [/(?:^|[^A-Za-z])Messenger(?:Lite)?\//i] },
  { label: 'TikTok', patterns: [/musical_ly|BytedanceWebview|Bytedance/i] },
  { label: 'Threads', patterns: [/Barcelona\//i] },
  { label: 'Snapchat', patterns: [/Snapchat/i] },
  { label: 'LinkedIn', patterns: [/LinkedInApp/i] },
  { label: 'X (Twitter)', patterns: [/Twitter(?:Android)?/i] },
  { label: 'WhatsApp', patterns: [/WhatsApp/i] },
  { label: 'WeChat', patterns: [/MicroMessenger/i] },
  { label: 'LINE', patterns: [/\bLine\//i] },
  { label: 'Pinterest', patterns: [/Pinterest/i] },
];

/** iOS/iPadOS: lì il WebView delle app social non concede camera e microfono. */
function looksLikeIos(userAgent: string): boolean {
  return /iPad|iPhone|iPod/i.test(userAgent);
}

/**
 * Riconosce il browser interno di un'app che sta ospitando la pagina.
 *
 * Aprire un link da Instagram o Facebook non apre Safari o Chrome: apre un
 * WebView dell'app, che su iOS non ha accesso a camera e microfono e su Android
 * lo perde spesso a metà chiamata. È il modo più comune in cui una sessione
 * fallisce senza che l'utente capisca perché, e l'unico rimedio è aprire il
 * link nel browser di sistema. Restituisce `null` per i browser veri.
 */
export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
  if (!userAgent) return null;

  for (const signature of IN_APP_SIGNATURES) {
    if (!signature.patterns.some((pattern) => pattern.test(userAgent))) {
      continue;
    }
    const ios = looksLikeIos(userAgent);
    return {
      label: signature.label,
      severity: ios ? 'blocking' : 'warning',
      howToExit: ios
        ? `Tocca i tre puntini in alto a destra e scegli "Apri in Safari": dentro ${signature.label} il browser non può usare camera e microfono.`
        : `Tocca i tre puntini in alto a destra e scegli "Apri in Chrome": dentro ${signature.label} camera e microfono possono interrompersi durante la sessione.`,
    };
  }
  return null;
}

export type RoomControl =
  | 'exit'
  | 'flip-camera'
  | 'fullscreen'
  | 'picture-in-picture'
  | 'connection-quality'
  | 'share';

export type AdvancedSection =
  | 'microphone'
  | 'camera'
  | 'speaker-select'
  | 'speaker-test'
  | 'backgrounds'
  | 'network';

/**
 * Comandi della barra superiore della stanza, in ordine di visualizzazione.
 *
 * Su compatto lo schermo intero è già attivo (la stanza occupa tutto il
 * viewport), quindi il pulsante sparisce e al suo posto compare un'uscita
 * esplicita: il link "Torna alla dashboard" non è più raggiungibile.
 */
export function visibleRoomControls(
  caps: CallCapabilities,
  compact: boolean
): RoomControl[] {
  const controls: RoomControl[] = [];
  if (compact) controls.push('exit');
  // Invertire la fotocamera ha senso solo dove esiste un davanti e un dietro:
  // su desktop la scelta fra più webcam resta nelle impostazioni.
  if (compact) controls.push('flip-camera');
  if (!compact && caps.fullscreen) controls.push('fullscreen');
  if (caps.pictureInPicture) controls.push('picture-in-picture');
  controls.push('connection-quality');
  controls.push('share');
  return controls;
}

/**
 * Sezioni del pannello impostazioni avanzate, in ordine di visualizzazione.
 *
 * La prova altoparlante resta anche dove la *scelta* dell'uscita non è
 * supportata: sentire il suono di prova è utile comunque, ed è spesso l'unico
 * modo che l'utente ha per accorgersi che il telefono è in silenzioso.
 */
export function visibleAdvancedSections(
  caps: CallCapabilities
): AdvancedSection[] {
  const sections: AdvancedSection[] = ['microphone', 'camera'];
  if (caps.audioOutputSelection) sections.push('speaker-select');
  sections.push('speaker-test');
  if (caps.backgroundProcessors) sections.push('backgrounds');
  sections.push('network');
  return sections;
}
