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
      '{{actor.fullName}} ti ha inviato una richiesta per {{session.label}}.',
    ],
    outro:
      'Rispondi in fretta: le richieste che restano senza risposta scadono automaticamente.',
    actionLabel: 'Apri la richiesta',
  }),

  booking_created_by_coach: template('booking_created_by_coach', {
    eyebrow: 'Appuntamento fissato',
    subject: 'Il tuo coach ha fissato una sessione',
    title: 'Il tuo coach ha fissato una sessione con te',
    body: [
      '{{coach.fullName}} ha messo in calendario {{session.label}} con te.',
    ],
    outro:
      'Riceverai un promemoria il giorno prima e un’ora prima della sessione.',
    actionLabel: 'Vedi l’appuntamento',
  }),

  booking_accepted: template('booking_accepted', {
    eyebrow: 'Richiesta confermata',
    subject: 'La tua sessione è confermata',
    title: 'La tua sessione è confermata',
    body: ['{{coach.fullName}} ha accettato la tua richiesta.'],
    outro:
      'Riceverai un promemoria il giorno prima e un’ora prima della sessione.',
    actionLabel: 'Vedi la sessione',
  }),

  booking_declined: template('booking_declined', {
    eyebrow: 'Richiesta non accolta',
    subject: 'Aggiornamento sulla tua richiesta di sessione',
    title: 'La tua richiesta non è andata a buon fine',
    body: [
      'Questa volta non è stato possibile confermare la sessione con {{coach.fullName}}.',
    ],
    outro:
      'Puoi inviare una nuova richiesta quando vuoi, scegliendo un altro orario o un altro coach.',
    actionLabel: 'Invia una nuova richiesta',
  }),

  booking_cancelled: template('booking_cancelled', {
    eyebrow: 'Sessione annullata',
    subject: 'Una sessione è stata annullata',
    title: 'Una sessione è stata annullata',
    body: ['{{actor.fullName}} ha annullato la sessione in programma.'],
    outro: 'Puoi riprogrammarla in qualsiasi momento dalla tua area personale.',
    actionLabel: 'Riprogramma la sessione',
  }),

  booking_rescheduled: template('booking_rescheduled', {
    eyebrow: 'Orario modificato',
    subject: 'L’orario della tua sessione è cambiato',
    title: 'L’orario della tua sessione è cambiato',
    body: ['{{actor.fullName}} ha spostato la sessione a un nuovo orario.'],
    outro:
      'Aggiorna il tuo calendario: il vecchio orario non è più valido.',
    actionLabel: 'Vedi il nuovo orario',
  }),

  booking_completed: template('booking_completed', {
    eyebrow: 'Sessione completata',
    subject: 'La tua sessione è completata',
    title: 'La tua sessione è completata',
    body: [
      'Grazie per il tempo che dedichi al tuo allenamento mentale.',
      'Raccontare com’è andata aiuta {{coach.fullName}} a migliorare e orienta gli altri atleti nella scelta.',
    ],
    outro: null,
    actionLabel: 'Lascia una recensione',
  }),

  booking_reminder_24h: template('booking_reminder_24h', {
    eyebrow: 'Promemoria',
    subject: 'La tua sessione è domani',
    title: 'La tua sessione è domani',
    body: ['Domani hai una sessione con {{counterpart.fullName}}.'],
    outro:
      'Trova un posto tranquillo e prova microfono e webcam qualche minuto prima.',
    actionLabel: 'Vedi la sessione',
  }),

  booking_reminder_1h: template('booking_reminder_1h', {
    eyebrow: 'Si comincia',
    subject: 'La tua sessione inizia tra un’ora',
    title: 'La tua sessione inizia tra un’ora',
    body: [
      'Tra circa un’ora hai la sessione con {{counterpart.fullName}}.',
    ],
    outro:
      'Puoi entrare nella stanza video direttamente da KaiPai, qualche minuto prima dell’orario.',
    actionLabel: 'Entra nella sessione',
  }),

  new_message: template('new_message', {
    eyebrow: 'Nuovo messaggio',
    subject: 'Hai un nuovo messaggio da {{sender.fullName}}',
    title: 'Hai un nuovo messaggio',
    body: ['{{sender.fullName}} ti ha scritto su KaiPai.'],
    outro:
      'Per riservatezza il contenuto del messaggio non viene riportato in questa email.',
    actionLabel: 'Apri la chat',
  }),

  ai_report_ready: template('ai_report_ready', {
    eyebrow: 'Report disponibile',
    subject: 'Il report della tua sessione è pronto',
    title: 'Il report della tua sessione è pronto',
    body: [
      '{{coach.fullName}} ha condiviso con te il report di una sessione.',
    ],
    outro:
      'Il contenuto del report è riservato e si consulta solo dalla tua area personale, protetta da accesso.',
    actionLabel: 'Leggi il report',
  }),

  coach_invitation: template('coach_invitation', {
    eyebrow: 'Invito',
    subject: '{{inviter.name}} ti ha invitato su KaiPai',
    title: 'Ti hanno invitato su KaiPai',
    body: [
      '{{inviter.name}} ti ha invitato a entrare su KaiPai, la piattaforma di coaching mentale per atleti e squadre.',
      'Il link qui sotto è personale: usalo per creare il tuo account.',
    ],
    outro: null,
    actionLabel: 'Accetta l’invito',
  }),

  provider_review_requested: template('provider_review_requested', {
    eyebrow: 'Da approvare',
    subject: 'Un profilo coach è in attesa di approvazione',
    title: 'Un profilo coach attende la revisione',
    body: ['Un coach ha inviato il proprio profilo per la revisione.'],
    outro: null,
    actionLabel: 'Apri l’area admin',
  }),

  provider_approved: template('provider_approved', {
    eyebrow: 'Profilo approvato',
    subject: 'Il tuo profilo coach è stato approvato',
    title: 'Benvenuto tra i coach KaiPai',
    body: [
      'Il tuo profilo è stato approvato ed è ora visibile agli atleti.',
      'Da oggi puoi ricevere richieste di sessione, gestire calendario e servizi e far crescere la tua presenza sulla piattaforma.',
    ],
    outro: null,
    actionLabel: 'Vai alla tua area coach',
  }),

  provider_rejected: template('provider_rejected', {
    eyebrow: 'Profilo da rivedere',
    subject: 'Il tuo profilo coach richiede alcune modifiche',
    title: 'Il tuo profilo richiede alcune modifiche',
    body: [
      'Il tuo profilo non è stato approvato in questa forma.',
      'Aggiornalo con le informazioni mancanti e invialo di nuovo: lo rivedremo il prima possibile.',
    ],
    outro: null,
    actionLabel: 'Aggiorna il profilo',
  }),

  review_received: template('review_received', {
    eyebrow: 'Nuova recensione',
    subject: 'Hai ricevuto una nuova recensione',
    title: 'Hai ricevuto una nuova recensione',
    body: ['{{athlete.fullName}} ha lasciato una recensione al tuo profilo.'],
    outro:
      'Le recensioni verificate aumentano la fiducia e la visibilità del tuo profilo.',
    actionLabel: 'Leggi la recensione',
  }),

  security_alert: template('security_alert', {
    eyebrow: 'Sicurezza',
    subject: 'Avviso di sicurezza sul tuo account KaiPai',
    title: 'Attività importante sul tuo account',
    body: [
      'Abbiamo rilevato questa attività sul tuo account: {{security.event}}.',
    ],
    outro:
      'Se sei stato tu, non devi fare nulla. Se non riconosci questa attività, cambia subito la password e scrivici a info@kaipaicoaching.com.',
    actionLabel: 'Controlla il tuo account',
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
