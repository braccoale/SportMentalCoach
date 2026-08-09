/**
 * Il contesto sportivo, per il prompt del riepilogo.
 *
 * Non è un prompt per sport: sarebbe N copie della stessa regola, che
 * divergono al primo ritocco fatto solo su una. La disciplina dell'evidenza,
 * il divieto di presentare una causa come un fatto, la cardinalità, il tono —
 * quelle valgono ovunque e restano una cosa sola.
 *
 * Cambiano tre cose piccole, e sono queste: il **vocabolario** (la griglia di
 * partenza dell'atletica non è lo spogliatoio del calcio), la **struttura
 * della competizione** (in uno sport di squadra metà dei temi riguardano
 * l'allenatore e i compagni; in uno individuale quasi nessuno), e i **momenti
 * tipici** in cui la testa fa la differenza.
 *
 * Poche righe, quindi. Servono a far riconoscere al modello ciò che l'atleta
 * nomina di sfuggita — «la partenza», «il cambio», «il muro» — non a
 * insegnargli lo sport.
 *
 * Modulo puro: la scelta del blocco è una corrispondenza di testo e si prova
 * senza rete.
 *
 * NOTA sulla rigenerazione: questo testo entra nel prompt ma non nella sua
 * versione, che è per deploy e non per sessione. Quando il glossario cambia
 * va alzata `SESSION_COMPASS_PROMPT_REVISION`, altrimenti i report esistenti
 * restano scritti con il glossario vecchio e nessuno li rifà.
 */

type SportProfile = {
  /** Parole che identificano lo sport, già normalizzate. */
  match: readonly string[];
  lines: readonly string[];
};

const TEAM_SPORT_LINES = [
  'È uno sport di squadra: il rapporto con l’allenatore, il posto nelle gerarchie, la fiducia dei compagni e il tempo passato in panchina sono temi ricorrenti quanto la prestazione.',
  'Attenzione ai momenti in cui l’atleta parla di sé attraverso il gruppo («non mi passano la palla», «il mister non mi vede»): spesso ci sta dentro qualcosa di suo.',
] as const;

const PROFILES: readonly SportProfile[] = [
  {
    match: ['calcio', 'football', 'futsal', 'calcio a 5'],
    lines: [
      ...TEAM_SPORT_LINES,
      'Momenti in cui la testa pesa: il riscaldamento, l’ingresso a partita in corso, il rigore, l’intervallo dopo un errore, la settimana dopo una prestazione giudicata male.',
      'Vocabolario: convocazione, distinta, spogliatoio, mister, titolare, panchina, ritiro, provino.',
    ],
  },
  {
    match: ['basket', 'pallacanestro'],
    lines: [
      ...TEAM_SPORT_LINES,
      'Momenti in cui la testa pesa: i tiri liberi, gli ultimi due minuti, il fallo tecnico, il minutaggio.',
      'Vocabolario: quintetto, minutaggio, timeout, palleggio, percentuale al tiro.',
    ],
  },
  {
    match: ['pallavolo', 'volley'],
    lines: [
      ...TEAM_SPORT_LINES,
      'Momenti in cui la testa pesa: il servizio sotto pressione, la ricezione dopo un errore, il cambio palla, il set point.',
      'Vocabolario: ricezione, muro, schiacciata, cambio, set, palleggiatore.',
    ],
  },
  {
    match: ['rugby'],
    lines: [
      ...TEAM_SPORT_LINES,
      'Momenti in cui la testa pesa: il placcaggio, la mischia, il calcio piazzato, il rientro dopo un colpo.',
      'Vocabolario: mischia, touche, placcaggio, meta, terzo tempo.',
    ],
  },
  {
    match: ['atletica', 'mezzofondo', 'corsa', 'running', 'maratona', 'velocita'],
    lines: [
      'È uno sport individuale e cronometrato: il confronto è con un numero, e il numero è pubblico. Il paragone con sé stessi e con la propria stagione migliore è un tema costante.',
      'Momenti in cui la testa pesa: i minuti in camera d’appello e in griglia, i primi metri, il punto della gara in cui «di solito mollo», il finale.',
      'Vocabolario: griglia, batteria, finale, personale, tabella, ripetute, scarico, fondo.',
    ],
  },
  {
    match: ['nuoto', 'swimming', 'triathlon'],
    lines: [
      'È uno sport individuale e cronometrato, con lunghe ore di allenamento in un ambiente silenzioso: la ripetitività e la solitudine dell’allenamento sono temi frequenti quanto la gara.',
      'Momenti in cui la testa pesa: il blocco di partenza, la virata, la vasca finale, l’attesa fra batteria e finale.',
      'Vocabolario: vasca, virata, blocco, batteria, passaggio, tabella, personale.',
    ],
  },
  {
    match: ['tennis', 'padel', 'squash', 'badminton'],
    lines: [
      'È un duello individuale e lungo: l’avversario è lì, e il punteggio permette di recuperare da qualsiasi situazione. La gestione del punto perso e del proprio dialogo interno fra un punto e l’altro è il tema centrale.',
      'Momenti in cui la testa pesa: la seconda di servizio, il punto dopo un doppio fallo, il break subito, il tie-break, i cambi di campo.',
      'Vocabolario: break, tie-break, servizio, seconda, dritto, rovescio, cambio campo.',
    ],
  },
  {
    match: ['ciclismo', 'bici', 'mtb', 'gravel'],
    lines: [
      'È uno sport di resistenza dove la sofferenza è programmata: il rapporto con il dolore e con la decisione di continuare è materia frequente. Se c’è una squadra, esiste anche il tema del ruolo — chi tira e chi si conserva.',
      'Momenti in cui la testa pesa: la salita chiave, il momento dello stacco, la volata, il rientro dopo una caduta.',
      'Vocabolario: gruppo, fuga, watt, soglia, tappa, gregario, volata.',
    ],
  },
  {
    match: ['arti marziali', 'judo', 'karate', 'boxe', 'pugilato', 'lotta', 'mma', 'scherma', 'taekwondo'],
    lines: [
      'È un confronto diretto e fisico: la paura, il controllo dell’aggressività e il rapporto con il contatto sono temi legittimi e vanno nominati con prudenza, senza mai scivolare in un linguaggio clinico.',
      'Momenti in cui la testa pesa: il peso e il taglio del peso, i minuti prima di salire, il rientro dopo una sconfitta netta, il primo scambio.',
      'Vocabolario: incontro, categoria, taglio del peso, angolo, ripresa, tatami, ring.',
    ],
  },
  {
    match: ['sci', 'snowboard', 'skate', 'ginnastica', 'tuffi', 'arrampicata', 'climbing'],
    lines: [
      'È uno sport tecnico e di esposizione, dove un errore ha conseguenze fisiche: la paura è un tema operativo, non un tabù, e va trattata come informazione — senza mai presentarla come un disturbo.',
      'Momenti in cui la testa pesa: la ricognizione, il cancelletto o la chiamata, il primo passaggio difficile, il rientro dopo una caduta.',
      'Vocabolario: ricognizione, tracciato, esercizio, esecuzione, difficoltà, caduta.',
    ],
  },
  {
    match: ['golf'],
    lines: [
      'È uno sport lento e individuale, con molto tempo fra un colpo e l’altro: il dialogo interno fra i colpi è quasi tutto il gioco mentale.',
      'Momenti in cui la testa pesa: il tee di partenza, il colpo dopo un errore, il putt corto, le ultime buche quando il punteggio è buono.',
      'Vocabolario: tee, putt, green, buca, giro, handicap.',
    ],
  },
];

/** Normalizza per il confronto: minuscole, senza accenti, spazi compressi. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Le righe di contesto per uno sport, o nessuna.
 *
 * Uno sport sconosciuto non riceve un blocco generico: righe che valgono per
 * tutti non aggiungono nulla a un modello che sa già cos'è lo sport, e
 * allungherebbero il prompt senza cambiarne l'esito.
 */
export function sportContextLines(sport: string | null): readonly string[] {
  if (!sport) return [];
  const normalized = normalize(sport);
  if (!normalized) return [];
  const profile = PROFILES.find((candidate) =>
    candidate.match.some(
      (keyword) =>
        normalized === keyword ||
        normalized.includes(keyword) ||
        keyword.includes(normalized)
    )
  );
  return profile?.lines ?? [];
}

/** Il blocco pronto per il prompt, o stringa vuota se lo sport non è coperto. */
export function sportContextBlock(sport: string | null): string {
  const lines = sportContextLines(sport);
  if (lines.length === 0) return '';
  return [
    `Contesto sportivo (${sport}). Serve a farti riconoscere cio' che l'atleta nomina di sfuggita, non a insegnarti lo sport. Non forzarlo: se la seduta non tocca nessuno di questi temi, ignoralo.`,
    ...lines,
  ].join('\n');
}
