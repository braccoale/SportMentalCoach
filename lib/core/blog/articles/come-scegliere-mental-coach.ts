import type { BlogArticle } from '../index';

/**
 * Indicizzato il 2026-10-10 su decisione del titolare del sito (`reviewed: true`).
 * Ogni affermazione è presa dalle regole vere del prodotto: se cambiano nel
 * codice, questa pagina va riletta.
 *
 * È la guida generale per l'atleta adulto o il giovane che sceglie da sé; per
 * il genitore c'è già `mental-coach-per-ragazzi-come-sceglierlo`, a cui questa
 * rimanda. I criteri sono di buon senso e non promettono risultati; le cose
 * che dice su KaiPai sono quelle del prodotto (filtri dell'elenco, sessione
 * conoscitiva gratuita, approvazione dei coach da parte del team).
 */
export const COME_SCEGLIERE: BlogArticle = {
  slug: 'come-scegliere-un-mental-coach-sportivo',
  title: 'Come scegliere un mental coach sportivo',
  seoTitle: 'Come scegliere un mental coach sportivo',
  description:
    'Sette criteri concreti per scegliere un mental coach sportivo: formazione, sport, metodo, chiarezza sui limiti e come provare prima di decidere.',
  publishedAt: '2026-09-29',
  author: {
    name: 'Francesco Borrelli',
    role: 'Fondatore di KaiPai · Mental coach sportivo',
    href: '/chi-siamo',
  },
  image: {
    src: '/blog/come-scegliere-mental-coach.webp',
    alt: 'Un’atleta pensierosa parla con il suo coach durante una seduta',
    og: '/og/blog-come-scegliere-mental-coach.jpg',
  },
  related: { href: '/coaches', label: 'Scegli un coach' },
  tags: ['Scegliere un coach', 'Mental coach', 'Atleti'],
  reviewed: true,
  blocks: [
    {
      type: 'p',
      text: 'Non esiste un albo dei mental coach, e il titolo non è protetto: chiunque può definirsi tale. Scegliere bene dipende quindi da te. Questi sono i criteri che usiamo noi, in ordine di importanza, per capire se un coach fa al caso tuo.',
    },
    { type: 'h2', id: 'obiettivo', text: '1. Parti da cosa vuoi cambiare' },
    {
      type: 'p',
      text: 'Prima di guardare i coach, scrivi in due righe cosa vuoi allenare: l’ansia prima della gara, la concentrazione, la fiducia, il rientro dopo un infortunio, il rapporto con l’allenatore. Un coach bravo con tutti non esiste: esiste quello che ha già lavorato su quello che ti serve.',
    },
    { type: 'h2', id: 'sport', text: '2. Guarda se conosce il tuo sport' },
    {
      type: 'p',
      text: 'Un buon coach non deve aver giocato nel tuo sport, ma deve capirne i tempi: come si vive una gara di tennis rispetto a una di calcio, cosa significa un rigore o un tempo morto. Nell’[elenco dei coach](/coaches) puoi filtrare per sport, specialità, livello e lingua.',
    },
    { type: 'h2', id: 'formazione', text: '3. Chiedi come è stato formato' },
    {
      type: 'p',
      text: 'Non è un esame: è una domanda normale. Un coach serio ti dice volentieri da dove viene, con quali metodi lavora e quali sono i suoi limiti.',
    },
    { type: 'h2', id: 'metodo', text: '4. Capisci come lavora' },
    {
      type: 'list',
      items: [
        'Ti dà strumenti concreti da provare tra una seduta e l’altra, o solo chiacchiera?',
        'Fissa obiettivi insieme a te e ne verifica l’andamento?',
        'Ti spiega cosa sta facendo e perché?',
      ],
    },
    {
      type: 'p',
      text: 'Il mental coaching funziona quando c’è un filo: obiettivi, impegni e verifiche seduta dopo seduta, non incontri slegati.',
    },
    { type: 'h2', id: 'limiti', text: '5. Diffida di chi promette risultati' },
    {
      type: 'callout',
      title: 'Segnali d’allarme',
      text: 'Chi garantisce di farti vincere, chi dice di curare ansia o depressione, chi ti chiede di interrompere una terapia o un trattamento in corso: non è la persona giusta. Il mental coaching allena abilità legate alla prestazione e non sostituisce un percorso clinico.',
    },
    {
      type: 'p',
      text: 'Un coach serio sa quando fermarsi e indirizzare verso uno psicologo o un medico. Se ti stai chiedendo quale delle due figure ti serva, leggi la nostra guida su [mental coach e psicologo dello sport](/blog/mental-coach-o-psicologo-dello-sport).',
    },
    { type: 'h2', id: 'feeling', text: '6. Conta anche come ti senti' },
    {
      type: 'p',
      text: 'Con un coach parli di cose personali: deve esserci fiducia. Dopo la prima conversazione ti senti ascoltato o giudicato? Hai voglia di tornare? Non è un dettaglio: la relazione è una parte importante di ciò che funziona.',
    },
    { type: 'h2', id: 'prova', text: '7. Prova prima di decidere' },
    {
      type: 'p',
      text: 'Su KaiPai la prima sessione è conoscitiva, dura 20 minuti ed è gratuita: serve proprio a questo. Se non scatta, puoi scegliere un altro coach senza nessun impegno. Per una guida pensata per i genitori, c’è anche [come sceglierlo per un ragazzo](/blog/mental-coach-per-ragazzi-come-sceglierlo).',
    },
    { type: 'h2', id: 'kaipai', text: 'Cosa controlla KaiPai prima di te' },
    {
      type: 'p',
      text: 'I coach dell’elenco sono approvati dal team KaiPai: il profilo viene controllato prima della pubblicazione, e nessuna seduta è confermata senza il coach. Questo non sostituisce la tua scelta, ma toglie una parte del rischio.',
    },
  ],
  faq: [
    {
      q: 'Serve una certificazione per essere mental coach?',
      a: 'No: non esiste un albo né un titolo obbligatorio. Per questo è importante chiedere come il coach è stato formato e con quali metodi lavora.',
    },
    {
      q: 'Posso cambiare coach se non mi trovo bene?',
      a: 'Sì. Per questo la prima sessione conoscitiva è gratuita e senza impegno: serve a capire se la persona e il metodo fanno per te.',
    },
    {
      q: 'Quante sedute servono?',
      a: 'Dipende da cosa vuoi allenare. Il numero si concorda con il coach: un buon percorso ha obiettivi chiari e verifiche lungo la strada, non una durata fissa uguale per tutti.',
    },
  ],
};
