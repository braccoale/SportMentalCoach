import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Il foreground service della chiamata (solo Android).
 *
 * `requireOptionalNativeModule` restituisce `null` dove il modulo non e' stato
 * compilato — su iOS, e su qualunque build precedente alla sua introduzione.
 * È deliberatamente la versione "optional": una build vecchia che carica un
 * aggiornamento OTA nuovo non deve andare in crash sul primo import, deve
 * semplicemente comportarsi come si e' sempre comportata.
 */
type CallForegroundNativeModule = {
  start(title: string, body: string): Promise<void>;
  stop(): Promise<void>;
};

const native = requireOptionalNativeModule<CallForegroundNativeModule>(
  'CallForeground'
);

export const callForeground = {
  /**
   * Il servizio esiste in questa build.
   *
   * È l'unica prova accettabile che la fotocamera possa restare accesa in
   * secondo piano su Android: il permesso nel manifest non basta, e nemmeno
   * la versione del sistema.
   */
  isAvailable: native !== null,

  async start(title: string, body: string): Promise<boolean> {
    if (!native) return false;
    try {
      await native.start(title, body);
      return true;
    } catch {
      // Il servizio puo' rifiutarsi di partire: notifiche negate, oppure
      // l'app non era in primo piano nell'istante della chiamata (Android lo
      // vieta). Non e' un errore da mostrare durante una sessione: significa
      // solo che in secondo piano la fotocamera si spegnera' come prima.
      return false;
    }
  },

  async stop(): Promise<void> {
    if (!native) return;
    try {
      await native.stop();
    } catch {
      // Fermare due volte non e' un problema.
    }
  },
};
