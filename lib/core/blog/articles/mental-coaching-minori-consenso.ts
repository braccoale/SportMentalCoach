import type { BlogArticle } from '../index';

/**
 * Bozza per l'indicizzazione, da far validare a Francesco Borrelli prima di
 * togliere `reviewed: false`.
 *
 * Su minori e consenso un testo sbagliato è peggio di nessun testo: ogni
 * affermazione qui sotto è presa dalle regole vere del prodotto
 * (`lib/core/guardians`: registrazione dai 15 anni, autorizzazione del
 * genitore fra 15 e 17, testo del consenso `consent-document.ts`, revoca).
 * Se cambiano là, questa pagina va aggiornata insieme alla FAQ della home e
 * alla pagina `/famiglie`.
 */
export const MINORI_CONSENSO: BlogArticle = {
  slug: 'mental-coaching-minori-consenso-genitori',
  title: 'Mental coaching per minori: consenso dei genitori e riservatezza',
  seoTitle: 'Mental coaching per minori: consenso dei genitori',
  description:
    'Mental coaching per un minorenne: da che età, come si dà il consenso dei genitori, cosa viene registrato, la riservatezza e come revocare.',
  publishedAt: '2026-10-09',
  author: {
    name: 'Francesco Borrelli',
    role: 'Fondatore di KaiPai · Mental coach sportivo',
    href: '/chi-siamo',
  },
  image: {
    src: '/blog/mental-coaching-minori-consenso.webp',
    alt: 'Un ragazzo tra i genitori guarda il tramonto sulla città',
    og: '/og/blog-mental-coaching-minori-consenso.jpg',
  },
  related: { href: '/famiglie', label: 'KaiPai per le famiglie' },
  tags: ['Minori', 'Consenso dei genitori', 'Privacy'],
  reviewed: false,
  blocks: [
    {
      type: 'p',
      text: 'Se tuo figlio è minorenne, è giusto che tu sappia esattamente cosa succede prima, durante e dopo ogni seduta di mental coaching. Questa pagina lo spiega con le regole che usiamo davvero su KaiPai, senza giri di parole.',
    },
    { type: 'h2', id: 'eta', text: 'Da che età si può iniziare' },
    {
      type: 'list',
      items: [
        'Sotto i 15 anni non ci si può registrare su KaiPai.',
        'Dai 15 ai 17 anni ci si può registrare ed esplorare, ma per richiedere sedute serve l’autorizzazione di un genitore o di chi esercita la responsabilità genitoriale.',
        'Dai 18 anni non serve nessuna autorizzazione.',
      ],
    },
    { type: 'h2', id: 'consenso', text: 'Come si dà il consenso' },
    {
      type: 'p',
      text: 'Il genitore riceve un’email con un link personale e conferma in pochi minuti. Indica il proprio rapporto con il ragazzo (madre, padre o tutore legale) e, se agisce da solo, precisa se ha l’accordo dell’altro genitore, se esercita da solo la responsabilità o se è tutore legale. Il testo che accetta è sempre lo stesso e ne conserviamo la prova: se una parola cambia, la versione cambia e quella accettata resta quella che era.',
    },
    {
      type: 'p',
      text: 'Finché l’autorizzazione non c’è, il ragazzo non può prenotare né entrare in una seduta. Viene controllata ogni volta, anche all’ingresso: se nel frattempo è stata revocata, la seduta non parte.',
    },
    { type: 'h2', id: 'cosa-autorizzi', text: 'Cosa autorizzi' },
    {
      type: 'p',
      text: 'Autorizzi tuo figlio a svolgere sessioni di mental coaching sportivo, in videochiamata, con coach approvati dalla piattaforma. Il mental coaching non è psicoterapia, non formula diagnosi e non sostituisce prestazioni sanitarie o psicologiche.',
    },
    { type: 'h2', id: 'registrazione', text: 'Le sedute vengono registrate?' },
    {
      type: 'p',
      text: 'Il video non viene mai registrato. Gli Appunti AI sono un’opzione separata e facoltativa: se li autorizzi, prima di ogni registrazione servono comunque il consenso specifico del coach e quello di tuo figlio. In quel caso viene registrato soltanto l’audio, che può essere trascritto per preparare una bozza di riepilogo, che il coach rivede prima di condividerla. Se non li autorizzi, il ragazzo svolge le sedute normalmente, senza registrazione né trascrizione.',
    },
    { type: 'h2', id: 'riservatezza', text: 'Riservatezza e sicurezza' },
    {
      type: 'p',
      text: 'Il percorso tutela uno spazio di riservatezza per il ragazzo. Questa riservatezza ha un limite chiaro: non impedisce al coach o a KaiPai di intervenire e di coinvolgere la famiglia o i servizi competenti quando emergono rischi per la salute, la sicurezza o l’incolumità del minore o di altre persone.',
    },
    {
      type: 'callout',
      title: 'Cosa non è',
      text: 'Il mental coaching allena abilità legate alla prestazione sportiva. Se emerge un bisogno di natura clinica, il coach lo dice chiaramente e indirizza verso un professionista sanitario.',
    },
    { type: 'h2', id: 'revoca', text: 'Puoi revocare in qualsiasi momento' },
    {
      type: 'p',
      text: 'Dal collegamento personale che hai ricevuto via email, o scrivendo a KaiPai. La revoca blocca nuove sedute, annulla quelle non ancora concluse, rende di sola lettura le chat collegate e interrompe registrazioni ed elaborazioni AI ancora in corso. Per una nuova autorizzazione il ragazzo dovrà inviare un nuovo invito.',
    },
    { type: 'h2', id: 'dati', text: 'Che dati teniamo' },
    {
      type: 'p',
      text: 'Conserviamo la prova dell’autorizzazione, le dichiarazioni rese e i dati tecnici necessari a dimostrare la conclusione e l’eventuale revoca del rapporto. Per i dettagli, leggi la [Privacy Policy](/privacy) e i [Termini](/terms).',
    },
    { type: 'h2', id: 'iniziare', text: 'Come iniziare' },
    {
      type: 'p',
      text: 'Se hai dubbi su cosa cercare in un coach per un ragazzo, leggi [come sceglierlo](/blog/mental-coach-per-ragazzi-come-sceglierlo). Per tutte le regole per le famiglie c’è la pagina [KaiPai per le famiglie](/famiglie).',
    },
  ],
  faq: [
    {
      q: 'Mio figlio ha 14 anni: può iniziare?',
      a: 'Non ancora: sotto i 15 anni non ci si può registrare su KaiPai.',
    },
    {
      q: 'Le sedute di un minorenne vengono registrate?',
      a: 'Il video no, mai. L’audio solo se il genitore autorizza gli Appunti AI e, prima di ogni registrazione, acconsentono sia il coach sia il ragazzo. Si può non autorizzarli e svolgere le sedute normalmente.',
    },
    {
      q: 'Posso ritirare l’autorizzazione?',
      a: 'Sì, in qualsiasi momento: le nuove sedute si bloccano, quelle non concluse vengono annullate e le registrazioni in corso si interrompono.',
    },
    {
      q: 'Quello che dice mio figlio resta privato?',
      a: 'C’è uno spazio di riservatezza, ma non copre i rischi per la salute o la sicurezza: in quel caso il coach o KaiPai possono coinvolgere la famiglia o i servizi competenti.',
    },
  ],
};
