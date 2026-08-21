/**
 * Contenuto predefinito di ogni email del catalogo.
 *
 * Due ruoli:
 *   1. sorgente che lo script di seed scrive in `email_templates`;
 *   2. ripiego a runtime quando la tabella non ha una versione attiva — così
 *      una tabella vuota non cambia nulla e le email partono comunque.
 *
 * Qui c'è solo la prosa. Eyebrow, titolo, paragrafi e chiusura sono testo: il
 * layout decide come appaiono, e la card dei dettagli la costruisce il codice
 * a partire dai dati dell'appuntamento (vedi `booking-context.ts`).
 *
 * REGOLA. Ogni segnaposto usato qui deve essere nella whitelist dell'evento e
 * deve essere sempre valorizzabile a runtime: un valore mancante blocca
 * l'invio di proposito. Tutto ciò che è opzionale (orario proposto, sport,
 * nota) va nella card, che omette in silenzio le righe senza valore.
 */

import {
  NOTIFICATION_EVENTS,
  type NotificationEventKey,
} from '@/lib/core/notifications/catalog';
import { validateTemplateVariables } from './render';

export type DefaultEmailTemplate = {
  key: string;
  category: string;
  /** Sopratitolo breve e maiuscolo. */
  eyebrow: string;
  subject: string;
  title: string;
  /** Paragrafi del corpo, separati da una riga vuota. */
  htmlBody: string;
  /** Variante testo. Uguale al corpo: la prosa non contiene markup. */
  textBody: string;
  /** Chiusura dopo la CTA. */
  outro: string | null;
  actionLabel: string | null;
  isMandatory: boolean;
};

function template(
  key: NotificationEventKey,
  input: {
    eyebrow: string;
    subject: string;
    title: string;
    body: string[];
    outro?: string | null;
    actionLabel: string | null;
  }
): DefaultEmailTemplate {
  const event = NOTIFICATION_EVENTS[key];
  const body = input.body.join('\n\n');

  return {
    key: event.templateKey,
    category: event.category,
    eyebrow: input.eyebrow,
    subject: input.subject,
    title: input.title,
    htmlBody: body,
    textBody: body,
    outro: input.outro ?? null,
    actionLabel: input.actionLabel,
    isMandatory: event.mandatoryEmail,
  };
}

export const DEFAULT_EMAIL_TEMPLATES: Record<
  NotificationEventKey,
  DefaultEmailTemplate
> = {
  booking_requested: template('booking_requested', {
    eyebrow: 'Nuova richiesta',
    subject: 'Nuova richiesta di sessione da {{actor.fullName}}',
    title: 'Hai ricevuto una richiesta di sessione',
    body: [
      'Ciao {{recipient.firstName}},',
      '{{actor.fullName}} ti ha inviato una richiesta per {{session.label}}.',
      'Apri la richiesta, controlla giorno e orario, poi scegli Accetta oppure Rifiuta.',
    ],
    outro:
      'Finché non scegli, l’appuntamento non è confermato.',
    actionLabel: 'Apri la richiesta',
  }),

  booking_created_by_coach: template('booking_created_by_coach', {
    eyebrow: 'Appuntamento fissato',
    subject: 'Il tuo coach ha fissato una sessione',
    title: 'Il tuo coach ha fissato una sessione con te',
    body: [
      'Ciao {{recipient.firstName}},',
      '{{coach.fullName}} ha messo in calendario {{session.label}} con te.',
      'La videochiamata si svolge dentro KaiPai: non devi installare Zoom, Meet o altre applicazioni.',
    ],
    outro:
      'Cinque minuti prima dell’orario, apri l’appuntamento e premi “Apri videochiamata”. Se richiesto, consenti l’uso di microfono e fotocamera.',
    actionLabel: 'Apri l’appuntamento',
  }),

  // La traccia scritta di una sessione avviata al volo, per chi in quel
  // momento non era davanti al telefono. Il testo non promette che la chiamata
  // sia ancora in corso: l'email può arrivare dopo, e dirlo evita che chi
  // apre il link dieci minuti dopo pensi di aver sbagliato qualcosa.
  call_started: template('call_started', {
    eyebrow: 'Sessione avviata',
    subject: 'Il tuo coach ti sta chiamando',
    title: '{{coach.fullName}} ha avviato la videochiamata',
    body: [
      'Ciao {{recipient.firstName}},',
      'La videochiamata è iniziata. Premi il pulsante verde qui sotto per entrare adesso.',
    ],
    outro:
      'Se KaiPai lo chiede, consenti l’uso di microfono e fotocamera. Se la chiamata è già finita, scrivi al coach nella chat.',
    actionLabel: 'Entra nella chiamata',
  }),

  booking_accepted: template('booking_accepted', {
    eyebrow: 'Richiesta confermata',
    subject: 'La tua sessione è confermata',
    title: 'La tua sessione è confermata',
    body: [
      'Ciao {{recipient.firstName}},',
      '{{coach.fullName}} ha accettato la tua richiesta: la sessione indicata qui sotto è confermata.',
      'La videochiamata si svolge dentro KaiPai: non devi installare Zoom, Meet o altre applicazioni.',
    ],
    outro:
      'Cinque minuti prima dell’orario, apri l’appuntamento e premi “Apri videochiamata”. Se richiesto, consenti l’uso di microfono e fotocamera.',
    actionLabel: 'Apri l’appuntamento',
  }),

  booking_declined: template('booking_declined', {
    eyebrow: 'Richiesta non accolta',
    subject: 'Aggiornamento sulla tua richiesta di sessione',
    title: 'La sessione richiesta non è stata confermata',
    body: [
      'Ciao {{recipient.firstName}},',
      'La richiesta per una sessione con {{coach.fullName}} non è stata confermata. La sessione indicata qui sotto non avrà luogo.',
    ],
    outro:
      'Per fissarne un’altra, scegli un coach e invia una nuova richiesta con un giorno e un orario disponibili.',
    actionLabel: 'Scegli un nuovo appuntamento',
  }),

  booking_cancelled: template('booking_cancelled', {
    eyebrow: 'Sessione annullata',
    subject: 'La tua sessione è stata annullata',
    title: 'Questa sessione non avrà luogo',
    body: [
      'Ciao {{recipient.firstName}},',
      '{{actor.fullName}} ha annullato la sessione indicata qui sotto.',
      'Non devi collegarti alla videochiamata: la stanza non sarà disponibile.',
    ],
    outro: 'Se vuoi fissare un’altra sessione, vai ai tuoi appuntamenti.',
    actionLabel: 'Vai ai tuoi appuntamenti',
  }),

  booking_rescheduled: template('booking_rescheduled', {
    eyebrow: 'Orario modificato',
    subject: 'L’orario della tua sessione è cambiato',
    title: 'L’orario della tua sessione è cambiato',
    body: [
      'Ciao {{recipient.firstName}},',
      '{{actor.fullName}} ha cambiato giorno o orario della sessione.',
      'L’orario corretto è quello indicato nel riquadro qui sotto. Il vecchio orario non è più valido.',
    ],
    outro:
      'Apri l’appuntamento per controllare i dettagli aggiornati e, se serve, aggiorna il calendario.',
    actionLabel: 'Vedi il nuovo orario',
  }),

  booking_completed: template('booking_completed', {
    eyebrow: 'Sessione completata',
    subject: 'La tua sessione si è conclusa',
    title: 'La sessione si è conclusa',
    body: [
      'Ciao {{recipient.firstName}},',
      'La sessione indicata qui sotto è stata segnata come conclusa.',
      'Premi il pulsante per lasciare una recensione a {{coach.fullName}}. Bastano un voto e, se vuoi, un breve commento.',
    ],
    outro: null,
    actionLabel: 'Lascia una recensione',
  }),

  booking_reminder_24h: template('booking_reminder_24h', {
    eyebrow: 'Promemoria',
    subject: 'La tua sessione è domani',
    title: 'La tua sessione è domani',
    body: [
      'Ciao {{recipient.firstName}},',
      'Domani hai una sessione con {{counterpart.fullName}}. Giorno e orario esatti sono nel riquadro qui sotto.',
      'La videochiamata si svolge dentro KaiPai: non devi installare Zoom, Meet o altre applicazioni.',
    ],
    outro:
      'Prima della sessione trova un posto tranquillo. Cinque minuti prima, apri l’appuntamento e premi “Apri videochiamata”.',
    actionLabel: 'Apri l’appuntamento',
  }),

  booking_reminder_1h: template('booking_reminder_1h', {
    eyebrow: 'Si comincia',
    subject: 'La tua sessione inizia tra un’ora',
    title: 'La tua sessione inizia tra un’ora',
    body: [
      'Ciao {{recipient.firstName}},',
      'Tra circa un’ora hai la sessione con {{counterpart.fullName}}.',
      'La videochiamata si apre 5 minuti prima dell’orario indicato nel riquadro. Non devi installare altre applicazioni.',
    ],
    outro:
      'Premi il pulsante per aprire la stanza. Se è ancora presto, KaiPai ti mostrerà l’orario esatto in cui potrai entrare. Quando entri, consenti microfono e fotocamera.',
    actionLabel: 'Apri la stanza video',
  }),

  new_message: template('new_message', {
    eyebrow: 'Nuovo messaggio',
    subject: 'Hai un nuovo messaggio da {{sender.fullName}}',
    title: 'Hai un nuovo messaggio',
    body: ['Ciao {{recipient.firstName}},', '{{sender.fullName}} ti ha scritto su KaiPai.'],
    outro:
      'Per riservatezza il testo non compare nell’email. Premi il pulsante per leggere il messaggio e rispondere nella chat privata.',
    actionLabel: 'Apri la chat',
  }),

  ai_report_ready: template('ai_report_ready', {
    eyebrow: 'Report disponibile',
    subject: 'Il report della tua sessione è pronto',
    title: 'Il report della tua sessione è pronto',
    body: [
      'Ciao {{recipient.firstName}},',
      '{{coach.fullName}} ha condiviso con te il report della sessione indicata qui sotto.',
      'Premi il pulsante per leggerlo nella tua area privata KaiPai. Il pulsante apre il report, non la chat.',
    ],
    outro:
      'Il contenuto è riservato e non viene riportato in questa email.',
    actionLabel: 'Leggi il report',
  }),

  ai_report_awaiting_review: template('ai_report_awaiting_review', {
    eyebrow: 'Da validare',
    subject: 'Un riepilogo di sessione aspetta la tua approvazione',
    title: 'Un riepilogo è pronto da validare',
    body: [
      'Ciao {{recipient.firstName}},',
      'Il riepilogo di {{session.label}} con {{athlete.fullName}} è stato generato e aspetta la tua approvazione.',
      'Aprilo, controlla che sia corretto e poi scegli Approva oppure Rigenera. Finché non lo approvi, resta una bozza e l’atleta non lo vede.',
    ],
    outro:
      'Il contenuto non viene riportato nell’email: si consulta soltanto nella tua area coach.',
    actionLabel: 'Apri il riepilogo',
  }),

  coach_invitation: template('coach_invitation', {
    eyebrow: 'Invito',
    subject: '{{inviter.name}} ti ha invitato su KaiPai',
    title: 'Ti hanno invitato su KaiPai',
    body: [
      'Ciao {{recipient.firstName}},',
      '{{inviter.name}} ti ha invitato a entrare su KaiPai, la piattaforma di coaching mentale per atleti e squadre.',
      'Premi “Accetta l’invito”, crea il tuo account e segui i passaggi mostrati sullo schermo. Il link è personale: non inoltrarlo ad altre persone.',
    ],
    outro: null,
    actionLabel: 'Accetta l’invito',
  }),

  athlete_registered: template('athlete_registered', {
    eyebrow: 'Nuovo atleta',
    subject: '{{athlete.fullName}} si è registrato su KaiPai',
    title: 'Un nuovo atleta si è registrato',
    body: [
      'Ciao {{recipient.firstName}},',
      '{{athlete.fullName}} ha creato un account atleta su KaiPai.',
      'Premi il pulsante per aprire la scheda nell’area amministratore.',
    ],
    outro: null,
    actionLabel: 'Apri l’area admin',
  }),

  provider_registered: template('provider_registered', {
    eyebrow: 'Nuovo coach',
    subject: '{{coach.fullName}} si è registrato come coach',
    title: 'Un nuovo coach si è registrato',
    body: [
      'Ciao {{recipient.firstName}},',
      '{{coach.fullName}} ha creato un account coach su KaiPai.',
      'Il profilo è ancora in bozza: non devi approvarlo adesso. Riceverai un secondo avviso quando il coach lo invierà per la revisione.',
    ],
    outro: null,
    actionLabel: 'Apri l’area admin',
  }),

  provider_review_requested: template('provider_review_requested', {
    eyebrow: 'Da approvare',
    subject: '{{coach.fullName}} ha inviato il profilo per l’approvazione',
    title: 'Un profilo coach attende la revisione',
    body: [
      'Ciao {{recipient.firstName}},',
      '{{coach.fullName}} ha inviato il proprio profilo per la revisione.',
      'Apri la scheda, controlla le informazioni e scegli Approva oppure Rifiuta.',
    ],
    outro: null,
    actionLabel: 'Apri l’area admin',
  }),

  provider_approved: template('provider_approved', {
    eyebrow: 'Profilo approvato',
    subject: 'Il tuo profilo coach è stato approvato',
    title: 'Benvenuto tra i coach KaiPai',
    body: [
      'Ciao {{recipient.firstName}},',
      'Il tuo profilo è stato approvato ed è ora visibile agli atleti.',
      'Non devi fare altro per pubblicarlo. Da ora puoi ricevere richieste di sessione e gestire calendario e servizi dalla tua area coach.',
    ],
    outro: null,
    actionLabel: 'Vai alla tua area coach',
  }),

  provider_rejected: template('provider_rejected', {
    eyebrow: 'Profilo da rivedere',
    subject: 'Il tuo profilo coach non è ancora pubblicato',
    title: 'Il tuo profilo richiede alcune modifiche',
    body: [
      'Ciao {{recipient.firstName}},',
      'Il tuo profilo non è stato pubblicato.',
      'Apri il profilo, controlla e completa tutti i campi richiesti, poi invialo di nuovo per la revisione. Se non sai cosa correggere, scrivi a info@kaipaicoaching.com.',
    ],
    outro: null,
    actionLabel: 'Aggiorna il profilo',
  }),

  review_received: template('review_received', {
    eyebrow: 'Nuova recensione',
    subject: 'Hai ricevuto una nuova recensione',
    title: 'Hai ricevuto una nuova recensione',
    body: [
      'Ciao {{recipient.firstName}},',
      '{{athlete.fullName}} ha lasciato una recensione verificata sul tuo profilo.',
      'Premi il pulsante per leggere il voto e il commento, se presente.',
    ],
    outro:
      'Le recensioni verificate aumentano la fiducia e la visibilità del tuo profilo.',
    actionLabel: 'Leggi la recensione',
  }),

  security_alert: template('security_alert', {
    eyebrow: 'Sicurezza',
    subject: 'Avviso di sicurezza sul tuo account KaiPai',
    title: 'Controlla questa attività sul tuo account',
    body: [
      'Ciao {{recipient.firstName}},',
      'Abbiamo rilevato questa attività sul tuo account: {{security.event}}.',
      'Data e ora: {{security.occurredAt}}.',
    ],
    outro:
      'Se sei stato tu, non devi fare nulla. Se non sei stato tu, premi il pulsante, cambia subito la password e scrivi a info@kaipaicoaching.com.',
    actionLabel: 'Cambia la password',
  }),
};

/**
 * Autocontrollo: ogni template predefinito deve usare solo segnaposto che il
 * catalogo consente. Eseguito dallo script di seed e dai test, così un refuso
 * viene intercettato prima di poter bloccare un invio in produzione.
 */
export function validateDefaultTemplates(): {
  key: string;
  unknown: string[];
}[] {
  const problems: { key: string; unknown: string[] }[] = [];

  for (const [eventKey, tpl] of Object.entries(DEFAULT_EMAIL_TEMPLATES)) {
    const allowed = NOTIFICATION_EVENTS[eventKey as NotificationEventKey].variables;
    const unknown = new Set<string>();
    for (const source of [
      tpl.subject,
      tpl.eyebrow,
      tpl.title,
      tpl.htmlBody,
      tpl.textBody,
      tpl.outro ?? '',
    ]) {
      for (const v of validateTemplateVariables(source, allowed).unknown) {
        unknown.add(v);
      }
    }
    if (unknown.size > 0) {
      problems.push({ key: tpl.key, unknown: [...unknown] });
    }
  }

  return problems;
}
