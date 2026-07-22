/**
 * Sub-processors: the third-party services that handle personal data on the
 * platform's behalf, as disclosed in the privacy policy.
 *
 * Kept as data rather than prose because this is the one part of the legal
 * text that goes stale every time the stack changes — a hand-written list in
 * JSX drifts silently. When you add or drop an integration, update this array
 * and bump `LEGAL_LAST_UPDATED`.
 *
 * Only services that are actually wired up belong here. Notably absent:
 *   - Stripe — the dependency and key exist, but billing is off
 *     (`BILLING_ENABLED` unset), so no payment data is processed today.
 *   - OpenAI — listed in the project's stack docs but not integrated.
 *   - Analytics/advertising — none, which is why no cookie banner is needed.
 */
export type SubProcessor = {
  name: string;
  /** What it does for us, in plain Italian. */
  purpose: string;
  /** Which categories of personal data reach it. */
  data: string;
  /** Where the processing happens — relevant for transfers outside the EU. */
  location: string;
};

export const SUB_PROCESSORS: SubProcessor[] = [
  {
    name: 'Supabase (su AWS)',
    purpose: 'Database, autenticazione, archiviazione file e aggiornamenti in tempo reale',
    data: 'Dati di account e profilo, prenotazioni, messaggi, immagini e video caricati',
    location: 'Unione Europea (AWS, Francoforte)',
  },
  {
    name: 'Vercel',
    purpose: 'Hosting dell’applicazione e log tecnici di servizio',
    data: 'Dati di connessione (indirizzo IP, user agent) necessari a servire le pagine',
    location: 'Unione Europea, con società con sede negli Stati Uniti',
  },
  {
    name: 'LiveKit Cloud',
    purpose: 'Infrastruttura per le videochiamate delle sessioni',
    data: 'Audio e video in transito durante la sessione, non registrati né conservati',
    location: 'Stati Uniti (clausole contrattuali standard)',
  },
  {
    name: 'Resend',
    purpose: 'Invio delle email di servizio (conferme, promemoria, avvisi)',
    data: 'Indirizzo email, nome e contenuto della notifica',
    location: 'Stati Uniti (clausole contrattuali standard)',
  },
  {
    name: 'Servizi push del browser (Google, Apple, Mozilla)',
    purpose:
      'Recapito delle notifiche push al dispositivo, se le hai attivate',
    data: 'Identificativo anonimo del dispositivo e contenuto cifrato della notifica',
    location: 'Stati Uniti e Unione Europea, secondo il browser in uso',
  },
];

/**
 * Shared "last updated" date for the three legal pages. One constant so they
 * can never disagree — a privacy policy and a cookie policy carrying
 * different dates for the same revision looks like an oversight, because it
 * usually is one.
 */
export const LEGAL_LAST_UPDATED = '22 luglio 2026';
