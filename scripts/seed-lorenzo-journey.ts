/**
 * Dieci sedute in più per Lorenzo Conti, l'atleta di dimostrazione.
 *
 * **A che serve.** Con tre sedute il percorso si vede ma non si legge: la
 * striscia non deve scegliere, il grafico del progresso non ha abbastanza punti
 * e i temi non tornano mai. Serviva un atleta con una storia lunga, per
 * guardare la scheda come la vedrà un coach fra sei mesi.
 *
 * **Perché uno script e non il seed generale.** `seed-demo-experience.ts`
 * ricostruisce l'intera esperienza demo: rilanciarlo per aggiungere sedute a
 * una persona sola significherebbe riscrivere tutto il resto. Questo tocca
 * Lorenzo e nient'altro.
 *
 * **È rieseguibile.** Ogni prenotazione porta un marcatore nel campo note; chi
 * lo ha già viene saltato. Lanciarlo due volte non raddoppia niente.
 *
 * Uso:
 *   npx tsx scripts/seed-lorenzo-journey.ts            (mostra cosa farebbe)
 *   npx tsx scripts/seed-lorenzo-journey.ts --apply    (scrive)
 */

import { and, eq, like } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  athleteJourneyGoalSessions,
  athleteJourneyGoals,
  bookings,
  providerProfiles,
  sessionAiNotes,
  sessionAiReports,
  sessionTranscriptSegments,
  users,
} from '@/lib/db/schema';
import {
  SESSION_COMPASS_REPORT_KIND,
  SESSION_COMPASS_SCHEMA_VERSION,
  type CompassSpeaker,
  type ConversationToneKey,
  type KeyMomentCategory,
  type SessionMetricKey,
} from '@/lib/core/ai-session-notes/session-compass-contract';

const ATHLETE_EMAIL = 'demo.lorenzo@kaipaicoaching.com';
const MARKER = 'kaipai-demo:lorenzo-journey';
const SEGMENT_GAP_MS = 4 * 60 * 1000;

type Line = { speaker: CompassSpeaker; text: string };

type Spec = {
  /** Giorno della seduta, `YYYY-MM-DD`. */
  day: string;
  hour: number;
  /** Il tema portante: è quello che compare nella striscia e nei temi ricorrenti. */
  theme: string;
  resource: string;
  pivot: string;
  storyTitle: string;
  lines: Line[];
  /** Indici in `lines` a cui puntano le evidenze. */
  at: {
    theme: number;
    resource: number;
    pivot: number;
    moment: number;
    commitment: number;
    missed: number;
  };
  momentTitle: string;
  momentCategory: KeyMomentCategory;
  commitment: string;
  prep: [string, string];
  missed: { text: string; followUp: string };
  tone: ConversationToneKey;
  /**
   * I sei indicatori su scala 0-100.
   *
   * L'arco si scrive meglio con cento gradini che con cinque, ma **il contratto
   * vuole interi da 1 a 5** (`session-compass-contract.ts`, INVALID_METRIC_VALUE):
   * la conversione avviene alla scrittura. Metterli qui gia' convertiti avrebbe
   * appiattito la differenza fra una seduta e la successiva, che e' esattamente
   * cio' che il grafico del progresso deve mostrare.
   */
  metrics: Record<SessionMetricKey, number>;
  throughLine: string;
};

/**
 * L'arco.
 *
 * Prosegue dove il seed lo aveva lasciato — accorgersi dello scivolamento,
 * costruire un reset, rendere utile il dialogo interno — e lo porta dentro il
 * campo: il respiro fra i punti, una sola intenzione prima del servizio, il
 * punteggio che smette di essere una minaccia, fino a chiudere il punto invece
 * di aspettare l'errore dell'altro.
 *
 * I numeri salgono ma non in linea retta: il 31 luglio e il 14 agosto vanno
 * indietro. Un percorso che migliora sempre non somiglia a nessun percorso
 * vero, e una scheda dimostrativa che lo mostrasse insegnerebbe la cosa
 * sbagliata a chi la guarda.
 */
const SPECS: Spec[] = [
  {
    day: '2026-07-10',
    hour: 17,
    theme: 'Il respiro fra un punto e l’altro come segnale di inizio',
    resource: 'Il respiro lungo che usa già prima del servizio',
    pivot: 'Portare il respiro dove serve: dopo il punto perso, non solo prima del servizio',
    storyTitle: 'Un gesto che già c’era, spostato di venti secondi',
    lines: [
      { speaker: 'coach', text: 'Partiamo da dove eravamo rimasti: il dialogo interno. Che cosa è successo in settimana?' },
      { speaker: 'athlete', text: 'Che me ne accorgo. Prima nemmeno. Però me ne accorgo dopo, quando il punto è già andato.' },
      { speaker: 'coach', text: 'Accorgersi dopo è comunque nuovo. Dove sei, fisicamente, quando te ne accorgi?' },
      { speaker: 'athlete', text: 'Sto camminando verso il fondo. Respiro corto, spalle su. Poi servo e va come va.' },
      { speaker: 'coach', text: 'Il respiro lungo prima del servizio lo fai già. Da quanto?' },
      { speaker: 'athlete', text: 'Da sempre, è automatico. Non ci penso nemmeno.' },
      { speaker: 'coach', text: 'E se lo spostassi venti secondi prima, subito dopo il punto perso?' },
      { speaker: 'athlete', text: 'Non ci avevo mai pensato. In teoria è lo stesso gesto, solo prima.' },
      { speaker: 'coach', text: 'Non è teoria, è tempo. Provalo su tre game e dimmi se cambia qualcosa.' },
      { speaker: 'athlete', text: 'Va bene. Tanto quello lo so fare, non devo imparare niente di nuovo.' },
    ],
    at: { theme: 3, resource: 5, pivot: 6, moment: 7, commitment: 8, missed: 1 },
    momentTitle: 'Lo strumento esisteva già, mancava il momento',
    momentCategory: 'awareness',
    commitment: 'Su tre game di allenamento, fai il respiro lungo subito dopo il punto perso invece che solo prima del servizio.',
    prep: [
      'Chiedere che cosa è cambiato nei venti secondi fra il punto e il servizio',
      'Verificare se il respiro spostato ha retto anche sotto punteggio',
    ],
    missed: {
      text: 'Ha detto «va come va» parlando del servizio dopo un punto perso, e la conversazione è andata sul respiro.',
      followUp: 'Che cosa vuol dire per te «va come va»? È rassegnazione o è lasciar andare?',
    },
    tone: 'reflective',
    metrics: { energy: 58, motivation: 64, concentration: 52, emotional_management: 47, confidence: 50, pre_competition_anxiety: 61 },
    throughLine: 'Il dialogo interno smette di essere una cosa da correggere e diventa un segnale da leggere.',
  },
  {
    day: '2026-07-17',
    hour: 18,
    theme: 'Scegliere una sola intenzione tattica prima del servizio',
    resource: 'Sa dire con precisione dove voleva mettere la palla',
    pivot: 'Una intenzione sola: la seconda toglie tempo invece di aggiungerlo',
    storyTitle: 'Meno cose in testa, più campo davanti',
    lines: [
      { speaker: 'coach', text: 'Il respiro spostato ha retto?' },
      { speaker: 'athlete', text: 'Sì, su due game su tre. Il terzo ero sotto 15-40 e me lo sono dimenticato.' },
      { speaker: 'coach', text: 'Buono. Quando servi, che cosa hai in testa nell’istante prima?' },
      { speaker: 'athlete', text: 'Tante cose. Dove metterla, che lui è mancino, che devo caricare le gambe, che non devo sbagliare.' },
      { speaker: 'coach', text: 'Quante di queste sono un’azione e quante sono un avvertimento?' },
      { speaker: 'athlete', text: 'Detta così, una sola è un’azione. Le altre sono cose da non fare.' },
      { speaker: 'coach', text: 'Se prima di ogni servizio ne tenessi una sola, quale terresti?' },
      { speaker: 'athlete', text: 'Dove metterla. Quella la so sempre, anche quando poi sbaglio.' },
      { speaker: 'coach', text: 'Allora quella. Una frase corta, detta a te stesso, prima di rimbalzare la palla.' },
      { speaker: 'athlete', text: 'Tipo «esterna». Solo quella. Mi sembra poco ma proviamo.' },
    ],
    at: { theme: 3, resource: 7, pivot: 5, moment: 5, commitment: 8, missed: 1 },
    momentTitle: 'Distinguere un’azione da un avvertimento',
    momentCategory: 'turning_point',
    commitment: 'Prima di ogni servizio, dire a te stesso una parola sola: la direzione. Niente altro.',
    prep: [
      'Chiedere quante volte la parola è arrivata prima del rimbalzo',
      'Capire cosa succede quando il punteggio si stringe',
    ],
    missed: {
      text: 'Ha detto di essersi dimenticato il respiro proprio sul 15-40, e siamo passati al servizio.',
      followUp: 'Che cosa succede dentro di te quando il punteggio si stringe, prima ancora di giocare il punto?',
    },
    tone: 'open',
    metrics: { energy: 61, motivation: 68, concentration: 58, emotional_management: 51, confidence: 55, pre_competition_anxiety: 58 },
    throughLine: 'Dal correggere il pensiero al ridurne il numero.',
  },
  {
    day: '2026-07-24',
    hour: 17,
    theme: 'Il punteggio smette di essere una minaccia',
    resource: 'Sul 40-0 gioca sciolto: la prova che il colpo c’è',
    pivot: 'Non è il colpo a cambiare col punteggio, è quanto tempo si prende',
    storyTitle: 'Lo stesso colpo, due punteggi diversi',
    lines: [
      { speaker: 'coach', text: 'La parola prima del servizio è arrivata?' },
      { speaker: 'athlete', text: 'Quasi sempre. E quando arriva servo meglio, non so perché.' },
      { speaker: 'coach', text: 'Hai detto che sul 15-40 sparisce tutto. Sul 40-0 invece?' },
      { speaker: 'athlete', text: 'Sul 40-0 gioco che è un piacere. Rischio, entro, mi diverto.' },
      { speaker: 'coach', text: 'Stesso braccio, stesso colpo. Che cosa cambia?' },
      { speaker: 'athlete', text: 'Che sul 40-0 ho margine. Sull’altro sento che se sbaglio è finita.' },
      { speaker: 'coach', text: 'Guardiamo il tempo. Quanto ci metti a servire sul 40-0 e quanto sul 15-40?' },
      { speaker: 'athlete', text: 'Sul 15-40 vado di fretta. Ci ho fatto caso in settimana, servo subito per togliermelo.' },
      { speaker: 'coach', text: 'Quindi non è il colpo che cambia. È il tempo che ti concedi.' },
      { speaker: 'athlete', text: 'Sì. E il tempo me lo tolgo da solo, nessuno me lo toglie.' },
    ],
    at: { theme: 5, resource: 3, pivot: 8, moment: 9, commitment: 7, missed: 1 },
    momentTitle: 'Il tempo se lo toglie da solo',
    momentCategory: 'awareness',
    commitment: 'Sui punti sotto pressione, contare due rimbalzi in più prima di servire.',
    prep: [
      'Verificare se i due rimbalzi in più sono arrivati anche in partita',
      'Riprendere la differenza fra margine reale e margine percepito',
    ],
    missed: {
      text: 'Ha detto «se sbaglio è finita» quasi di sfuggita, e siamo andati sul tempo.',
      followUp: 'Finita che cosa, esattamente? Il game, la partita, o qualcosa d’altro?',
    },
    tone: 'reflective',
    metrics: { energy: 64, motivation: 70, concentration: 62, emotional_management: 57, confidence: 59, pre_competition_anxiety: 54 },
    throughLine: 'Il punteggio non cambia il gesto: cambia il tempo che si concede.',
  },
  {
    day: '2026-07-31',
    hour: 18,
    theme: 'Riconoscere la tensione dalle spalle prima che dal punteggio',
    resource: 'Sente le spalle salire: un segnale che arriva presto',
    pivot: 'Il corpo lo dice prima della testa, se lo si ascolta',
    storyTitle: 'Una settimana storta, e un segnale che è arrivato comunque',
    lines: [
      { speaker: 'coach', text: 'Com’è andata questa settimana?' },
      { speaker: 'athlete', text: 'Male. Ho perso con uno che batto sempre e mi sono innervosito come i primi tempi.' },
      { speaker: 'coach', text: 'I due rimbalzi in più?' },
      { speaker: 'athlete', text: 'Spariti dal secondo set. Tutto quello che avevamo fatto, sparito.' },
      { speaker: 'coach', text: 'Prima che sparisse, qualcosa te lo aveva detto?' },
      { speaker: 'athlete', text: 'Le spalle. Le sento salire, me ne accorgo sempre. Ma poi non faccio niente.' },
      { speaker: 'coach', text: 'Te ne accorgi sempre. È un segnale che arriva presto, prima del punteggio.' },
      { speaker: 'athlete', text: 'Sì, arriva presto. Solo che lo registro e basta, come il meteo.' },
      { speaker: 'coach', text: 'Allora non aggiungiamo niente di nuovo: colleghiamo le spalle al respiro che sai già fare.' },
      { speaker: 'athlete', text: 'Spalle su, respiro. Va bene. Almeno è una cosa sola da ricordare.' },
    ],
    at: { theme: 5, resource: 7, pivot: 6, moment: 7, commitment: 8, missed: 1 },
    momentTitle: 'Registra il segnale e non lo usa',
    momentCategory: 'resistance',
    commitment: 'Quando senti le spalle salire, fai il respiro lungo. Un solo collegamento, niente altro.',
    prep: [
      'Chiedere della sconfitta con calma, senza farne un bilancio',
      'Verificare se il collegamento spalle-respiro è scattato almeno una volta',
    ],
    missed: {
      text: 'Ha detto «mi sono innervosito come i primi tempi», con un tono diverso dal resto.',
      followUp: 'Che cosa ti ha dato più fastidio: aver perso, o esserti rivisto com’eri prima?',
    },
    tone: 'frustrated',
    metrics: { energy: 52, motivation: 58, concentration: 49, emotional_management: 44, confidence: 46, pre_competition_anxiety: 66 },
    throughLine: 'Una ricaduta che non cancella il percorso: il segnale è arrivato lo stesso.',
  },
  {
    day: '2026-08-04',
    hour: 17,
    theme: 'Il tempo fra i punti come strumento, non come attesa',
    resource: 'Ha usato il collegamento spalle-respiro almeno tre volte',
    pivot: 'Venti secondi non sono una pausa: sono la preparazione del punto dopo',
    storyTitle: 'Venti secondi che diventano un posto dove stare',
    lines: [
      { speaker: 'coach', text: 'Le spalle e il respiro?' },
      { speaker: 'athlete', text: 'Tre volte, e due hanno funzionato. La terza ero già partito.' },
      { speaker: 'coach', text: 'Due su tre dopo una settimana storta è tanto. Che cosa fai negli altri venti secondi?' },
      { speaker: 'athlete', text: 'Aspetto. Guardo la racchetta, aspetto che passi.' },
      { speaker: 'coach', text: 'Aspetti che passi che cosa?' },
      { speaker: 'athlete', text: 'Il fastidio del punto prima, credo. Come se dovesse smaltirsi da solo.' },
      { speaker: 'coach', text: 'E se quei venti secondi fossero la preparazione del punto dopo, invece dello smaltimento di quello prima?' },
      { speaker: 'athlete', text: 'Cambierebbe la direzione. Adesso guardo indietro, dovrei guardare avanti.' },
      { speaker: 'coach', text: 'Esatto. Respiro, poi la parola della direzione. In quest’ordine.' },
      { speaker: 'athlete', text: 'Respiro e direzione. Mi sembra di avere finalmente qualcosa da fare, non da evitare.' },
    ],
    at: { theme: 3, resource: 1, pivot: 6, moment: 7, commitment: 8, missed: 5 },
    momentTitle: 'Da smaltire il punto prima a preparare quello dopo',
    momentCategory: 'turning_point',
    commitment: 'Nei venti secondi fra i punti: prima il respiro, poi la parola della direzione. In quest’ordine.',
    prep: [
      'Chiedere se la sequenza ha retto anche a fine partita, quando si è stanchi',
      'Riprendere l’idea che il fastidio non deve smaltirsi da solo',
    ],
    missed: {
      text: 'Ha detto che il fastidio «dovrebbe smaltirsi da solo», come se non ci fosse niente da fare.',
      followUp: 'Dove l’hai imparato che certe cose devono passare da sole?',
    },
    tone: 'open',
    metrics: { energy: 66, motivation: 72, concentration: 64, emotional_management: 60, confidence: 61, pre_competition_anxiety: 51 },
    throughLine: 'Il tempo fra i punti passa da vuoto da sopportare a spazio da usare.',
  },
  {
    day: '2026-08-07',
    hour: 18,
    theme: 'Rientrare nel gioco dopo un game perso',
    resource: 'La sequenza respiro-direzione ora parte da sola',
    pivot: 'Il game perso finisce quando si cambia campo, non quando smette di bruciare',
    storyTitle: 'Il cambio campo come confine',
    lines: [
      { speaker: 'coach', text: 'La sequenza?' },
      { speaker: 'athlete', text: 'Parte da sola ormai. Non ci penso più, la faccio.' },
      { speaker: 'coach', text: 'E quando è un game intero ad andare storto, non un punto?' },
      { speaker: 'athlete', text: 'Lì mi dura. Me lo porto dietro per due o tre game, a volte tutto il set.' },
      { speaker: 'coach', text: 'Che cosa segna la fine di un game, per il regolamento?' },
      { speaker: 'athlete', text: 'Il punto finale. E ogni due, il cambio campo.' },
      { speaker: 'coach', text: 'Il cambio campo è un confine già dato. Potrebbe essere il tuo.' },
      { speaker: 'athlete', text: 'Nel senso che quando mi siedo, quel game è chiuso comunque sia andato.' },
      { speaker: 'coach', text: 'Sì. Non perché è passato il fastidio, ma perché lo decidi tu che è chiuso.' },
      { speaker: 'athlete', text: 'Mi piace perché non dipende da come mi sento. Dipende dalla sedia.' },
    ],
    at: { theme: 3, resource: 1, pivot: 8, moment: 9, commitment: 6, missed: 3 },
    momentTitle: 'Un confine che non dipende da come ci si sente',
    momentCategory: 'exercise',
    commitment: 'Al cambio campo, dichiara chiuso il game precedente comunque sia andato. Anche a voce bassa.',
    prep: [
      'Verificare se il confine ha retto dopo un game perso male',
      'Chiedere quanto è durato il fastidio rispetto a prima',
    ],
    missed: {
      text: 'Ha detto «a volte tutto il set» senza cambiare tono, come se fosse normale.',
      followUp: 'Quando ti dura tutto il set, che cosa ti dici alla fine della partita?',
    },
    tone: 'enthusiastic',
    metrics: { energy: 70, motivation: 75, concentration: 68, emotional_management: 64, confidence: 66, pre_competition_anxiety: 48 },
    throughLine: 'Da «finisce quando smette di bruciare» a «finisce quando lo decido».',
  },
  {
    day: '2026-08-11',
    hour: 17,
    theme: 'Dire all’allenatore che cosa serve davvero',
    resource: 'Sa distinguere una correzione utile da una che lo blocca',
    pivot: 'Chiedere una cosa alla volta è una richiesta, non una pretesa',
    storyTitle: 'Una frase da dire a bordo campo',
    lines: [
      { speaker: 'coach', text: 'Il confine al cambio campo?' },
      { speaker: 'athlete', text: 'Ha tenuto. Due volte su tre, e la terza ero sotto di un set.' },
      { speaker: 'coach', text: 'C’è qualcosa che ti rimette dentro la testa vecchia?' },
      { speaker: 'athlete', text: 'Sì. Quando il mio allenatore mi dice tre cose insieme fra un game e l’altro.' },
      { speaker: 'coach', text: 'Che cosa succede dentro quando arrivano tre cose insieme?' },
      { speaker: 'athlete', text: 'Che le perdo tutte e mi sento sotto esame. Se me ne dice una la faccio.' },
      { speaker: 'coach', text: 'Quindi sai distinguere una correzione che ti serve da una che ti blocca.' },
      { speaker: 'athlete', text: 'Sì, ma non gliel’ho mai detto. Mi sembra di fare il difficile.' },
      { speaker: 'coach', text: 'Chiedere una cosa alla volta non è fare il difficile. È dirgli come funzioni.' },
      { speaker: 'athlete', text: 'Provo a dirglielo prima dell’allenamento, non durante. Durante non mi verrebbe.' },
    ],
    at: { theme: 3, resource: 5, pivot: 8, moment: 7, commitment: 9, missed: 5 },
    momentTitle: 'Non gliel’ha mai detto',
    momentCategory: 'risk',
    commitment: 'Prima del prossimo allenamento, chiedi al tuo allenatore una correzione alla volta.',
    prep: [
      'Chiedere com’è andata la conversazione, non solo se è avvenuta',
      'Riprendere il «mi sembra di fare il difficile»',
    ],
    missed: {
      text: 'Ha detto «mi sento sotto esame» e siamo andati subito sulla soluzione.',
      followUp: 'Sotto esame di chi? Chi è che ti sta valutando, in quel momento?',
    },
    tone: 'hesitant',
    metrics: { energy: 69, motivation: 74, concentration: 70, emotional_management: 66, confidence: 63, pre_competition_anxiety: 50 },
    throughLine: 'Il lavoro esce dal campo: riguarda anche chi gli sta intorno.',
  },
  {
    day: '2026-08-14',
    hour: 18,
    theme: 'Preparare il match la sera prima senza rimuginare',
    resource: 'Scrivere gli è già servito una volta, mesi fa',
    pivot: 'La differenza fra preparare e rimuginare è che preparare finisce',
    storyTitle: 'Una lista che si chiude',
    lines: [
      { speaker: 'coach', text: 'Hai parlato con il tuo allenatore?' },
      { speaker: 'athlete', text: 'Sì. Ha detto va bene senza farne un caso. Mi sono preoccupato per niente.' },
      { speaker: 'coach', text: 'Come dormi la sera prima di una partita?' },
      { speaker: 'athlete', text: 'Male. Rigioco la partita prima di giocarla, e mai una versione in cui vinco.' },
      { speaker: 'coach', text: 'Quanto dura?' },
      { speaker: 'athlete', text: 'Finché mi addormento. Non finisce, si interrompe.' },
      { speaker: 'coach', text: 'Ecco la differenza: preparare finisce, rimuginare si interrompe.' },
      { speaker: 'athlete', text: 'Quando scrivevo le cose sul quaderno, a marzo, dormivo meglio. Poi ho smesso.' },
      { speaker: 'coach', text: 'Tre righe la sera prima: dove servo, cosa faccio al cambio campo, una cosa che mi piace del mio gioco.' },
      { speaker: 'athlete', text: 'Tre righe e chiudo il quaderno. Almeno c’è un punto in cui ho finito.' },
    ],
    at: { theme: 3, resource: 7, pivot: 6, moment: 6, commitment: 8, missed: 1 },
    momentTitle: 'Preparare finisce, rimuginare si interrompe',
    momentCategory: 'awareness',
    commitment: 'La sera prima del match, scrivi tre righe e chiudi il quaderno.',
    prep: [
      'Chiedere se il quaderno si è chiuso davvero, o è rimasto aperto',
      'Verificare la qualità del sonno la sera prima',
    ],
    missed: {
      text: 'Ha detto «mai una versione in cui vinco» e siamo passati alla durata.',
      followUp: 'Come sarebbe la versione in cui vinci? L’hai mai immaginata fino in fondo?',
    },
    tone: 'reflective',
    metrics: { energy: 63, motivation: 71, concentration: 66, emotional_management: 61, confidence: 60, pre_competition_anxiety: 57 },
    throughLine: 'Il lavoro entra nelle ore prima della partita, non solo nei venti secondi fra i punti.',
  },
  {
    day: '2026-08-18',
    hour: 17,
    theme: 'Reggere il primo set quando l’avversario parte forte',
    resource: 'Il quaderno chiuso ha migliorato il sonno',
    pivot: 'Il primo set non si vince: si resta abbastanza vicini da giocare il secondo',
    storyTitle: 'Restare attaccati',
    lines: [
      { speaker: 'coach', text: 'Il quaderno?' },
      { speaker: 'athlete', text: 'Tre volte su quattro. E dormo meglio, si vede il giorno dopo.' },
      { speaker: 'coach', text: 'Che cosa resta il pezzo più difficile adesso?' },
      { speaker: 'athlete', text: 'Quando l’altro parte fortissimo. Sotto 3-0 comincio a fare conti che non servono.' },
      { speaker: 'coach', text: 'Che conti fai?' },
      { speaker: 'athlete', text: 'Quanti game mi servono, se ho ancora tempo, se il set è andato. Roba inutile.' },
      { speaker: 'coach', text: 'Un primo set contro chi parte forte, spesso non si vince. Si resta vicini.' },
      { speaker: 'athlete', text: 'Cioè l’obiettivo non è recuperare, è non staccarmi.' },
      { speaker: 'coach', text: 'Sì. E «non staccarsi» è una cosa che si fa un punto per volta, coi tuoi venti secondi.' },
      { speaker: 'athlete', text: 'Così ho un obiettivo che dipende da me anche mentre sto perdendo.' },
    ],
    at: { theme: 3, resource: 1, pivot: 6, moment: 9, commitment: 8, missed: 5 },
    momentTitle: 'Un obiettivo che dipende da lui anche mentre perde',
    momentCategory: 'goal',
    commitment: 'Sotto di tre game, l’obiettivo è restare attaccati un punto per volta: niente conti.',
    prep: [
      'Verificare se i conti sono tornati e a che punteggio',
      'Chiedere che cosa vuol dire «restare attaccati» in un punto concreto',
    ],
    missed: {
      text: 'Ha liquidato i conti come «roba inutile» e siamo andati oltre.',
      followUp: 'Quei conti a che cosa ti servono, davvero? Che cosa proverebbero se tornassero?',
    },
    tone: 'open',
    metrics: { energy: 72, motivation: 78, concentration: 73, emotional_management: 69, confidence: 70, pre_competition_anxiety: 44 },
    throughLine: 'Un obiettivo che regge anche quando il punteggio non aiuta.',
  },
  {
    day: '2026-08-21',
    hour: 18,
    theme: 'Chiudere il punto invece di aspettare l’errore dell’altro',
    resource: 'Sotto pressione ora sceglie, non subisce',
    pivot: 'Aspettare l’errore è una scelta anche quando sembra prudenza',
    storyTitle: 'Da difendere bene a decidere',
    lines: [
      { speaker: 'coach', text: 'Come è andata la partita di domenica?' },
      { speaker: 'athlete', text: 'Persa 7-5 al terzo, ma è la prima volta che alla fine non ero arrabbiato.' },
      { speaker: 'coach', text: 'Che cosa hai visto che prima non vedevi?' },
      { speaker: 'athlete', text: 'Che sui punti importanti rimetto la palla e aspetto. Non decido io, aspetto lui.' },
      { speaker: 'coach', text: 'E aspettare com’è, dentro?' },
      { speaker: 'athlete', text: 'Sembra prudenza. Ma è comoda: se sbaglia lui non ho rischiato niente io.' },
      { speaker: 'coach', text: 'Quindi anche aspettare è una scelta, solo che non ha il tuo nome sopra.' },
      { speaker: 'athlete', text: 'Detta così è peggio del rischiare. Almeno rischiando è mia.' },
      { speaker: 'coach', text: 'Sui punti importanti del prossimo allenamento: una palla decisa tu, comunque vada.' },
      { speaker: 'athlete', text: 'Una decisa io. E se sbaglio, pazienza, la firmo.' },
    ],
    at: { theme: 3, resource: 5, pivot: 6, moment: 7, commitment: 8, missed: 1 },
    momentTitle: 'Anche aspettare è una scelta',
    momentCategory: 'turning_point',
    commitment: 'Sui punti importanti, gioca una palla decisa da te comunque vada.',
    prep: [
      'Chiedere quante palle ha deciso lui e come si è sentito dopo',
      'Riprendere il «non ero arrabbiato» dopo una sconfitta',
    ],
    missed: {
      text: 'Ha detto che dopo una sconfitta non era arrabbiato, e siamo andati subito sul tattico.',
      followUp: 'Che cosa è cambiato, perché una sconfitta non ti lasci più arrabbiato?',
    },
    tone: 'enthusiastic',
    metrics: { energy: 75, motivation: 82, concentration: 76, emotional_management: 74, confidence: 75, pre_competition_anxiety: 39 },
    throughLine: 'Il percorso arriva alla scelta: non più gestire l’errore, ma decidere il punto.',
  },
];

/** Da 0-100 a un intero 1-5: la scala che il contratto ammette. */
function suCinque(valore: number): number {
  return Math.max(1, Math.min(5, Math.round(valore / 20)));
}

function evidenceAt(
  spec: Spec,
  segmentIds: number[],
  index: number
): {
  transcriptSegmentId: number;
  startMs: number;
  endMs: number;
  minute: number;
  speaker: CompassSpeaker;
  quote: string;
} {
  const line = spec.lines[index];
  const startMs = index * SEGMENT_GAP_MS;
  return {
    transcriptSegmentId: segmentIds[index],
    startMs,
    endMs: startMs + 40_000,
    minute: Math.floor(startMs / 60_000),
    speaker: line.speaker,
    // La citazione deve comparire davvero nel segmento: e' cio' che rende
    // l'evidenza verificabile invece che decorativa.
    quote: line.text.slice(0, 200),
  };
}

async function main() {
  const apply = process.argv.includes('--apply');

  const [athlete] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, ATHLETE_EMAIL))
    .limit(1);
  if (!athlete) throw new Error(`Atleta ${ATHLETE_EMAIL} non trovato.`);

  // Il coach e il servizio si ricavano dalle sedute che gia' esistono: cosi'
  // le nuove appartengono allo stesso percorso invece di inventarne un altro.
  const [modello] = await db
    .select({
      providerId: bookings.providerId,
      serviceId: bookings.serviceId,
      requestedBy: sessionAiNotes.requestedBy,
      durationMin: bookings.durationMin,
    })
    .from(bookings)
    .innerJoin(sessionAiNotes, eq(sessionAiNotes.bookingId, bookings.id))
    .where(eq(bookings.clientId, athlete.id))
    .limit(1);
  if (!modello) throw new Error('Nessuna seduta esistente da cui ricavare coach e servizio.');

  const [profilo] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.id, modello.providerId))
    .limit(1);
  if (!profilo) throw new Error('Profilo coach non trovato.');

  const gia = await db
    .select({ note: bookings.note })
    .from(bookings)
    .where(and(eq(bookings.clientId, athlete.id), like(bookings.note, `%${MARKER}%`)));
  const gaFatti = new Set(gia.map((r) => r.note ?? ''));

  console.log(`Atleta: ${athlete.name} (${athlete.id})`);
  console.log(`Coach: profilo ${modello.providerId}, servizio ${modello.serviceId}`);
  console.log(`Sedute gia' presenti con il marcatore: ${gaFatti.size}`);
  console.log(apply ? '\nSCRITTURA IN CORSO\n' : '\nANTEPRIMA (usa --apply per scrivere)\n');

  let creati = 0;
  for (const [index, spec] of SPECS.entries()) {
    const note = `${spec.theme} · ${MARKER}-${index + 1}`;
    if ([...gaFatti].some((n) => n.endsWith(`${MARKER}-${index + 1}`))) {
      console.log(`  ${spec.day}  gia' presente, salto`);
      continue;
    }
    if (!apply) {
      console.log(`  ${spec.day}  creerei: ${spec.theme}`);
      continue;
    }

    const scheduledFor = new Date(`${spec.day}T${String(spec.hour).padStart(2, '0')}:00:00`);
    const durata = modello.durationMin ?? 60;

    const [booking] = await db
      .insert(bookings)
      .values({
        clientId: athlete.id,
        providerId: modello.providerId,
        serviceId: modello.serviceId,
        status: 'completed',
        note,
        scheduledFor,
        durationMin: durata,
        requestedAt: new Date(scheduledFor.getTime() - 5 * 24 * 3600 * 1000),
        decidedAt: new Date(scheduledFor.getTime() - 4 * 24 * 3600 * 1000),
        completedAt: new Date(scheduledFor.getTime() + durata * 60 * 1000),
        sessionStartedAt: scheduledFor,
        sessionEndedAt: new Date(scheduledFor.getTime() + durata * 60 * 1000),
        createdBy: modello.requestedBy,
        updatedBy: modello.requestedBy,
      })
      .returning({ id: bookings.id });

    const [note_] = await db
      .insert(sessionAiNotes)
      .values({
        bookingId: booking.id,
        livekitRoomName: `booking-${booking.id}`,
        requestedBy: modello.requestedBy,
        status: 'approved',
      })
      .returning({ id: sessionAiNotes.id });

    const segmenti = await db
      .insert(sessionTranscriptSegments)
      .values(
        spec.lines.map((line, i) => ({
          sessionAiNotesId: note_.id,
          speakerRole: line.speaker,
          sequenceNumber: i + 1,
          startedAtMs: i * SEGMENT_GAP_MS,
          endedAtMs: i * SEGMENT_GAP_MS + 40_000,
          text: line.text,
        }))
      )
      .returning({ id: sessionTranscriptSegments.id });

    const ids = segmenti.map((s) => s.id);
    const ev = (i: number) => evidenceAt(spec, ids, i);
    const slug = `lorenzo-x${index + 1}`;

    const documento = {
      schemaVersion: SESSION_COMPASS_SCHEMA_VERSION,
      reportKind: SESSION_COMPASS_REPORT_KIND,
      sessionId: String(note_.id),
      sourceFingerprint: `${MARKER}-${index + 1}`,
      language: 'it',
      sessionOverview: {
        summary: `La seduta mette a fuoco “${spec.theme}”. ${athlete.name} porta un episodio della settimana, riconosce una risorsa che usa già e concorda una prova osservabile per il prossimo allenamento.`,
        summaryEvidence: [ev(spec.at.theme)],
        themes: [
          { id: `${slug}-theme-main`, text: spec.theme, evidence: ev(spec.at.theme) },
          { id: `${slug}-theme-resource`, text: spec.resource, evidence: ev(spec.at.resource) },
          { id: `${slug}-theme-pivot`, text: spec.pivot, evidence: ev(spec.at.pivot) },
        ],
        emergingResource: {
          id: `${slug}-resource`,
          text: spec.resource,
          evidence: ev(spec.at.resource),
        },
        /*
         * Quante metriche, e perche' non sei.
         *
         * Il prodotto ne produce pochissime: il prompt ne inserisce una **solo
         * quando una frase esplicita dell'atleta la sostiene**, e su quindici
         * sedute reali sono tredici valori in tutto — meno di uno per seduta,
         * mai piu' di tre, e circa una su tre senza nessuna metrica.
         *
         * La prima versione di questo script ne metteva sei su ogni seduta, e
         * disegnava un grafico con sei serie storiche piene. Una demo che
         * mostra una cosa che il prodotto non produce non e' una demo
         * generosa: e' una promessa che qualcuno verra' a riscuotere sui
         * propri dati.
         */
        metrics: (Object.entries(spec.metrics) as [SessionMetricKey, number][])
          .slice(0, index % 3 === 0 ? 0 : index % 3 === 1 ? 1 : 2)
          .map(([key, value]) => ({
            id: `${slug}-metric-${key}`,
            key,
            value: suCinque(value),
            confidence: 'medium' as const,
            evidence: ev(spec.at.theme),
          })),
        // Da -2 a +2, come vuole il contratto: e' un andamento qualitativo,
        // non una percentuale.
        emotionalTrend: [
          { id: `${slug}-trend-1`, value: Math.max(-2, suCinque(spec.metrics.emotional_management) - 4), label: 'Apertura', evidence: ev(0) },
          { id: `${slug}-trend-2`, value: suCinque(spec.metrics.emotional_management) - 3, label: 'Al centro', evidence: ev(spec.at.pivot) },
          { id: `${slug}-trend-3`, value: Math.min(2, suCinque(spec.metrics.emotional_management) - 2), label: 'Chiusura', evidence: ev(spec.lines.length - 1) },
        ],
        conversationParticipation: {
          athleteTalkMs: 18 * 60 * 1000,
          coachTalkMs: 12 * 60 * 1000,
          athleteTurns: spec.lines.filter((l) => l.speaker === 'athlete').length,
          coachTurns: spec.lines.filter((l) => l.speaker === 'coach').length,
          athleteSharePercent: 60,
        },
        conversationTone: {
          key: spec.tone,
          description: 'Rilevato dalle parole dell’atleta, non dal tono di voce.',
          confidence: 'medium' as const,
          evidence: ev(spec.at.moment),
        },
      },
      keyMoments: [
        {
          id: `${slug}-moment`,
          title: spec.momentTitle,
          explanation: 'Il passaggio in cui la conversazione cambia direzione: da come ci si sente a che cosa si può fare.',
          speaker: spec.lines[spec.at.moment].speaker,
          evidence: ev(spec.at.moment),
          category: spec.momentCategory,
          theme: spec.theme,
          relevance: 3 as const,
        },
      ],
      missedOpportunities: [
        {
          id: `${slug}-missed`,
          text: spec.missed.text,
          followUp: spec.missed.followUp,
          evidence: ev(spec.at.missed),
        },
      ],
      story: {
        title: spec.storyTitle,
        paragraphs: [
          {
            id: `${slug}-story-1`,
            text: `La seduta si apre sul compito della volta precedente, e ${athlete.name} ne parla con una precisione che qualche mese fa non c’era: sa dire quante volte è successo e in quali situazioni.`,
            evidence: ev(0),
          },
          {
            id: `${slug}-story-2`,
            text: `Il centro della conversazione è ${spec.theme.toLowerCase()}. Non arriva come una spiegazione del coach: emerge da un episodio che l’atleta racconta da sé.`,
            evidence: ev(spec.at.theme),
          },
          {
            id: `${slug}-story-3`,
            text: `${spec.pivot}. È il punto in cui la seduta gira, e da lì l’impegno per la settimana si scrive quasi da solo.`,
            evidence: ev(spec.at.pivot),
          },
        ],
        throughLine: spec.throughLine,
      },
      commitments: [
        {
          id: `${slug}-commitment`,
          text: spec.commitment,
          owner: 'athlete' as const,
          status: (index < SPECS.length - 3 ? 'done' : index === SPECS.length - 1 ? 'pending' : 'in_progress') as
            | 'done'
            | 'in_progress'
            | 'pending',
          dueDate: null,
          evidence: ev(spec.at.commitment),
        },
      ],
      nextSessionPrep: spec.prep.map((text, i) => ({
        id: `${slug}-prep-${i + 1}`,
        text,
        origin: (i === 0 ? 'commitment' : 'open_question') as 'commitment' | 'open_question',
        evidence: ev(spec.at.commitment),
      })),
      coachNote: null,
      generation: {
        provider: 'kaipai_demo_seed',
        model: 'synthetic-fixture-v1',
        promptVersion: 'lorenzo-journey-v1',
        contractVersion: SESSION_COMPASS_SCHEMA_VERSION,
        generatedAt: new Date(scheduledFor.getTime() + 90 * 60 * 1000).toISOString(),
      },
    };

    await db.insert(sessionAiReports).values({
      sessionAiNotesId: note_.id,
      status: 'approved',
      reportVersion: 1,
      reportKind: SESSION_COMPASS_REPORT_KIND,
      generatedReportJson: documento,
      generatedByProvider: 'kaipai_demo_seed',
      generatedByModel: 'synthetic-fixture-v1',
      promptVersion: 'lorenzo-journey-v1',
      approvedBy: modello.requestedBy,
      approvedAt: new Date(scheduledFor.getTime() + 2 * 3600 * 1000),
      sourceFingerprint: `${MARKER}-${index + 1}`,
    });

    creati += 1;
    console.log(`  ${spec.day}  creata — prenotazione ${booking.id}, seduta ${note_.id}, ${ids.length} segmenti`);
  }

  console.log(`\nSedute create: ${creati}`);

  /**
   * Gli agganci fra obiettivi e sedute.
   *
   * Senza, la scheda mostra tre righe di pallini spenti con «nessuna seduta
   * agganciata» — comportamento giusto, perche' i pallini li accende il coach,
   * ma su un atleta di dimostrazione racconta il contrario di quello che quel
   * blocco serve a far vedere.
   *
   * La distribuzione rispecchia lo stato dichiarato di ogni obiettivo: il primo
   * attraversa tutto il percorso, il secondo parte a meta', il terzo si ferma
   * presto — che e' esattamente cio' che «da riprendere» racconta.
   */
  const obiettivi = await db
    .select({ id: athleteJourneyGoals.id, title: athleteJourneyGoals.title })
    .from(athleteJourneyGoals)
    .where(eq(athleteJourneyGoals.athleteUserId, athlete.id))
    .orderBy(athleteJourneyGoals.position, athleteJourneyGoals.id);

  const sedute = await db
    .select({ id: sessionAiNotes.id })
    .from(sessionAiNotes)
    .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .where(eq(bookings.clientId, athlete.id))
    .orderBy(bookings.scheduledFor);

  const regole: Array<(i: number, n: number) => boolean> = [
    (i, n) => i % 2 === 0 || i >= n - 3,
    (i, n) => i >= Math.floor(n / 2),
    (i) => i < 2,
  ];

  let agganci = 0;
  for (const [gi, obiettivo] of obiettivi.entries()) {
    const regola = regole[gi] ?? (() => false);
    const ids = sedute.filter((_, i) => regola(i, sedute.length)).map((s) => s.id);
    if (ids.length === 0) continue;
    const etichetta = obiettivo.title.slice(0, 42);
    if (!apply) {
      console.log(`  obiettivo «${etichetta}…» → ${ids.length} sedute`);
      continue;
    }
    await db
      .insert(athleteJourneyGoalSessions)
      .values(
        ids.map((sessionAiNotesId) => ({
          goalId: obiettivo.id,
          sessionAiNotesId,
          source: 'coach' as const,
          createdBy: modello.requestedBy,
        }))
      )
      .onConflictDoNothing();
    agganci += ids.length;
    console.log(`  obiettivo «${etichetta}…» → ${ids.length} sedute agganciate`);
  }
  console.log(`Agganci scritti: ${agganci}`);

  if (!apply) console.log('Nessuna scrittura eseguita. Rilancia con --apply.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
