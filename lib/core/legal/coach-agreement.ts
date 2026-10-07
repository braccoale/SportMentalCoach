import { createHash } from 'node:crypto';

/**
 * Contratto di Adesione Coach — il documento che un coach firma prima di
 * poter pubblicare il profilo e accettare prenotazioni.
 *
 * Tenuto come dato e non come JSX per la stessa ragione di `processors.ts`:
 * i numeri economici e l'elenco delle clausole vessatorie devono avere una
 * sola fonte. La pagina pubblica, lo step di firma e l'elenco ex art. 1341
 * derivano tutti da qui, quindi non possono divergere.
 *
 * ATTENZIONE: questo NON è testo legale definitivo. Struttura e clausole sono
 * state validate a livello di prodotto; il testo va rivisto da un avvocato
 * prima della messa online.
 *
 * Quando cambi qualcosa di sostanziale, BUMPA `version`: i coach che hanno
 * firmato la versione precedente verranno riportati sullo step di firma.
 */
export type AgreementSection = {
  /** Stabile: finisce nell'elenco ex art. 1341 e nelle ancore della pagina. */
  id: string;
  title: string;
  /** Un elemento per paragrafo. */
  body: string[];
  /**
   * True per le clausole che l'art. 1341 c.c. richiede di approvare
   * specificamente e per iscritto. Senza la seconda spunta dedicata queste
   * clausole sono inefficaci — è l'errore più comune e il più costoso.
   */
  vexatious: boolean;
};

export type CoachAgreement = {
  version: string;
  effectiveDate: string;
  commissionPercent: number;
  nonCircumventionMonths: number;
  penaltyAmountEur: number;
  buyoutMonths: number;
  noticeDays: number;
  sections: AgreementSection[];
};

const COMMISSION_PERCENT = 20;
const NON_CIRCUMVENTION_MONTHS = 18;
const PENALTY_EUR = 500;
const BUYOUT_MONTHS = 3;
const NOTICE_DAYS = 30;

export const COACH_AGREEMENT: CoachAgreement = {
  version: '2026-07-1',
  effectiveDate: '22 luglio 2026',
  commissionPercent: COMMISSION_PERCENT,
  nonCircumventionMonths: NON_CIRCUMVENTION_MONTHS,
  penaltyAmountEur: PENALTY_EUR,
  buyoutMonths: BUYOUT_MONTHS,
  noticeDays: NOTICE_DAYS,
  sections: [
    {
      id: 'natura-del-rapporto',
      title: '1. Natura del rapporto',
      vexatious: false,
      body: [
        'KaiPai è un intermediario tecnologico: mette a disposizione una piattaforma che consente ad atleti e coach di incontrarsi, concordare e svolgere sessioni di mental coaching. KaiPai non è datore di lavoro, non è committente e non esercita alcun potere direttivo, disciplinare o di controllo sull’attività professionale del Coach.',
        'Il Coach opera come professionista autonomo: sceglie liberamente i propri orari, i propri metodi e i propri prezzi, resta titolare del proprio regime fiscale e previdenziale, ed emette autonomamente i documenti fiscali dovuti verso l’Atleta o verso KaiPai secondo quanto previsto dal presente contratto.',
        'Il Coach dichiara di essere in possesso dei titoli, delle qualifiche e delle abilitazioni che dichiara sul proprio profilo, e di mantenere attiva una copertura assicurativa per la responsabilità civile professionale adeguata all’attività svolta.',
        'Il presente contratto non costituisce rapporto di lavoro subordinato, di collaborazione coordinata e continuativa, di agenzia né di associazione in partecipazione.',
      ],
    },
    {
      id: 'commissione',
      title: '2. Commissione della piattaforma',
      vexatious: false,
      body: [
        `Per ogni sessione prenotata tramite la piattaforma, KaiPai trattiene una commissione pari al ${COMMISSION_PERCENT}% del prezzo lordo della sessione. La commissione remunera l’intermediazione, l’infrastruttura tecnica (calendario, videochiamata, messaggistica, pagamenti) e l’attività di acquisizione degli atleti.`,
        'La commissione si applica a tutte le sessioni svolte con un Atleta conosciuto tramite la piattaforma, comprese quelle successive alla prima, per tutta la durata prevista dall’articolo 4 (Non elusione).',
        'Il corrispettivo netto è accreditato al Coach secondo i termini di pagamento indicati nell’area riservata, a seguito del completamento della sessione e salvo contestazioni o richieste di rimborso in corso.',
        `KaiPai può modificare la misura della commissione dandone comunicazione scritta al Coach con almeno ${NOTICE_DAYS} giorni di preavviso. Entro tale termine il Coach può recedere dal presente contratto senza oneri, con effetto dalla data di efficacia della modifica. La prosecuzione dell’attività sulla piattaforma dopo tale data vale come accettazione.`,
        'Il Coach si impegna a non offrire, sui propri canali diretti e nei confronti di Atleti conosciuti tramite la piattaforma, il medesimo servizio a condizioni economiche più favorevoli di quelle pubblicate su KaiPai. L’impegno è limitato a tale ambito e non riguarda gli altri canali, i clienti propri del Coach né le condizioni praticate al di fuori di essi.',
      ],
    },
    {
      id: 'obblighi-di-servizio',
      title: '3. Obblighi di servizio',
      vexatious: false,
      body: [
        'Il Coach si impegna a svolgere le sessioni prenotate tramite gli strumenti della piattaforma, inclusa la videochiamata integrata, che costituisce anche la modalità con cui viene attestato lo svolgimento della sessione.',
        'Il Coach si impegna a mantenere aggiornata la propria disponibilità, a presentarsi puntualmente alle sessioni confermate e a comunicare tempestivamente eventuali impedimenti. Assenze non comunicate e cancellazioni tardive reiterate costituiscono inadempimento e possono comportare la sospensione o la rimozione del profilo.',
        'Il Coach si impegna a mantenere un livello qualitativo adeguato. KaiPai può sospendere o rimuovere il profilo del Coach la cui valutazione media si collochi stabilmente al di sotto della soglia minima indicata nell’area riservata, previo confronto con il Coach.',
      ],
    },
    {
      id: 'non-circumvention',
      title: '4. Non elusione della piattaforma',
      vexatious: true,
      body: [
        'Si definisce «Atleta KaiPai» l’atleta con cui il Coach è entrato in contatto per la prima volta tramite la piattaforma. La presente clausola non riguarda in alcun modo gli atleti già seguiti dal Coach prima di tale contatto, né quelli acquisiti attraverso canali propri e indipendenti.',
        `Per ${NON_CIRCUMVENTION_MONTHS} mesi decorrenti dall’ultima sessione svolta tramite la piattaforma, il Coach si impegna a prenotare e far pagare tramite KaiPai ogni sessione svolta con un Atleta KaiPai.`,
        'Nello stesso periodo il Coach si impegna in particolare a non proporre all’Atleta KaiPai il pagamento diretto o lo svolgimento delle sessioni al di fuori della piattaforma, a non sollecitare lo spostamento della relazione su altri canali, e a non richiedere né fornire recapiti personali prima che la prima sessione sia stata regolarmente pagata tramite la piattaforma.',
        `In caso di violazione accertata, il Coach è tenuto a corrispondere a KaiPai una penale pari a euro ${PENALTY_EUR},00 per ciascun Atleta KaiPai coinvolto, ovvero, se di importo maggiore, pari a dodici volte la commissione media percepita da KaiPai sulle sessioni svolte dal Coach con quell’Atleta. Resta salvo il risarcimento del maggior danno.`,
        'KaiPai può inoltre sospendere o rimuovere il profilo del Coach e trattenere gli importi non ancora liquidati fino a definizione della contestazione.',
        `Il Coach può in ogni momento liberarsi dell’obbligo previsto dal presente articolo nei confronti di uno specifico Atleta KaiPai, corrispondendo a KaiPai un importo una tantum pari a ${BUYOUT_MONTHS} mensilità di commissione stimata sulla base delle sessioni svolte con quell’Atleta nei mesi precedenti. Effettuato il pagamento, il Coach è libero di proseguire il rapporto con quell’Atleta al di fuori della piattaforma.`,
      ],
    },
    {
      id: 'minori',
      title: '5. Atleti minorenni',
      vexatious: true,
      body: [
        'La piattaforma è rivolta ad atleti a partire dai 15 anni di età. Il Coach dichiara espressamente se intende accettare o meno atleti di età compresa tra 15 e 17 anni. In assenza di tale dichiarazione il Coach non riceve richieste da parte di atleti minorenni.',
        'Il Coach che accetta atleti minorenni dichiara di non trovarsi in alcuna delle condizioni ostative previste dal D.Lgs. 39/2014 e si impegna a esibire, su richiesta di KaiPai, il certificato penale del casellario giudiziale, nonché a mantenere attiva una copertura assicurativa per la responsabilità civile professionale.',
        'Nei confronti degli atleti minorenni il Coach si impegna a non intrattenere alcun contatto privato o al di fuori della piattaforma, a tenere informato il genitore o tutore delle circostanze rilevanti per il percorso, e a riconoscere al genitore o tutore il diritto di essere presente o comunque raggiungibile durante le sessioni.',
        'Il Coach prende atto che l’attività di mental coaching non costituisce psicoterapia né attività diagnostica o sanitaria. In presenza di segnali riconducibili a condizioni cliniche — tra cui disturbi del comportamento alimentare, autolesionismo, abuso o maltrattamento — il Coach si impegna a interrompere il percorso, a indirizzare l’Atleta a un professionista sanitario e a informare senza ritardo il genitore o tutore.',
        'La violazione del presente articolo comporta la rimozione immediata del profilo, senza il termine di contraddittorio previsto dall’articolo 6.',
      ],
    },
    {
      id: 'segnalazioni-e-sanzioni',
      title: '6. Segnalazioni, sospensione e contraddittorio',
      vexatious: true,
      body: [
        'KaiPai può sospendere in via cautelare il profilo del Coach in presenza di segnalazioni di atleti o di elementi che facciano ragionevolmente ritenere violato il presente contratto, ivi compresi gli indicatori rilevati automaticamente sui messaggi scambiati in piattaforma.',
        'Salvo quanto previsto dall’articolo 5, prima di adottare un provvedimento definitivo KaiPai comunica al Coach gli elementi contestati e assegna un termine non inferiore a 7 giorni per presentare le proprie osservazioni.',
        'Il Coach può recedere dal presente contratto in qualsiasi momento con comunicazione scritta, fermi restando gli obblighi già maturati, le sessioni già confermate e l’articolo 4.',
      ],
    },
    {
      id: 'responsabilita',
      title: '7. Responsabilità',
      vexatious: true,
      body: [
        'Il Coach è l’unico responsabile del contenuto, della qualità e degli esiti del percorso professionale offerto, nonché della veridicità delle informazioni pubblicate sul proprio profilo.',
        'KaiPai non risponde dell’operato del Coach nei confronti degli Atleti. Nei limiti consentiti dalla legge, la responsabilità di KaiPai verso il Coach per qualsiasi titolo è limitata all’importo delle commissioni percepite da KaiPai sulle sessioni del Coach nei dodici mesi precedenti l’evento.',
        'Il Coach manleva KaiPai dalle pretese di terzi derivanti dalla propria attività professionale o dalla violazione del presente contratto.',
      ],
    },
    {
      id: 'legge-e-foro',
      title: '8. Legge applicabile e foro competente',
      vexatious: true,
      body: [
        'Il presente contratto è regolato dalla legge italiana.',
        'Per ogni controversia relativa alla sua interpretazione, esecuzione o risoluzione è competente in via esclusiva il foro della sede di KaiPai, salvo che il Coach rivesta la qualità di consumatore, nel qual caso resta competente il foro del luogo di residenza o domicilio elettivo del medesimo.',
      ],
    },
  ],
};

export const CURRENT_COACH_AGREEMENT_VERSION = COACH_AGREEMENT.version;

/**
 * Le sole clausole che richiedono la seconda spunta ex art. 1341 c.c.
 * Derivate, mai riscritte a mano: un elenco copiato diverge dal corpo del
 * contratto al primo ritocco, e clausole non elencate sono inefficaci.
 */
export function vexatiousSections(
  agreement: CoachAgreement = COACH_AGREEMENT
): AgreementSection[] {
  return agreement.sections.filter((s) => s.vexatious);
}

/**
 * Il documento in testo piano. È ciò su cui si calcola l'hash, quindi il
 * formato deve restare deterministico: qualsiasi cambio di formattazione
 * invalida gli hash già salvati, che vanno interpretati come "versione
 * diversa" — motivo in più per bumpare `version` insieme al testo.
 */
export function renderAgreementText(
  agreement: CoachAgreement = COACH_AGREEMENT
): string {
  const head = [
    'Contratto di Adesione Coach KaiPai',
    `Versione ${agreement.version} — in vigore dal ${agreement.effectiveDate}`,
    // I parametri economici sono ripetuti qui esplicitamente (oltre a essere
    // interpolati nel corpo delle clausole) perché il testo delle clausole è
    // fisso: senza questa riga, un `agreement` con valori economici diversi
    // ma stesse sezioni produrrebbe lo stesso hash, il che vanificherebbe la
    // proprietà "l'hash cambia se il documento cambia".
    `Commissione ${agreement.commissionPercent}% — Non concorrenza ${agreement.nonCircumventionMonths} mesi — Penale €${agreement.penaltyAmountEur} — Buyout ${agreement.buyoutMonths} mensilità — Preavviso ${agreement.noticeDays} giorni`,
    // The art. 1341 c.c. checkbox approves a specific list of clauses. That
    // list must be part of what the hash covers: flipping a `vexatious` flag
    // without touching any text must still change the hash, or an existing
    // acceptance would keep matching a document whose vexatious-clause list
    // it never actually saw. Derived via `vexatiousSections`, never
    // hand-written, for the same reason as the economic parameters above.
    `Clausole vessatorie ex art. 1341 c.c.: ${vexatiousSections(agreement)
      .map((s) => s.id)
      .join(', ')}`,
  ];
  const body = agreement.sections.map((s) =>
    [s.title, ...s.body].join('\n')
  );
  return [...head, ...body].join('\n\n');
}

/** SHA-256 del testo: prova di che cosa esattamente è stato firmato. */
export function hashAgreement(
  agreement: CoachAgreement = COACH_AGREEMENT
): string {
  return createHash('sha256')
    .update(renderAgreementText(agreement), 'utf8')
    .digest('hex');
}
