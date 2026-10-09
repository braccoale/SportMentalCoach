import type { BlogArticle } from '../index';

/**
 * Bozza per l'indicizzazione, da far validare a Francesco Borrelli prima di
 * togliere `reviewed: false`.
 *
 * Ogni passo descritto è quello che il prodotto fa davvero (prenotazione su
 * richiesta e conferma del coach, videochiamata dentro KaiPai, Appunti AI solo
 * con consenso). Non si parla di prezzi né di pagamenti: oggi cambiano da una
 * fase all'altra, e la pagina «Quanto costa?» delle FAQ è l'unico posto dove
 * si dicono. Se un passo del prodotto cambia, questo testo va aggiornato.
 */
export const SEDUTA_ONLINE: BlogArticle = {
  slug: 'come-funziona-seduta-mental-coaching-online',
  title: 'Come funziona una seduta di mental coaching online',
  seoTitle: 'Seduta di mental coaching online: come funziona',
  description:
    'Come si prenota e come si svolge una seduta di mental coaching online: scelta del coach, conferma, videochiamata, sessione conoscitiva gratuita e dopo.',
  publishedAt: '2026-10-09',
  author: {
    name: 'Francesco Borrelli',
    role: 'Fondatore di KaiPai · Mental coach sportivo',
    href: '/chi-siamo',
  },
  image: {
    src: '/blog/ansia-da-prestazione.webp',
    alt: 'Un atleta seduto da solo nello spogliatoio, prima della gara',
    og: '/og/blog-ansia-da-prestazione.jpg',
  },
  related: { href: '/coaches', label: 'Trova il tuo coach' },
  tags: ['Mental coaching online', 'Prima seduta', 'Videochiamata'],
  reviewed: false,
  blocks: [
    {
      type: 'p',
      text: 'Se non hai mai fatto mental coaching, la prima domanda è semplice: cosa succede, davvero, dal momento in cui decidi di provare a quando finisce la prima seduta? Questa guida lo racconta passo per passo, come funziona su KaiPai.',
    },
    { type: 'h2', id: 'scegliere', text: '1. Scegli un coach' },
    {
      type: 'p',
      text: 'Nell’[elenco dei coach](/coaches) puoi filtrare per sport, specialità, livello e lingua. Ogni coach ha un profilo con la sua presentazione, i temi su cui lavora e la sua disponibilità. Non esiste un coach «migliore» in assoluto: esiste quello più adatto a te e a quello che vuoi allenare.',
    },
    { type: 'h2', id: 'prima-seduta', text: '2. Parti dalla sessione conoscitiva' },
    {
      type: 'p',
      text: 'La prima sessione è conoscitiva, dura 20 minuti ed è gratuita. Serve a conoscere il coach, raccontare cosa ti porta lì e capire se vi trovate bene. Non ti impegna a niente: se non scatta, puoi sceglierne un altro.',
    },
    { type: 'h2', id: 'richiesta', text: '3. Chiedi un orario libero' },
    {
      type: 'p',
      text: 'Il coach pubblica i suoi orari. Tu scegli uno spazio libero e mandi la richiesta, con due righe sui tuoi obiettivi se vuoi. Nulla è confermato finché il coach non risponde: può accettare o rifiutare. Se non risponde entro 48 ore la richiesta scade e non resta in sospeso.',
    },
    { type: 'h2', id: 'videochiamata', text: '4. La videochiamata, dentro KaiPai' },
    {
      type: 'p',
      text: 'La seduta si svolge in videochiamata dentro KaiPai, dal browser o dall’app, senza link esterni da cercare. Puoi entrare pochi minuti prima dell’orario. La durata si concorda con il coach e può andare da 10 a 60 minuti.',
    },
    {
      type: 'p',
      text: 'Cosa si fa, in concreto: si parte da quello che stai vivendo (una gara che si avvicina, un blocco, un momento difficile), si individua cosa vuoi cambiare e si lavora su strumenti pratici, da provare subito e da rifare tra una seduta e l’altra. Non è una chiacchierata senza direzione: a fine seduta dovresti sapere cosa fare nei giorni successivi.',
    },
    { type: 'h2', id: 'registrazione', text: 'Le sedute vengono registrate?' },
    {
      type: 'p',
      text: 'Solo con il tuo consenso. Il video non viene mai registrato. Se il coach usa gli Appunti AI, il consenso ti viene chiesto prima di iniziare e puoi rifiutare: la seduta si svolge normalmente anche così. Con il consenso viene registrato soltanto l’audio, trascritto e usato per preparare un riepilogo, che il coach rivede e approva prima che tu lo veda.',
    },
    { type: 'h2', id: 'dopo', text: '5. Dopo la seduta' },
    {
      type: 'p',
      text: 'Il percorso continua con la scheda dell’atleta: obiettivi, impegni da portare avanti tra una seduta e l’altra, andamento seduta dopo seduta. È pensata perché non si perda il filo, e il coach la usa per preparare l’incontro successivo.',
    },
    { type: 'h2', id: 'cancellare', text: 'Se non puoi esserci' },
    {
      type: 'p',
      text: 'Una seduta si può spostare o annullare dalla propria area. Il preavviso minimo è di 24 ore: sotto quel limite l’annullamento viene segnato come tardivo e la seduta può contare come svolta, a tutela del tempo del coach. Se è il coach ad annullare, per te non conta mai.',
    },
    {
      type: 'callout',
      title: 'Il mental coaching non è una terapia',
      text: 'Se in una seduta emerge un bisogno che va oltre lo sport (ansia che pesa anche a scuola, sul sonno o sulle relazioni, per esempio), il coach te lo dice e ti indirizza verso un professionista sanitario.',
    },
    { type: 'h2', id: 'iniziare', text: 'Come iniziare' },
    {
      type: 'p',
      text: 'Scegli un coach dall’[elenco](/coaches) e richiedi la sessione conoscitiva gratuita: sono pochi minuti, e dopo i primi venti saprai se è la strada giusta.',
    },
  ],
  faq: [
    {
      q: 'Serve un’app o basta il browser?',
      a: 'Basta il browser. Le sedute si svolgono in videochiamata dentro KaiPai, dal computer o dal telefono; c’è anche l’app.',
    },
    {
      q: 'Quanto dura una seduta?',
      a: 'La sessione conoscitiva dura 20 minuti. La durata delle sedute del percorso si concorda con il coach e può andare da 10 a 60 minuti.',
    },
    {
      q: 'Devo accendere la telecamera?',
      a: 'La seduta è una videochiamata, quindi di norma sì: serve a leggere come stai. Se hai bisogno di altro, dillo al coach.',
    },
    {
      q: 'Cosa succede se il coach non risponde?',
      a: 'Se non risponde entro 48 ore la richiesta scade e puoi sceglierne un altro, senza nessun impegno.',
    },
  ],
};
