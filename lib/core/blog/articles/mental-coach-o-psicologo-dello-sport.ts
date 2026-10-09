import type { BlogArticle } from '../index';

/**
 * Bozza per l'indicizzazione, da far validare a Francesco Borrelli prima di
 * togliere `reviewed: false`.
 *
 * Il limite fra coaching e clinica è lo stesso della home, delle FAQ e della
 * pagina `/atleti`: se cambia in uno di quei posti, cambia anche qui. Nessuna
 * statistica; le uniche affermazioni di legge sono quelle sull'Albo degli
 * psicologi (legge 56/1989) e sulla psicoterapia come formazione ulteriore.
 */
export const MENTAL_COACH_O_PSICOLOGO: BlogArticle = {
  slug: 'mental-coach-o-psicologo-dello-sport',
  title: 'Mental coach o psicologo dello sport: le differenze',
  seoTitle: 'Mental coach o psicologo dello sport: le differenze',
  description:
    'Mental coach o psicologo dello sport? Cosa fa ciascuno, cosa può e non può fare, quando sceglierne uno e come le due figure possono lavorare insieme.',
  publishedAt: '2026-09-22',
  author: {
    name: 'Francesco Borrelli',
    role: 'Fondatore di KaiPai · Mental coach sportivo',
    href: '/chi-siamo',
  },
  image: {
    src: '/blog/mental-coach-o-psicologo-dello-sport.webp',
    alt: 'Un atleta seduto di spalle in palestra, in un momento di calma',
    og: '/og/blog-mental-coach-o-psicologo-dello-sport.jpg',
  },
  related: { href: '/atleti', label: 'Mental coaching per atleti' },
  tags: ['Mental coach', 'Psicologo dello sport', 'Scegliere un professionista'],
  reviewed: false,
  blocks: [
    {
      type: 'p',
      text: 'Se cerchi un aiuto per la testa nello sport, prima o poi incontri due nomi: mental coach e psicologo dello sport. Sembrano la stessa cosa e non lo sono. Capire la differenza serve a non perdere tempo con la figura sbagliata, e a non aspettarti da una cosa quello che può darti l’altra.',
    },
    { type: 'h2', id: 'in-breve', text: 'In breve' },
    {
      type: 'list',
      items: [
        'Il mental coach allena le abilità mentali legate alla prestazione: concentrazione, gestione della pressione, motivazione, routine. Lavora con chi sta bene e vuole rendere di più.',
        'Lo psicologo dello sport è uno psicologo iscritto all’Albo, con una formazione specifica in ambito sportivo. Può valutare e, se è anche psicoterapeuta, curare disagi e disturbi.',
        'Se la difficoltà resta nel campo, di solito basta un mental coach. Se va oltre il campo, serve uno psicologo.',
      ],
    },
    { type: 'h2', id: 'mental-coach', text: 'Che cosa fa un mental coach sportivo' },
    {
      type: 'p',
      text: 'Un mental coach sportivo ti aiuta ad allenare la testa come alleni il corpo: capire cosa succede dentro di te prima e durante la gara, costruire una routine che ti porti in uno stato giusto, imparare a ripartire dopo un errore, darti obiettivi che dipendono da te. Il lavoro è concreto e orientato al presente: cosa puoi fare adesso per giocare meglio la prossima gara.',
    },
    {
      type: 'p',
      text: 'Non fa diagnosi e non cura. Non esiste un albo dei mental coach: per questo conta molto chi scegli, come è stato formato e come lavora.',
    },
    { type: 'h2', id: 'psicologo', text: 'Che cosa fa uno psicologo dello sport' },
    {
      type: 'p',
      text: 'Lo psicologo è una professione regolamentata: si diventa psicologi con la laurea, l’esame di Stato e l’iscrizione all’Albo (legge 56/1989). Lo psicologo dello sport ha in più una formazione specifica sul contesto sportivo.',
    },
    {
      type: 'p',
      text: 'Può valutare una situazione e accompagnare chi vive un disagio. La cura psicoterapeutica, cioè il trattamento di disturbi, richiede una formazione ulteriore: è una cosa in più rispetto alla laurea in psicologia, e chi la fa si presenta come psicoterapeuta.',
    },
    { type: 'h2', id: 'differenze', text: 'Le differenze, una per una' },
    {
      type: 'list',
      items: [
        'Obiettivo: il mental coach lavora sulla prestazione; lo psicologo può lavorare anche sul benessere e sul disagio.',
        'Con chi lavora: il coach con chi sta bene e vuole migliorare; lo psicologo anche con chi sta male.',
        'Tempo: il coach guarda al presente e agli obiettivi sportivi; lo psicologo può anche ripercorrere la storia della persona.',
        'Titolo: lo psicologo è iscritto a un Albo; il mental coach no, e il titolo non è protetto.',
        'Diagnosi e cura: solo professionisti sanitari abilitati; il coach no.',
      ],
    },
    { type: 'h2', id: 'quale-scegliere', text: 'Quale scegliere' },
    {
      type: 'p',
      text: 'Un mental coach è la scelta giusta se sei un atleta che sta bene e vuole allenare qualcosa di preciso: l’ansia prima della gara, la concentrazione, la fiducia, il modo di reagire agli errori, la costanza negli allenamenti.',
    },
    {
      type: 'p',
      text: 'Uno psicologo è la scelta giusta quando la difficoltà non resta nello sport: se l’ansia o il malumore pesano anche a scuola, a casa, sul sonno o sull’alimentazione, se porta a evitare qualunque situazione di giudizio, o se è passato molto tempo e il disagio non si allenta. In quel caso non è questione di prestazione.',
    },
    {
      type: 'callout',
      title: 'Il mental coaching non è una terapia',
      text: 'Un buon mental coach non si sostituisce a un professionista sanitario. Se durante il percorso emerge un bisogno clinico, te lo dice chiaramente e ti indirizza verso la figura giusta. Su KaiPai è così per tutti i coach.',
    },
    { type: 'h2', id: 'insieme', text: 'Possono lavorare insieme' },
    {
      type: 'p',
      text: 'Le due figure non si escludono. Un atleta può seguire un percorso con uno psicologo per ciò che riguarda il benessere e, in parallelo, lavorare con un mental coach sulla prestazione. L’importante è che ognuno resti nel proprio ambito e che tu sappia chi fa cosa.',
    },
    { type: 'h2', id: 'kaipai', text: 'Come lavora KaiPai' },
    {
      type: 'p',
      text: 'Su KaiPai lavorano mental coach sportivi, approvati dal team prima di comparire nell’elenco. Le sedute si fanno in videochiamata e [la prima sessione conoscitiva, di 20 minuti, è gratuita](/atleti): è il modo più semplice per capire se è la strada giusta per te. Se è un genitore a cercare, può leggere cosa cambia [per un ragazzo minorenne](/blog/mental-coaching-minori-consenso-genitori).',
    },
  ],
  faq: [
    {
      q: 'Il mental coach è uno psicologo?',
      a: 'No. Sono figure diverse: lo psicologo è iscritto a un Albo professionale, il mental coach no. Alcuni mental coach sono anche psicologi, ma quando lavorano come coach il loro percorso è di allenamento mentale, non una terapia.',
    },
    {
      q: 'Un mental coach può curare l’ansia?',
      a: 'No: non fa diagnosi né terapia. Può aiutarti ad allenare la gestione della tensione legata alla prestazione. Se l’ansia pesa anche fuori dallo sport, è il caso di rivolgersi a uno psicologo o a un medico.',
    },
    {
      q: 'Chi è meglio per un ragazzo?',
      a: 'Dipende da cosa c’è alla base. Per migliorare concentrazione, fiducia e gestione della gara di solito basta un mental coach; se il disagio va oltre il campo, serve uno psicologo. In dubbio, parlane con un professionista sanitario.',
    },
    {
      q: 'Si possono seguire entrambi insieme?',
      a: 'Sì, se ognuno resta nel proprio ambito e si sa chi fa cosa. Spesso si completano.',
    },
  ],
};
