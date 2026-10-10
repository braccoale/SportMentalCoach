import type { BlogArticle } from '../index';

/**
 * Primo articolo del blog. Indicizzato il 2026-10-10 su decisione del titolare
 * del sito (`reviewed: true`).
 *
 * Regole seguite nella scrittura, da tenere anche nelle revisioni:
 * - nessuna statistica senza fonte: meglio nessun numero che uno inventato;
 * - il limite clinico è detto chiaramente (è lo stesso delle FAQ del sito);
 * - gli strumenti descritti sono quelli che un mental coach usa davvero, non
 *   promesse di risultato.
 */
export const ANSIA_DA_PRESTAZIONE: BlogArticle = {
  slug: 'ansia-da-prestazione-sport',
  title: 'Ansia da prestazione nello sport: cos’è e come si allena',
  seoTitle: 'Ansia da prestazione nello sport: come si allena',
  description:
    'Cos’è l’ansia da prestazione, come riconoscerla prima di una gara e cinque strumenti concreti per allenarla, dalla respirazione alla routine pre-gara.',
  publishedAt: '2026-09-08',
  author: {
    name: 'Francesco Borrelli',
    role: 'Fondatore di KaiPai · Mental coach sportivo',
    href: '/chi-siamo',
  },
  image: {
    src: '/blog/ansia-da-prestazione.webp',
    alt: 'Una nuotatrice concentrata, con la cuffia KaiPai, a bordo vasca',
    og: '/og/blog-ansia-da-prestazione.jpg',
  },
  related: { href: '/atleti', label: 'Mental coaching per atleti' },
  tags: ['Ansia da prestazione', 'Gestione della pressione', 'Routine pre-gara'],
  reviewed: true,
  blocks: [
    {
      type: 'p',
      text: 'In allenamento esce tutto. In partita, alla prima battuta sbagliata, le gambe si irrigidiscono, il respiro si accorcia e la testa torna sull’errore invece di restare sull’azione. Se ti riconosci in questa scena non sei un caso strano: è ansia da prestazione, e capita a chi fa sport a ogni livello, dal settore giovanile alla nazionale.',
    },
    {
      type: 'p',
      text: 'La buona notizia è che non è un difetto di carattere. È una risposta del corpo e della mente a una situazione che conta, e come ogni risposta si può allenare.',
    },
    { type: 'h2', id: 'cos-e', text: 'Che cos’è l’ansia da prestazione' },
    {
      type: 'p',
      text: 'Prima di una gara il corpo si prepara ad agire: il cuore accelera, i muscoli si attivano, l’attenzione si stringe. Fino a un certo punto questa attivazione aiuta, perché ti rende pronto e reattivo. Diventa ansia da prestazione quando supera la soglia utile e comincia a lavorare contro di te: i movimenti perdono fluidità, le decisioni si fanno lente, i pensieri vanno sul risultato invece che su quello che devi fare adesso.',
    },
    {
      type: 'p',
      text: 'Il punto non è eliminare la tensione. Una gara senza nessuna attivazione di solito è una gara giocata sotto tono. Il punto è imparare a riportarla nella zona in cui ti serve.',
    },
    { type: 'h2', id: 'segnali', text: 'Come si riconosce' },
    {
      type: 'p',
      text: 'Ognuno ha i suoi segnali, e il primo passo è conoscere i propri. I più comuni stanno su tre piani:',
    },
    {
      type: 'list',
      items: [
        'Nel corpo: respiro corto e alto, mani fredde o sudate, muscoli rigidi, stomaco chiuso, bisogno di andare in bagno prima di entrare in campo.',
        'Nei pensieri: «e se sbaglio?», «tutti mi stanno guardando», l’errore di prima che torna in testa mentre l’azione va avanti.',
        'Nei comportamenti: smettere di cercare la palla, giocare per non sbagliare invece che per vincere, rendere molto meno in gara che in allenamento.',
      ],
    },
    { type: 'h2', id: 'perche', text: 'Perché succede' },
    {
      type: 'p',
      text: 'Dietro l’ansia da prestazione ci sono quasi sempre gli stessi meccanismi. Il più frequente è spostare l’attenzione dal processo al risultato: invece di pensare al prossimo gesto, si pensa al punteggio, alla convocazione, a cosa diranno. Un altro è il peso del giudizio, reale o immaginato, di allenatore, compagni e famiglia. Il terzo è l’errore che resta addosso: un momento negativo che non si chiude e contamina i successivi.',
    },
    {
      type: 'p',
      text: 'Riconoscere quale di questi meccanismi scatta per primo è già metà del lavoro, perché indica dove intervenire.',
    },
    { type: 'h2', id: 'strumenti', text: 'Cinque strumenti per allenarla' },
    {
      type: 'p',
      text: 'Nessuno di questi strumenti funziona la prima volta in partita. Funzionano se li provi prima in allenamento, quando la posta è bassa, finché diventano automatici.',
    },
    { type: 'h3', text: '1. Una respirazione che rallenta' },
    {
      type: 'p',
      text: 'Quando la tensione sale il respiro si fa corto e alto. Rallentarlo di proposito, con un’espirazione più lunga dell’inspirazione, manda al corpo un segnale di calma. Bastano pochi respiri tra un’azione e l’altra, nei tempi morti che ogni sport ha.',
    },
    { type: 'h3', text: '2. Una routine pre-gara tua' },
    {
      type: 'p',
      text: 'Una sequenza breve e sempre uguale prima di entrare in campo: gli stessi gesti, la stessa musica, la stessa frase. Non serve la superstizione, serve la ripetizione. La routine porta il corpo in uno stato conosciuto anche quando il contesto è nuovo.',
    },
    { type: 'h3', text: '3. Un reset dopo l’errore' },
    {
      type: 'p',
      text: 'L’errore arriva, sempre. Quello che puoi allenare è quanto ci metti a uscirne. Un gesto concreto (toccare i lacci, un respiro, una parola chiave) che segna la fine dell’azione sbagliata e l’inizio della prossima. Più lo ripeti, più il rientro si accorcia.',
    },
    { type: 'h3', text: '4. Un dialogo interno utile' },
    {
      type: 'p',
      text: 'Tutti parliamo con noi stessi mentre giochiamo. La differenza la fa il tono: «non sbagliare» concentra l’attenzione proprio sull’errore; «palla alta, spingi» la porta sul gesto da fare. Allenare il dialogo interno significa preparare in anticipo poche frasi brevi, concrete, al presente.',
    },
    { type: 'h3', text: '5. Obiettivi di processo, non solo di risultato' },
    {
      type: 'p',
      text: 'Il risultato non dipende solo da te; il processo sì. Darsi per la gara due o tre obiettivi su ciò che controlli (la comunicazione con i compagni, l’intensità nei primi minuti, il reset dopo ogni errore) riporta l’attenzione su quello che puoi fare adesso.',
    },
    { type: 'h2', id: 'genitori', text: 'Il ruolo di genitori e allenatori' },
    {
      type: 'p',
      text: 'Per un ragazzo il contesto conta quanto gli strumenti. Dopo la partita, una domanda come «ti sei divertito?» o «cosa hai provato a fare?» pesa molto meno di «quanti punti hai fatto?». Il sostegno vale di più quando non dipende dal risultato. Se sei un genitore, qui trovi [cosa puoi fare tu](/famiglie).',
    },
    { type: 'h2', id: 'quando-serve-aiuto', text: 'Quando serve un aiuto in più' },
    {
      type: 'callout',
      title: 'Il mental coaching non è una terapia',
      text: 'Se l’ansia non resta legata allo sport ma pesa anche a scuola, a casa, sul sonno o sull’alimentazione, o se porta a evitare qualunque situazione di giudizio, è il momento di rivolgersi a uno psicologo o a un medico. Un buon mental coach lo dice chiaramente e ti aiuta a trovare la figura giusta.',
    },
    {
      type: 'p',
      text: 'La differenza tra le due figure è spiegata bene nella nostra pagina su [mental coach e psicologo dello sport](/atleti).',
    },
    { type: 'h2', id: 'mental-coach', text: 'Come ti aiuta un mental coach' },
    {
      type: 'p',
      text: 'Un mental coach sportivo lavora con te proprio su questi strumenti: capire i tuoi segnali, costruire la tua routine, allenare il reset e il dialogo interno, fissare obiettivi di processo e verificare seduta dopo seduta cosa sta funzionando. Su KaiPai le sedute si fanno in videochiamata e [la prima sessione conoscitiva è gratuita](/atleti): è il modo più semplice per capire se è la strada giusta per te.',
    },
  ],
  faq: [
    {
      q: 'L’ansia da prestazione passa da sola?',
      a: 'A volte si attenua con l’esperienza, ma spesso resta finché non si lavora sul meccanismo che la scatena. Allenarla con strumenti concreti, prima in allenamento e poi in gara, di solito accorcia molto i tempi.',
    },
    {
      q: 'Un po’ di tensione prima della gara è normale?',
      a: 'Sì, ed è utile: un certo livello di attivazione ti rende pronto e reattivo. Diventa un problema quando supera la soglia che ti serve e comincia a peggiorare la prestazione.',
    },
    {
      q: 'Quando rivolgersi a uno psicologo invece che a un mental coach?',
      a: 'Quando l’ansia non riguarda solo lo sport ma pesa anche sulla vita di tutti i giorni (scuola, sonno, alimentazione, relazioni). Il mental coaching allena abilità legate alla prestazione e non sostituisce un percorso clinico.',
    },
  ],
};
