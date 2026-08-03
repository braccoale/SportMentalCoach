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
