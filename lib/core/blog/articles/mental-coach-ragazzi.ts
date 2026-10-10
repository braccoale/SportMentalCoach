import type { BlogArticle } from '../index';

/**
 * Secondo articolo del blog, per i genitori. Indicizzato il 2026-10-10 su
 * decisione del titolare del sito (`reviewed: true`).
 *
 * Le regole sui minori citate qui sono quelle di `lib/core/guardians`
 * (registrazione dai 15 anni, autorizzazione del genitore fra 15 e 17 per
 * richiedere sedute, autorizzazione separata per la registrazione): se
 * cambiano là, questo testo va aggiornato.
 */
export const MENTAL_COACH_RAGAZZI: BlogArticle = {
  slug: 'mental-coach-per-ragazzi-come-sceglierlo',
  title: 'Mental coach per ragazzi: come sceglierlo (guida per genitori)',
  seoTitle: 'Mental coach per ragazzi: come sceglierlo',
  description:
    'Quando serve un mental coach a un giovane atleta, cosa chiedere prima di sceglierlo, i segnali d’allarme e come funziona con un figlio minorenne.',
  publishedAt: '2026-09-15',
  author: {
    name: 'Francesco Borrelli',
    role: 'Fondatore di KaiPai · Mental coach sportivo',
    href: '/chi-siamo',
  },
  image: {
    src: '/blog/mental-coach-ragazzi.webp',
    alt: 'Un giovane calciatore seduto sul prato al tramonto, con il pallone',
    og: '/og/blog-mental-coach-ragazzi.jpg',
  },
  related: { href: '/famiglie', label: 'Mental coaching per giovani atleti' },
  tags: ['Genitori', 'Giovani atleti', 'Scegliere un coach'],
  reviewed: true,
  blocks: [
    {
      type: 'p',
      text: 'Tuo figlio si allena con impegno, ma in partita si blocca. Oppure ha perso la voglia di andare al campo, o vive ogni gara come un esame. A un certo punto molti genitori si fanno la stessa domanda: potrebbe aiutarlo un mental coach? E se sì, come si sceglie quello giusto?',
    },
    {
      type: 'p',
      text: 'Questa guida non ha la pretesa di sostituire il confronto con un professionista. Vuole darti le domande giuste da farti, e da fare, prima di iniziare.',
    },
    { type: 'h2', id: 'quando-serve', text: 'Quando può servire un mental coach' },
    {
      type: 'p',
      text: 'Un mental coach sportivo aiuta un ragazzo ad allenare abilità mentali legate allo sport. Di solito ha senso pensarci quando:',
    },
    {
      type: 'list',
      items: [
        'rende molto meno in gara che in allenamento, e la tensione lo blocca;',
        'dopo un errore non riesce più a rientrare nella partita;',
        'ha perso motivazione, magari dopo un infortunio o una stagione difficile;',
        'si prepara a un passaggio importante: un cambio di categoria, una selezione, un torneo;',
        'vuole semplicemente crescere anche sul piano mentale, non solo tecnico e fisico.',
      ],
    },
    {
      type: 'p',
      text: 'Non serve aspettare che le cose vadano male. Allenare la testa quando va tutto bene è come allenare il fisico prima di infortunarsi: costruisce una base.',
    },
    { type: 'h2', id: 'coach-o-psicologo', text: 'Mental coach o psicologo?' },
    {
      type: 'p',
      text: 'È la prima domanda da chiarire. Il mental coach lavora sulla prestazione sportiva con chi sta bene e vuole rendere meglio. Lo psicologo, e lo psicoterapeuta, possono valutare e curare un disagio. Le due figure sono spesso complementari, ma non intercambiabili.',
    },
    {
      type: 'callout',
      title: 'Quando rivolgersi prima a uno psicologo',
      text: 'Se il malessere non resta legato allo sport ma si vede anche a scuola, a casa, nel sonno, nell’alimentazione o nelle relazioni, il primo passo è uno psicologo o il pediatra. Un mental coach serio lo riconosce e te lo dice.',
    },
    {
      type: 'p',
      text: 'Abbiamo spiegato la differenza più nel dettaglio nella pagina [per le famiglie](/famiglie).',
    },
    { type: 'h2', id: 'cosa-guardare', text: 'Cosa guardare prima di sceglierlo' },
    { type: 'h3', text: 'Formazione ed esperienza nello sport' },
    {
      type: 'p',
      text: 'Chiedi che formazione ha e con quali atleti ha lavorato. Conta soprattutto l’esperienza con ragazzi dell’età di tuo figlio e, se possibile, nel suo sport: un under 15 non ha le stesse esigenze di un professionista.',
    },
    { type: 'h3', text: 'Un metodo che sa spiegare' },
    {
      type: 'p',
      text: 'Un buon coach sa dire in parole semplici come lavora, su cosa, e come si capisce se il percorso sta funzionando. Diffida di chi promette risultati garantiti o tempi certi: la crescita mentale non è lineare.',
    },
    { type: 'h3', text: 'Obiettivi che appartengono al ragazzo' },
    {
      type: 'p',
      text: 'Il percorso funziona quando gli obiettivi sono di tuo figlio, non tuoi o dell’allenatore. Un buon coach li costruisce con lui, e li scrive: così, seduta dopo seduta, si vede dove si sta andando.',
    },
    { type: 'h3', text: 'Il feeling tra coach e ragazzo' },
    {
      type: 'p',
      text: 'Nessun curriculum sostituisce la fiducia. Se tuo figlio non si sente a suo agio, difficilmente si aprirà. Per questo è importante un primo incontro senza impegno, e la libertà di cambiare coach se non scatta niente.',
    },
    { type: 'h2', id: 'segnali-allarme', text: 'I segnali d’allarme' },
    {
      type: 'list',
      items: [
        'Promette risultati sportivi certi o in tempi precisi.',
        'Si propone di curare ansia, disturbi o problemi che vanno oltre lo sport.',
        'Chiede di lavorare con un minorenne senza coinvolgere i genitori.',
        'Non sa dire come lavora né come si misurano i progressi.',
        'Mette il ragazzo contro l’allenatore o la famiglia.',
      ],
    },
    { type: 'h2', id: 'minorenni', text: 'Se tuo figlio è minorenne' },
    {
      type: 'p',
      text: 'Con un minore il ruolo del genitore non è un dettaglio. Su KaiPai un ragazzo può registrarsi dai 15 anni ed esplorare la piattaforma, ma fino ai 18 anni non può richiedere sedute finché un genitore o il tutore legale non lo autorizza: arriva un’email con un link, si legge cosa si sta autorizzando e si conferma. L’autorizzazione si può revocare in qualsiasi momento.',
    },
    {
      type: 'p',
      text: 'Se il coach usa gli appunti AI della seduta, per un minorenne serve anche un’autorizzazione separata alla registrazione. E il ragazzo può comunque rifiutare all’inizio della seduta, che si svolge normalmente.',
    },
    { type: 'h2', id: 'riservatezza', text: 'Riservatezza: cosa sai tu e cosa resta a lui' },
    {
      type: 'p',
      text: 'Perché il coaching funzioni, il ragazzo deve potersi aprire, e per questo i contenuti delle sedute restano riservati. Tu resti il primo riferimento: puoi chiedere al coach un confronto sull’andamento generale e sugli obiettivi. La riservatezza non è mai un ostacolo alla tutela: se emerge qualcosa che riguarda la salute o la sicurezza di tuo figlio, vieni coinvolto.',
    },
    { type: 'h2', id: 'primo-incontro', text: 'Il primo incontro' },
    {
      type: 'p',
      text: 'Il primo incontro serve a capire se coach e ragazzo possono lavorare bene insieme. Su KaiPai è una [sessione conoscitiva gratuita](/famiglie) di 20 minuti in videochiamata, e potete farla insieme, genitore e figlio. È il momento giusto per fare le domande di questa guida e sentire come risponde.',
    },
  ],
  faq: [
    {
      q: 'Da che età ha senso un mental coach?',
      a: 'Il lavoro va adattato all’età. Su KaiPai ci si registra dai 15 anni; per i più giovani la modalità si concorda direttamente con il coach e con la famiglia.',
    },
    {
      q: 'Posso assistere alle sedute di mio figlio?',
      a: 'Il primo incontro potete farlo insieme. Poi, con gli adolescenti, di norma funziona meglio uno spazio autonomo, mentre tu resti il riferimento e ricevi il quadro generale del percorso.',
    },
    {
      q: 'Cosa succede se non si trova bene con il coach?',
      a: 'Può cambiarlo in qualsiasi momento. Anche con il nuovo coach la prima sessione conoscitiva è gratuita.',
    },
  ],
};
