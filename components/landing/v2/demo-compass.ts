/**
 * Il Session Compass che si vede sulla landing v2.
 *
 * Non è un mockup disegnato: è un `SessionCompassReport` vero, della forma che
 * il prodotto produce davvero, costruito sopra una trascrizione inventata di
 * una seduta inventata. Nessun dato reale, nessuna query, nessuna sessione di
 * nessuno.
 *
 * Il vincolo che rende onesta questa pagina sta in `demo-compass.test.ts`: il
 * report passa per `validateSessionCompassReport`, lo stesso validatore che
 * accetta o rifiuta l'output del modello in produzione. Se un domani il
 * contratto cambia — un'evidenza in più, una metrica in meno, una frase
 * vietata — la landing smette di compilare o il test diventa rosso, invece di
 * continuare a mostrare al pubblico un prodotto che non esiste più.
 *
 * È anche il motivo per cui le evidenze non sono scritte a mano: `evidenceFor`
 * le deriva dal segmento citato, così `startMs`, `minute` e `speaker` non
 * possono divergere dalla trascrizione.
 */

import {
  SESSION_COMPASS_REPORT_KIND,
  SESSION_COMPASS_SCHEMA_VERSION,
  minuteFromMs,
  type CompassEvidence,
  type CompassSourceSegment,
  type SessionCompassReport,
  type SessionCompassValidationContext,
  type SessionMetricKey,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import type { MentalJourneyEntry } from '@/lib/core/ai-session-notes/mental-journey';

export const DEMO_SESSION_ID = 'demo-landing-v2';
export const DEMO_FINGERPRINT = 'demo-landing-v2-transcript-1';

/** L'atleta della demo. Inventata, e dichiarata tale sulla pagina. */
export const DEMO_ATHLETE = {
  name: 'Giulia M.',
  sport: 'Pallavolo · schiacciatrice',
  sessionNumber: 7,
  sessionDate: '2026-03-09',
  durationLabel: '52 min',
} as const;

/**
 * La seduta, per come l'avrebbe restituita la trascrizione. Dodici segmenti:
 * abbastanza da ancorare ogni insight, pochi abbastanza da poterli leggere
 * tutti mentre si controlla che il report non dica niente di più di quello che
 * è stato detto.
 */
export const DEMO_SEGMENTS: readonly CompassSourceSegment[] = [
  {
    transcriptSegmentId: 1,
    startMs: 0,
    endMs: 38_000,
    speaker: 'coach',
    text: 'Partiamo da domenica. Che cosa ti è rimasto addosso della partita?',
  },
  {
    transcriptSegmentId: 2,
    startMs: 42_000,
    endMs: 96_000,
    speaker: 'athlete',
    text: 'Il primo set l’ho giocato bene. Poi ho sbagliato due battute di fila e da lì ho smesso di cercare la palla.',
  },
  {
    transcriptSegmentId: 3,
    startMs: 180_000,
    endMs: 212_000,
    speaker: 'coach',
    text: 'Quando dici che hai smesso di cercarla, che cosa succedeva nella tua testa in quel momento?',
  },
  {
    transcriptSegmentId: 4,
    startMs: 214_000,
    endMs: 268_000,
    speaker: 'athlete',
    text: 'Continuavo a rivedere l’errore. Anche mentre l’azione andava avanti io ero ancora sulla battuta sbagliata.',
  },
  {
    transcriptSegmentId: 5,
    startMs: 470_000,
    endMs: 522_000,
    speaker: 'athlete',
    text: 'Poi in panchina mi sono detta che dovevo solo respirare, e nel quarto set sono rientrata.',
  },
  {
    transcriptSegmentId: 6,
    startMs: 690_000,
    endMs: 744_000,
    speaker: 'coach',
    text: 'Quella cosa che hai fatto in panchina ha un nome: è una routine di reset. Proviamo a renderla ripetibile.',
  },
  {
    transcriptSegmentId: 7,
    startMs: 905_000,
    endMs: 958_000,
    speaker: 'athlete',
    text: 'Se ce l’ho scritta la faccio. Il problema è che nel momento non mi ricordo niente.',
  },
  {
    transcriptSegmentId: 8,
    startMs: 1_320_000,
    endMs: 1_380_000,
    speaker: 'athlete',
    text: 'Con l’allenatore non ne ho mai parlato. Ho paura che pensi che non sono concentrata.',
  },
  {
    transcriptSegmentId: 9,
    startMs: 1_680_000,
    endMs: 1_736_000,
    speaker: 'coach',
    text: 'Facciamo così: questa settimana provi il reset in allenamento, tre volte, dopo un errore vero.',
  },
  {
    transcriptSegmentId: 10,
    startMs: 1_742_000,
    endMs: 1_790_000,
    speaker: 'athlete',
    text: 'Va bene. Lo scrivo sul telefono e ci provo giovedì.',
  },
  {
    transcriptSegmentId: 11,
    startMs: 2_100_000,
    endMs: 2_152_000,
    speaker: 'athlete',
    text: 'Comunque quando le mie compagne mi dicono dai, riparti, ci riesco molto prima.',
  },
  {
    transcriptSegmentId: 12,
    startMs: 2_400_000,
    endMs: 2_448_000,
    speaker: 'coach',
    text: 'Ci risentiamo lunedì e vediamo che cosa è successo dopo il primo errore.',
  },
] as const;

const SEGMENTS_BY_ID = new Map(
  DEMO_SEGMENTS.map((segment) => [segment.transcriptSegmentId, segment]),
);

/**
 * L'evidenza è derivata, mai scritta.
 *
 * Il timestamp, il minuto e lo speaker vengono dal segmento: sono esattamente
 * i tre campi che il validatore confronta, ed esattamente i tre che, copiati a
 * mano, prima o poi divergono.
 */
function evidenceFor(transcriptSegmentId: number, quote: string): CompassEvidence {
  const segment = SEGMENTS_BY_ID.get(transcriptSegmentId);
  if (!segment) {
    throw new Error(`Segmento demo inesistente: ${transcriptSegmentId}`);
  }
  return {
    transcriptSegmentId,
    startMs: segment.startMs,
    minute: minuteFromMs(segment.startMs),
    speaker: segment.speaker,
    quote,
  };
}

export const DEMO_COMPASS: SessionCompassReport = {
  schemaVersion: SESSION_COMPASS_SCHEMA_VERSION,
  reportKind: SESSION_COMPASS_REPORT_KIND,
  sessionId: DEMO_SESSION_ID,
  sourceFingerprint: DEMO_FINGERPRINT,
  language: 'it',
  sessionOverview: {
    summary:
      'La seduta ruota attorno a che cosa succede dopo un errore in partita: Giulia riferisce che l’attenzione resta sull’azione appena conclusa mentre il gioco prosegue. Emerge anche un rientro riuscito nel quarto set, dopo una pausa in panchina in cui ha lavorato sul respiro. La seconda parte trasforma quel rientro in una routine ripetibile da provare in allenamento.',
    summaryEvidence: [
      evidenceFor(4, 'io ero ancora sulla battuta sbagliata'),
      evidenceFor(5, 'mi sono detta che dovevo solo respirare'),
    ],
    themes: [
      {
        id: 'theme-attenzione',
        text: 'Dopo un errore l’attenzione resta sull’azione precedente',
        evidence: evidenceFor(4, 'Continuavo a rivedere l’errore'),
      },
      {
        id: 'theme-respiro',
        text: 'Il respiro in panchina ha funzionato come rientro',
        evidence: evidenceFor(5, 'nel quarto set sono rientrata'),
      },
      {
        id: 'theme-allenatore',
        text: 'Il confronto con l’allenatore resta un tema non aperto',
        evidence: evidenceFor(8, 'Con l’allenatore non ne ho mai parlato'),
      },
    ],
    emergingResource: {
      id: 'resource-squadra',
      text: 'Il richiamo delle compagne accorcia i tempi di rientro',
      evidence: evidenceFor(11, 'quando le mie compagne mi dicono dai, riparti, ci riesco molto prima'),
    },
    metrics: [
      {
        id: 'metric-concentration',
        key: 'concentration',
        value: 2,
        confidence: 'high',
        evidence: evidenceFor(4, 'Anche mentre l’azione andava avanti'),
      },
      {
        id: 'metric-emotional',
        key: 'emotional_management',
        value: 3,
        confidence: 'medium',
        evidence: evidenceFor(5, 'dovevo solo respirare'),
      },
      {
        id: 'metric-confidence',
        key: 'confidence',
        value: 2,
        confidence: 'medium',
        evidence: evidenceFor(8, 'Ho paura che pensi che non sono concentrata'),
      },
      {
        id: 'metric-motivation',
        key: 'motivation',
        value: 4,
        confidence: 'medium',
        evidence: evidenceFor(10, 'Lo scrivo sul telefono e ci provo giovedì'),
      },
      {
        id: 'metric-energy',
        key: 'energy',
        value: 3,
        confidence: 'low',
        evidence: evidenceFor(2, 'Il primo set l’ho giocato bene'),
      },
      {
        id: 'metric-anxiety',
        key: 'pre_competition_anxiety',
        value: 3,
        confidence: 'low',
        evidence: evidenceFor(8, 'Ho paura che pensi'),
      },
    ],
    emotionalTrend: [
      {
        id: 'trend-1',
        value: 0,
        label: 'Racconto neutro dell’avvio',
        evidence: evidenceFor(2, 'Il primo set l’ho giocato bene'),
      },
      {
        id: 'trend-2',
        value: -2,
        label: 'Tensione sull’errore ripetuto',
        evidence: evidenceFor(4, 'Continuavo a rivedere l’errore'),
      },
      {
        id: 'trend-3',
        value: 1,
        label: 'Rientro riferito come riuscito',
        evidence: evidenceFor(5, 'nel quarto set sono rientrata'),
      },
      {
        id: 'trend-4',
        value: -1,
        label: 'Esitazione sul confronto con l’allenatore',
        evidence: evidenceFor(8, 'Ho paura che pensi che non sono concentrata'),
      },
      {
        id: 'trend-5',
        value: 2,
        label: 'Slancio nel prendersi l’impegno',
        evidence: evidenceFor(10, 'Va bene. Lo scrivo sul telefono'),
      },
      {
        id: 'trend-6',
        value: 1,
        label: 'Riconoscimento di una risorsa esterna',
        evidence: evidenceFor(11, 'ci riesco molto prima'),
      },
    ],
    conversationParticipation: {
      athleteTalkMs: 1_512_000,
      coachTalkMs: 648_000,
      athleteTurns: 21,
      coachTurns: 18,
      athleteSharePercent: 70,
    },
    conversationTone: {
      key: 'open',
      description:
        'Il linguaggio resta descrittivo e in prima persona anche sui passaggi scomodi, con una sola esitazione dichiarata.',
      confidence: 'medium',
      evidence: evidenceFor(8, 'Con l’allenatore non ne ho mai parlato'),
    },
  },
  keyMoments: [
    {
      id: 'moment-loop',
      title: 'L’azione va avanti, l’attenzione no',
      explanation:
        'È la frase in cui il problema smette di essere “ho sbagliato” e diventa “resto sull’errore”. Da qui in poi la seduta lavora sul rientro, non sulla battuta.',
      speaker: 'athlete',
      evidence: evidenceFor(4, 'io ero ancora sulla battuta sbagliata'),
      category: 'awareness',
      theme: 'Attenzione dopo l’errore',
      relevance: 3,
    },
    {
      id: 'moment-reset',
      title: 'Il rientro aveva già un nome',
      explanation:
        'Giulia aveva già fatto da sola qualcosa che funziona. Nominarlo come routine sposta il lavoro da “imparare una tecnica” a “rendere ripetibile una cosa tua”.',
      speaker: 'coach',
      evidence: evidenceFor(6, 'è una routine di reset'),
      category: 'turning_point',
      theme: 'Routine di reset',
      relevance: 3,
    },
    {
      id: 'moment-memoria',
      title: 'L’ostacolo dichiarato non è la volontà',
      explanation:
        'L’obiezione è pratica e va presa alla lettera: nel momento non se ne ricorda. Un promemoria scritto è la risposta a questa frase, non un ripiego.',
      speaker: 'athlete',
      evidence: evidenceFor(7, 'nel momento non mi ricordo niente'),
      category: 'resistance',
      theme: 'Applicabilità in campo',
      relevance: 2,
    },
  ],
  missedOpportunities: [
    {
      id: 'missed-allenatore',
      text: 'Il timore del giudizio dell’allenatore è stato nominato una volta e la conversazione è andata altrove.',
      followUp:
        'Che cosa immagini che pensi il tuo allenatore quando ti vede sbagliare due battute?',
      evidence: evidenceFor(8, 'Ho paura che pensi che non sono concentrata'),
    },
  ],
  story: {
    title: 'Una seduta su che cosa succede dopo l’errore',
    paragraphs: [
      {
        id: 'story-1',
        text: 'Si parte dalla partita di domenica. Giulia distingue subito il primo set dal resto: la frattura non è tecnica, è nel punto in cui due battute sbagliate cambiano il modo in cui sta in campo.',
        evidence: evidenceFor(2, 'ho smesso di cercare la palla'),
      },
      {
        id: 'story-2',
        text: 'La domanda sul “che cosa succedeva nella testa” apre il passaggio più utile della seduta: l’attenzione resta sull’azione conclusa mentre il gioco prosegue.',
        evidence: evidenceFor(4, 'Continuavo a rivedere l’errore'),
      },
      {
        id: 'story-3',
        text: 'Il rientro nel quarto set arriva senza che nessuno lo abbia insegnato. La seconda metà della seduta serve a dargli un nome e una forma ripetibile.',
        evidence: evidenceFor(5, 'nel quarto set sono rientrata'),
      },
      {
        id: 'story-4',
        text: 'Rispetto alla quinta seduta, la richiesta di “qualcosa di scritto” torna uguale. È la seconda volta che il passaggio dall’intenzione al gesto ha bisogno di un appoggio esterno.',
        evidence: null,
      },
    ],
    throughLine:
      'Il filo delle ultime tre sedute è il tempo che passa tra l’errore e il rientro, non il numero degli errori.',
  },
  commitments: [
    {
      id: 'commitment-reset',
      text: 'Provare la routine di reset in allenamento tre volte, dopo un errore reale.',
      owner: 'athlete',
      status: 'in_progress',
      dueDate: '2026-03-15',
      evidence: evidenceFor(9, 'provi il reset in allenamento, tre volte'),
    },
    {
      id: 'commitment-promemoria',
      text: 'Scrivere la routine sul telefono e tenerla raggiungibile prima della partita.',
      owner: 'athlete',
      status: 'done',
      dueDate: null,
      evidence: evidenceFor(10, 'Lo scrivo sul telefono'),
    },
    {
      id: 'commitment-verifica',
      text: 'Riprendere in apertura che cosa è successo dopo il primo errore della settimana.',
      owner: 'coach',
      status: 'pending',
      dueDate: '2026-03-16',
      evidence: evidenceFor(12, 'vediamo che cosa è successo dopo il primo errore'),
    },
  ],
  nextSessionPrep: [
    {
      id: 'prep-reset',
      text: 'Partire dalle tre prove del reset: quante sono state fatte e che cosa è cambiato nei secondi successivi.',
      origin: 'commitment',
      evidence: evidenceFor(9, 'questa settimana provi il reset in allenamento'),
    },
    {
      id: 'prep-allenatore',
      text: 'Riaprire il tema dell’allenatore, che finora è comparso una volta sola.',
      origin: 'open_question',
      evidence: evidenceFor(8, 'Con l’allenatore non ne ho mai parlato'),
    },
    {
      id: 'prep-squadra',
      text: 'Verificare se il richiamo delle compagne può diventare un appoggio concordato invece che casuale.',
      origin: 'theme',
      evidence: evidenceFor(11, 'quando le mie compagne mi dicono dai, riparti'),
    },
  ],
  coachNote: null,
  generation: {
    provider: 'demo',
    model: 'demo',
    promptVersion: 'landing-v2',
    contractVersion: SESSION_COMPASS_SCHEMA_VERSION,
    generatedAt: '2026-03-09T20:41:00.000Z',
  },
};

export const DEMO_COMPASS_CONTEXT: SessionCompassValidationContext = {
  sessionId: DEMO_SESSION_ID,
  sourceFingerprint: DEMO_FINGERPRINT,
  segments: DEMO_SEGMENTS,
};

/**
 * L'ordine in cui le sei metriche compaiono sulla landing.
 *
 * Non è l'ordine del contratto: è quello del racconto. Si apre su ciò che la
 * seduta ha messo a fuoco (la concentrazione) e si chiude sull'unica metrica
 * in cui il numero alto è la notizia cattiva.
 */
export const DEMO_METRIC_ORDER: readonly SessionMetricKey[] = [
  'concentration',
  'emotional_management',
  'confidence',
  'motivation',
  'energy',
  'pre_competition_anxiety',
];

/**
 * Il percorso mentale delle quattro sedute precedenti, nella forma del
 * prodotto: `Pick` sul tipo vero, così se `MentalJourneyEntry` cambia questa
 * demo non compila più invece di raccontare una schermata che non esiste.
 */
export type DemoJourneyEntry = Pick<
  MentalJourneyEntry,
  'sessionId' | 'sessionDate' | 'summary' | 'focus' | 'themes'
> & {
  /** Le due metriche che la landing mostra per ciascuna seduta. */
  concentration: number;
  emotionalManagement: number;
};

export const DEMO_JOURNEY: readonly DemoJourneyEntry[] = [
  {
    sessionId: 4,
    sessionDate: '2026-01-26',
    summary: 'Prima messa a fuoco del momento in cui la partita cambia.',
    focus: 'Riconoscere l’errore che pesa',
    themes: ['Errore in battuta', 'Giudizio percepito'],
    concentration: 2,
    emotionalManagement: 2,
  },
  {
    sessionId: 5,
    sessionDate: '2026-02-09',
    summary: 'La respirazione compare per la prima volta come cosa già fatta.',
    focus: 'Cercare un appiglio ripetibile',
    themes: ['Respiro', 'Rientro'],
    concentration: 2,
    emotionalManagement: 3,
  },
  {
    sessionId: 6,
    sessionDate: '2026-02-23',
    summary: 'Il tempo tra errore e rientro si accorcia in allenamento.',
    focus: 'Accorciare il rientro',
    themes: ['Routine di reset', 'Allenamento'],
    concentration: 3,
    emotionalManagement: 3,
  },
  {
    sessionId: 7,
    sessionDate: '2026-03-09',
    summary: 'La routine prende un nome e diventa un impegno con una scadenza.',
    focus: 'Rendere la routine ripetibile',
    themes: ['Routine di reset', 'Squadra come appoggio'],
    concentration: 2,
    emotionalManagement: 3,
  },
];
