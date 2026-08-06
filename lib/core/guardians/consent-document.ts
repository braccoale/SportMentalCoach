import { createHash } from 'node:crypto';

/**
 * Canonical, versioned text accepted by a parent or legal guardian.
 *
 * The confirmation page renders this exact content and the same SHA-256 is
 * stored in the append-only acceptance. Changing one word requires a version
 * bump: old evidence must continue to point to the text actually accepted.
 */
export const GUARDIAN_CONSENT_VERSION = '2026-08-06.1';

export const GUARDIAN_CONSENT_SECTIONS = [
  {
    title: 'Natura del servizio',
    text:
      'Autorizzo il minore indicato a utilizzare KaiPai e a svolgere sessioni di mental coaching sportivo con coach approvati dalla piattaforma. Il mental coaching non è psicoterapia, non formula diagnosi e non sostituisce prestazioni sanitarie o psicologiche.',
  },
  {
    title: 'Contratto e responsabilità genitoriale',
    text:
      'Concludo il contratto con KaiPai per conto del minore. Dichiaro che i dati forniti sono veritieri, di essere maggiorenne e di esercitare la responsabilità genitoriale o la tutela legale. Indicherò se agisco con l’accordo dell’altro genitore, in via esclusiva oppure quale tutore legale.',
  },
  {
    title: 'Sessioni, riservatezza e sicurezza',
    text:
      'Autorizzo le videochiamate con il coach. Il video non viene registrato. Il percorso tutela uno spazio di riservatezza del minore; la riservatezza non impedisce al coach o a KaiPai di attivarsi e coinvolgere la famiglia o i servizi competenti quando emergano rischi per la salute, la sicurezza o l’incolumità del minore o di altre persone.',
  },
  {
    title: 'Dati personali',
    text:
      'Dichiaro di aver letto i Termini e Condizioni e la Privacy Policy. Sono informato che KaiPai conserva la prova dell’autorizzazione, le dichiarazioni rese e i dati tecnici necessari a dimostrare la conclusione e l’eventuale revoca del rapporto.',
  },
  {
    title: 'Appunti AI facoltativi',
    text:
      'Gli Appunti AI sono separati e facoltativi. Se li autorizzo, prima di ogni registrazione restano comunque necessari il consenso specifico del coach e dell’atleta. In quel caso viene registrato soltanto l’audio, che può essere trascritto e utilizzato per preparare una bozza di report revisionata dal coach; il video non viene mai registrato. Se non li autorizzo, il minore può svolgere normalmente le sessioni senza registrazione o trascrizione.',
  },
  {
    title: 'Revoca',
    text:
      'Posso revocare l’autorizzazione in qualsiasi momento dal collegamento personale ricevuto via email o contattando KaiPai. La revoca blocca nuove sessioni, annulla quelle non ancora concluse, rende le chat relative di sola lettura e interrompe registrazioni o elaborazioni AI ancora in corso, senza pregiudicare la liceità delle attività già svolte.',
  },
] as const;

export const GUARDIAN_CONSENT_TEXT = GUARDIAN_CONSENT_SECTIONS.map(
  (section) => `${section.title}\n${section.text}`
).join('\n\n');

export const GUARDIAN_CONSENT_HASH = createHash('sha256')
  .update(GUARDIAN_CONSENT_TEXT, 'utf8')
  .digest('hex');
