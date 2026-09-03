/**
 * Che cosa dire a chi ha appena visto una schermata bianca.
 *
 * Nasce da uno screenshot: un telefono in EDGE, e in mezzo alla pagina
 * «Application error: a client-side exception has occurred while loading
 * sport-mental-coach-arge.vercel.app (see the browser console for more
 * information)». È il fallback nudo di Next, quello che compare quando **non
 * esiste nessun error boundary** — e in questo progetto non ne esisteva
 * nessuno.
 *
 * Il problema non è estetico. Quel testo nomina un dominio interno, parla di
 * console del browser a chi non l'aprirà mai, ed è in inglese dentro un
 * prodotto italiano: sembra il sistema che si rompe, e chi lo legge conclude
 * che il difetto sia nostro anche quando è la sua rete.
 *
 * **Tre situazioni diverse, e non si devono raccontare allo stesso modo.**
 * Dire «controlla la connessione» a chi ha un errore vero dell'applicazione è
 * scaricare la colpa; dire «si è verificato un errore» a chi è offline è
 * nascondere una cosa che quella persona può risolvere in un secondo. La
 * differenza si legge dai segnali, non si indovina.
 *
 * Modulo puro: nessun accesso al DOM — `online` arriva da fuori — quindi si
 * prova senza browser.
 */

export type ClientFailureKind =
  /** Il dispositivo dichiara di non avere rete. */
  | 'offline'
  /** Un pezzo dell'applicazione non è arrivato: rete lenta, o versione nuova. */
  | 'caricamento'
  /** Tutto il resto: un errore vero, di cui rispondiamo noi. */
  | 'applicazione';

export type ClientFailure = {
  kind: ClientFailureKind;
  title: string;
  body: string;
  /** L'etichetta del gesto principale. */
  actionLabel: string;
  /**
   * Vero quando ricaricare risolve davvero.
   *
   * Non è un dettaglio di implementazione: `reset()` di Next rimonta l'albero
   * con lo stesso codice già scaricato, e su un pezzo che non è mai arrivato
   * non serve a niente. Un pulsante che non risolve, premuto due volte,
   * insegna che l'applicazione è rotta.
   */
  reloadFixes: boolean;
  /**
   * Vero quando possiamo dirlo con onestà: niente era in corso di invio.
   *
   * Su un errore applicativo generico non lo sappiamo, e rassicurare a vuoto
   * è peggio che tacere.
   */
  dataIsSafe: boolean;
  /** L'identificativo che ritrova l'errore nei log. `null` quando non c'è. */
  digest: string | null;
};

/**
 * I modi in cui i browser dicono «non ho caricato quel pezzo di codice».
 *
 * Cinque frasi diverse per la stessa cosa, perché ogni motore e ogni
 * bundler la scrive a modo suo. Il confronto è su sottostringa e senza
 * distinzione di maiuscole: un elenco di uguaglianze esatte invecchia alla
 * prima versione di Next.
 */
const LOADING_SIGNATURES = [
  'chunkloaderror',
  'loading chunk',
  'loading css chunk',
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'failed to load script',
  'networkerror when attempting to fetch resource',
];

function looksLikeLoadingFailure(name: string, message: string): boolean {
  const haystack = `${name} ${message}`.toLowerCase();
  return LOADING_SIGNATURES.some((signature) => haystack.includes(signature));
}

export function classifyClientFailure(input: {
  name?: string | null;
  message?: string | null;
  digest?: string | null;
  /** `navigator.onLine`. `undefined` quando non lo sappiamo. */
  online?: boolean;
}): ClientFailure {
  const digest = input.digest?.trim() ? input.digest.trim() : null;

  if (input.online === false) {
    return {
      kind: 'offline',
      title: 'Sei senza connessione',
      body: 'Il telefono dice di non avere rete, quindi la pagina non è riuscita a caricarsi. Non è successo niente ai tuoi dati: appena torni online riprendi da dove eri.',
      actionLabel: 'Riprova',
      reloadFixes: true,
      dataIsSafe: true,
      digest,
    };
  }

  if (looksLikeLoadingFailure(input.name ?? '', input.message ?? '')) {
    return {
      kind: 'caricamento',
      title: 'Non siamo riusciti a caricare tutto',
      /*
       * Due cause, e non sappiamo quale: una parte del codice non è arrivata
       * per via della rete, oppure abbiamo pubblicato una versione nuova
       * mentre la pagina era aperta e il pezzo che il browser cercava non
       * esiste più. Ricaricare risolve entrambe, quindi non serve fingere di
       * saperlo — serve dire il gesto giusto.
       */
      body: 'Una parte dell’app non è arrivata: succede con la connessione lenta, o quando pubblichiamo un aggiornamento mentre la pagina è aperta. Ricaricare basta. I tuoi dati non sono stati toccati.',
      actionLabel: 'Ricarica la pagina',
      reloadFixes: true,
      dataIsSafe: true,
      digest,
    };
  }

  return {
    kind: 'applicazione',
    title: 'Qualcosa non ha funzionato',
    /*
     * «L'errore e' gia' stato registrato» era la prima versione, ed era
     * falsa: in questo progetto non esiste nessun raccoglitore di errori
     * client, e un'eccezione nel browser non arriva da nessuna parte.
     * Promettere un tracciamento che non c'e' e' il modo piu' rapido per far
     * smettere una persona di segnalare le cose — aspetta che ce ne
     * accorgiamo noi, e non succede.
     */
    body: 'Non è la tua connessione: il problema è da questa parte. Riprova, e se continua a succedere segnalacelo — descrivere cosa stavi facendo ci serve, perché un errore nel browser non ci arriva da solo.',
    actionLabel: 'Riprova',
    // `reset()` rimonta l'albero: ha senso qui, dove il codice c'e' tutto.
    reloadFixes: false,
    dataIsSafe: false,
    digest,
  };
}
