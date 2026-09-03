/**
 * Che cosa vuol dire un codice d'errore, e se è il caso di fare qualcosa.
 *
 * Nasce da una schermata che diceva «Degradato · 60 fallimenti su 159» e da
 * una domanda legittima: *e allora?* Un conteggio non dice né quale problema
 * sia, né se dipenda da noi. `COMPASS_TIMEOUT` e `NO_SPEECH_DETECTED` sono
 * entrambi «fallimenti» e sono opposti: il primo è nostro e si recupera, il
 * secondo è una seduta in cui nessuno ha parlato e non c'è niente da
 * recuperare.
 *
 * **Il suggerimento descrive, non consiglia.** «È concentrato su una persona»
 * si legge dai dati; «riavvia il servizio» sarebbe un consiglio inventato, e
 * un pannello che ne dà uno sbagliato una volta non viene più creduto.
 *
 * Un codice sconosciuto non rompe niente: torna sé stesso e un suggerimento
 * che dice onestamente che non lo conosciamo. Nuovi codici compaiono, e il
 * pannello non è il posto dove scoprirlo con un errore.
 *
 * Modulo puro: si prova senza database.
 */

export type CauseDescription = { label: string; hint: string };

/** Eventi tecnici della videochiamata che contano come problema. */
const VIDEO: Record<string, CauseDescription> = {
  media_device_error: {
    label: 'Errore dispositivo',
    hint: 'Camera o microfono di chi era in chiamata: il browser ha rifiutato il permesso o il dispositivo non risponde. Si risolve sulla postazione, non sulla piattaforma.',
  },
  participant_connection_aborted: {
    label: 'Connessione interrotta',
    hint: 'Il partecipante ha perso la rete prima di entrare davvero. Se capita a molte persone diverse guarda LiveKit; se capita sempre alle stesse, guarda la loro rete.',
  },
  krisp_error: {
    label: 'Errore filtro rumore',
    hint: 'Il filtro anti-rumore non è partito. La chiamata funziona lo stesso: è una degradazione dell’audio, non un’interruzione.',
  },
};

/** Codici che la pipeline Appunti AI sa produrre. */
const AI: Record<string, CauseDescription> = {
  NO_SPEECH_DETECTED: {
    label: 'Nessun parlato',
    hint: 'C’era audio ma nessuna parola: prova a microfono spento, o seduta di pochi secondi. Non è un guasto e non si recupera.',
  },
  NO_AUDIO_RECORDED: {
    label: 'Nessuna registrazione',
    hint: 'La trascrizione non è mai stata chiamata perché non è arrivato audio: la causa è a monte, nella registrazione o nella chiamata.',
  },
  TRANSCRIPTION_INCOMPLETE: {
    label: 'Trascrizione incompleta',
    hint: 'Il fornitore non ha restituito tutto entro la scadenza. Stato terminale: il materiale manca e riaprire non produrrebbe nulla.',
  },
  REPORT_NOT_GENERATED: {
    label: 'Riepilogo mai generato',
    hint: 'La trascrizione di solito è ancora in tabella: è il caso — l’unico — in cui la seduta si può riprendere dal dettaglio.',
  },
  COMPASS_TIMEOUT: {
    label: 'Riepilogo oltre tempo',
    hint: 'La generazione ha superato il limite della funzione. Ogni generazione gira all’85–95% del budget, quindi non è un’anomalia della singola seduta: si riprende, e di solito passa.',
  },
  PROCESSING_FAILED: {
    label: 'Errore generico di elaborazione',
    hint: 'Il motivo vero non è stato classificato: il codice esatto sta nel registro di audit della seduta, non su questa riga.',
  },
  EGRESS_FAILED: {
    label: 'Registrazione fallita',
    hint: 'LiveKit non ha consegnato il file. Il messaggio del fornitore è nel dettaglio della seduta ed è la differenza fra leggere la causa e indovinarla.',
  },
  EGRESS_START_FAILED: {
    label: 'Registrazione mai partita',
    hint: 'LiveKit ha rifiutato l’avvio: la seduta non ha mai avuto audio, e la causa e’ prima della registrazione. Due avvii troppo ravvicinati bastano a farlo — il messaggio del fornitore nel dettaglio lo dice.',
  },
  RECORDING_NOT_READY: {
    label: 'Registrazione non pronta',
    hint: 'La conferma dell’egress non è mai arrivata: è la causa più comune di una seduta senza audio.',
  },
  UNVERIFIED_PARTICIPANT_PRESENT: {
    label: 'Partecipante non verificato',
    hint: 'La registrazione è stata bloccata perché in stanza c’era qualcuno di non identificato. Ha funzionato come doveva: non è un guasto.',
  },
  NOT_ENTITLED: {
    label: 'Funzione non abilitata',
    hint: 'Gli Appunti AI non erano attivi per quell’utente. Non è un errore della pipeline.',
  },
  SENZA_CODICE: {
    label: 'Senza codice',
    hint: 'La seduta è finita male senza che nessuno abbia scritto perché. Il registro di audit della seduta di solito lo sa.',
  },
};

/**
 * La descrizione di una causa, per servizio.
 *
 * `servizio` decide il vocabolario: lo stesso codice non compare in due
 * domini, ma tenerli separati evita che il primo che collide ne sovrascriva
 * un altro in silenzio.
 */
export function describeCause(servizio: string, code: string): CauseDescription {
  const known =
    servizio === 'videochiamate' ? VIDEO[code] : servizio === 'email' ? undefined : AI[code];
  if (known) return known;

  if (servizio === 'email') {
    return {
      label: code,
      hint: 'Modello di email che non è stato consegnato. Il motivo per singola consegna è nel registro delle consegne.',
    };
  }

  return {
    label: code,
    hint: 'Codice non ancora descritto qui: cercalo nel registro di audit della seduta, e se ricorre vale la pena aggiungerlo.',
  };
}
