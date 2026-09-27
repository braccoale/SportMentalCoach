import type { FaqItem } from './audience-paths/audience-faq';

/**
 * Le domande frequenti della home: le domande generali, una per pubblico, con
 * il rimando alla pagina che le approfondisce.
 *
 * Le risposte ripetono quello che dicono le pagine percorso e non vanno
 * scritte diversamente qui: se cambia una regola (età, consenso, pagamento),
 * cambia in entrambi i posti. Le stesse voci diventano il FAQPage della home.
 */
export const HOME_FAQ: FaqItem[] = [
  {
    q: 'Che cos’è KaiPai?',
    a: 'La piattaforma italiana di mental coaching per lo sport: mette in contatto atleti, famiglie e società sportive con mental coach sportivi approvati dal team KaiPai, ospita le sedute in videochiamata e forma i coach con la KaiPai Academy.',
  },
  {
    q: 'Che cosa fa un mental coach sportivo?',
    a: 'Allena le abilità mentali legate alla prestazione: concentrazione, gestione della pressione, motivazione, routine pre-gara.',
    link: { href: '/atleti', label: 'Il mental coaching per atleti' },
  },
  {
    q: 'Mental coach o psicologo dello sport?',
    a: 'Sono figure diverse. Il mental coach allena la prestazione; lo psicologo dello sport è uno psicologo iscritto all’Albo, che può valutare e, se psicoterapeuta, curare. Su KaiPai lavorano mental coach: se emerge un bisogno clinico, il coach indirizza verso un professionista sanitario.',
  },
  {
    q: 'Come funziona una seduta?',
    a: 'Scegli un coach nell’elenco, chiedi un orario libero e aspetti la conferma. La seduta si svolge in videochiamata dentro KaiPai, dal browser o dall’app.',
    link: { href: '/coaches', label: 'Trova il tuo coach' },
  },
  {
    q: 'Quando pago?',
    a: 'La prenotazione è una richiesta: nulla è dovuto finché il coach non accetta e la seduta non è confermata.',
  },
  {
    q: 'Mio figlio è minorenne: può iniziare?',
    a: 'Dai 15 anni può registrarsi ed esplorare. Per richiedere sedute serve l’autorizzazione di un genitore, che riceve un’email con un link e conferma in un minuto.',
    link: { href: '/famiglie', label: 'Minori, consenso e riservatezza' },
  },
  {
    q: 'Le sedute vengono registrate?',
    a: 'Solo con il consenso dell’atleta. Se il coach usa gli Appunti AI, il consenso viene chiesto prima di iniziare e si può rifiutare; per un minorenne serve anche che il genitore abbia autorizzato proprio la registrazione, non solo le sedute. Il riepilogo lo rivede il coach prima di condividerlo.',
  },
  {
    q: 'Come si diventa coach KaiPai?',
    a: 'Con la candidatura: crei l’account da coach, completi il profilo e lo invii in revisione. Il team lo controlla prima di pubblicarlo, e l’Academy accompagna la formazione.',
    link: { href: '/diventa-coach', label: 'Diventa coach' },
  },
  {
    q: 'Lavorate con società sportive e settori giovanili?',
    a: 'Sì: percorsi per squadre e gruppi, supporto a tecnici e staff, workshop per le famiglie del vivaio, programmi su misura.',
    link: { href: '/societa', label: 'KaiPai per le società' },
  },
];
