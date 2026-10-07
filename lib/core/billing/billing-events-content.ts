/**
 * Il testo delle email sul ciclo di vita di un acquisto: abbonamento
 * cominciato, seduta singola acquistata, cancellazione programmata o
 * annullata, abbonamento terminato, promemoria prima del rinnovo.
 *
 * Come `payment-failed-content`, sono email **operative**, non disattivabili e
 * fuori dal catalogo delle notifiche: confermano un fatto di denaro che
 * l'utente deve poter ritrovare. Una email per l'atleta e una per il coach per
 * ogni evento (tranne il promemoria, che è solo dell'atleta).
 *
 * Cosa NON dicono, di proposito:
 *  - nessuna ricevuta né fattura: la ricevuta del pagamento la emette Stripe
 *    sul conto del coach, e la fattura è del coach. Qui si conferma l'evento;
 *  - niente dati della carta;
 *  - nessun contenuto di seduta.
 *
 * Modulo puro.
 */

export const BILLING_EVENTS = [
  'subscription_started',
  'single_purchased',
  'cancel_scheduled',
  'cancel_undone',
  'subscription_ended',
  'renewal_reminder',
] as const;
export type BillingEvent = (typeof BILLING_EVENTS)[number];

export type BillingRole = 'athlete' | 'coach';

/** Giorni prima del rinnovo in cui l'atleta riceve il promemoria. */
export const RENEWAL_REMINDER_DAYS = 3;

export type BillingEventContent = {
  subject: string;
  preview: string;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  rows: { label: string; value: string }[];
  actionLabel: string;
  actionPath: string;
};

export type BillingEventInput = {
  event: BillingEvent;
  role: BillingRole;
  /** Il destinatario. */
  recipientName: string | null | undefined;
  /** L'altra persona: il coach per l'atleta, l'atleta per il coach. */
  counterpartName: string;
  /** Per il link alla scheda dell'atleta (solo per il coach). */
  athleteUserId: number;
  /** Nome del piano, o null per la seduta singola. */
  planName: string | null;
  /** Già formattato: «300,00 €». */
  amountLabel: string;
  /** Già formattato: «6 novembre 2026», o null se non si sa. */
  dateLabel: string | null;
  /** Per la seduta singola: entro quando va prenotata. */
  validUntilLabel?: string | null;
  sessionsPerMonth?: number | null;
};

function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

const ATHLETE_PATH = '/dashboard/athlete/abbonamenti';

export function buildBillingEventContent(
  input: BillingEventInput
): BillingEventContent {
  const name = firstName(input.recipientName);
  const greeting = name ? `Ciao ${name},` : 'Ciao,';
  const isAthlete = input.role === 'athlete';
  const other = input.counterpartName;
  const actionLabel = isAthlete
    ? 'Vai ai tuoi abbonamenti'
    : 'Apri la scheda dell’atleta';
  const actionPath = isAthlete
    ? ATHLETE_PATH
    : `/dashboard/coach/athletes/${input.athleteUserId}`;

  const planRows = [
    ...(input.planName ? [{ label: 'Piano', value: input.planName }] : []),
    ...(input.sessionsPerMonth
      ? [{ label: 'Sedute al mese', value: String(input.sessionsPerMonth) }]
      : []),
    { label: 'Importo', value: input.amountLabel },
  ];
  const withDate = (label: string) =>
    input.dateLabel ? [{ label, value: input.dateLabel }] : [];

  switch (input.event) {
    case 'subscription_started':
      return isAthlete
        ? {
            subject: `Abbonamento attivo con ${other}`,
            preview: `Il pagamento è andato a buon fine: puoi prenotare le tue sedute.`,
            eyebrow: 'Abbonamento attivo',
            title: `Il tuo percorso con ${other} è cominciato`,
            paragraphs: [
              greeting,
              `Il pagamento è andato a buon fine e il tuo abbonamento con ${other} è attivo.`,
              'Puoi prenotare subito le sedute del mese dalla pagina dei tuoi abbonamenti. La ricevuta del pagamento te la manda direttamente il sistema di pagamento.',
            ],
            rows: [...planRows, ...withDate('Prossimo rinnovo')],
            actionLabel,
            actionPath,
          }
        : {
            subject: `Nuovo abbonamento: ${other}`,
            preview: `${other} ha attivato un abbonamento con te.`,
            eyebrow: 'Nuovo abbonamento',
            title: `${other} ha attivato un abbonamento`,
            paragraphs: [
              greeting,
              `${other} ha pagato e ha attivato un abbonamento con te: l’importo è stato incassato sul tuo conto di pagamento.`,
              'Ora può prenotare le sedute del suo piano.',
            ],
            rows: [...planRows, ...withDate('Prossimo rinnovo')],
            actionLabel,
            actionPath,
          };

    case 'single_purchased':
      return isAthlete
        ? {
            subject: `Seduta acquistata con ${other}`,
            preview: 'Il pagamento è andato a buon fine: puoi prenotare la seduta.',
            eyebrow: 'Seduta acquistata',
            title: `Hai acquistato una seduta con ${other}`,
            paragraphs: [
              greeting,
              `Il pagamento è andato a buon fine: la seduta con ${other} è tua.`,
              input.validUntilLabel
                ? `Puoi prenotarla fino al ${input.validUntilLabel}.`
                : 'Puoi prenotarla dalla pagina dei tuoi abbonamenti.',
              'La ricevuta del pagamento te la manda direttamente il sistema di pagamento.',
            ],
            rows: [
              { label: 'Importo', value: input.amountLabel },
              ...(input.validUntilLabel
                ? [{ label: 'Da prenotare entro il', value: input.validUntilLabel }]
                : []),
            ],
            actionLabel,
            actionPath,
          }
        : {
            subject: `Seduta acquistata: ${other}`,
            preview: `${other} ha acquistato una seduta singola.`,
            eyebrow: 'Seduta acquistata',
            title: `${other} ha acquistato una seduta`,
            paragraphs: [
              greeting,
              `${other} ha pagato una seduta singola con te: l’importo è stato incassato sul tuo conto di pagamento.`,
              'Ora può prenotarla.',
            ],
            rows: [{ label: 'Importo', value: input.amountLabel }],
            actionLabel,
            actionPath,
          };

    case 'cancel_scheduled':
      return isAthlete
        ? {
            subject: 'Il tuo abbonamento non si rinnoverà',
            preview: 'Hai annullato il rinnovo: le sedute restano fino a fine periodo.',
            eyebrow: 'Rinnovo annullato',
            title: 'Il tuo abbonamento non si rinnoverà',
            paragraphs: [
              greeting,
              input.dateLabel
                ? `Hai annullato il rinnovo del tuo abbonamento con ${other}. Resta attivo fino al ${input.dateLabel}, e fino ad allora puoi usare le sedute che ti restano.`
                : `Hai annullato il rinnovo del tuo abbonamento con ${other}. Resta attivo fino alla fine del periodo già pagato.`,
              'Se cambi idea, prima di quella data puoi riattivare il rinnovo dalla pagina dei tuoi abbonamenti.',
            ],
            rows: [...planRows, ...withDate('Attivo fino al')],
            actionLabel,
            actionPath,
          }
        : {
            subject: `${other} non rinnoverà l’abbonamento`,
            preview: `${other} ha annullato il rinnovo.`,
            eyebrow: 'Rinnovo annullato',
            title: `${other} non rinnoverà l’abbonamento`,
            paragraphs: [
              greeting,
              input.dateLabel
                ? `${other} ha annullato il rinnovo dell’abbonamento. Resta attivo fino al ${input.dateLabel}.`
                : `${other} ha annullato il rinnovo dell’abbonamento. Resta attivo fino alla fine del periodo già pagato.`,
              'Se lo ritieni utile, scrivigli: può ancora cambiare idea prima di quella data.',
            ],
            rows: [...planRows, ...withDate('Attivo fino al')],
            actionLabel,
            actionPath,
          };

    case 'cancel_undone':
      return isAthlete
        ? {
            subject: 'Il tuo abbonamento si rinnoverà',
            preview: 'Hai riattivato il rinnovo.',
            eyebrow: 'Rinnovo riattivato',
            title: 'Il tuo abbonamento continuerà',
            paragraphs: [
              greeting,
              `Hai riattivato il rinnovo del tuo abbonamento con ${other}: continuerà senza interruzioni.`,
            ],
            rows: [...planRows, ...withDate('Prossimo rinnovo')],
            actionLabel,
            actionPath,
          }
        : {
            subject: `${other} ha riattivato l’abbonamento`,
            preview: `${other} ha riattivato il rinnovo.`,
            eyebrow: 'Rinnovo riattivato',
            title: `${other} ha riattivato l’abbonamento`,
            paragraphs: [
              greeting,
              `${other} ha cambiato idea: l’abbonamento continuerà a rinnovarsi.`,
            ],
            rows: [...planRows, ...withDate('Prossimo rinnovo')],
            actionLabel,
            actionPath,
          };

    case 'subscription_ended':
      return isAthlete
        ? {
            subject: `Il tuo abbonamento con ${other} è terminato`,
            preview: 'L’abbonamento è terminato: non ci saranno altri addebiti.',
            eyebrow: 'Abbonamento terminato',
            title: `Il tuo abbonamento con ${other} è terminato`,
            paragraphs: [
              greeting,
              `L’abbonamento con ${other} è terminato e non ci saranno altri addebiti.`,
              'Le sedute già fissate restano valide. Per continuare puoi attivare un nuovo percorso quando vuoi.',
            ],
            rows: planRows,
            actionLabel,
            actionPath,
          }
        : {
            subject: `Abbonamento terminato: ${other}`,
            preview: `L’abbonamento di ${other} è terminato.`,
            eyebrow: 'Abbonamento terminato',
            title: `L’abbonamento di ${other} è terminato`,
            paragraphs: [
              greeting,
              `L’abbonamento di ${other} è terminato e non si rinnoverà.`,
              'Le sedute già in agenda restano.',
            ],
            rows: planRows,
            actionLabel,
            actionPath,
          };

    case 'renewal_reminder':
      // Solo per l'atleta: il coach non ha niente da fare.
      return {
        subject: input.dateLabel
          ? `Il tuo abbonamento si rinnova il ${input.dateLabel}`
          : 'Il tuo abbonamento sta per rinnovarsi',
        preview: `Prossimo addebito: ${input.amountLabel}.`,
        eyebrow: 'Rinnovo in arrivo',
        title: 'Il tuo abbonamento sta per rinnovarsi',
        paragraphs: [
          greeting,
          input.dateLabel
            ? `Il ${input.dateLabel} verranno addebitati ${input.amountLabel} per il rinnovo del tuo abbonamento con ${other}.`
            : `Tra pochi giorni verranno addebitati ${input.amountLabel} per il rinnovo del tuo abbonamento con ${other}.`,
          'Se non vuoi rinnovarlo, puoi annullare il rinnovo dalla pagina dei tuoi abbonamenti prima di quella data.',
        ],
        rows: [...planRows, ...withDate('Rinnovo del')],
        actionLabel: 'Gestisci l’abbonamento',
        actionPath: ATHLETE_PATH,
      };
  }
}

/**
 * La chiave che rende l'invio ripetibile senza doppioni. `scope` identifica la
 * cosa concreta che è successa e **mai una finestra di tempo**:
 *  - abbonamento cominciato / terminato: `sub{id}` (una volta nella vita);
 *  - seduta acquistata: `credit{id}`;
 *  - cancellazione programmata/annullata: l'id dell'evento Stripe, perché si
 *    può annullare e riattivare più volte e ogni passaggio è un fatto nuovo;
 *  - promemoria: `sub{id}-p{fine periodo}`, uno per ciclo.
 */
export function billingEventIdempotencyKey(params: {
  event: BillingEvent;
  role: BillingRole;
  recipientUserId: number;
  scope: string;
}): string {
  return `v1:billing_${params.event}:email:${params.recipientUserId}:${params.scope}-${params.role}`;
}

/** `templateKey` scritto nel registro delle consegne. */
export function billingEventTemplateKey(
  event: BillingEvent,
  role: BillingRole
): string {
  return `billing_${event}_${role}`;
}

/**
 * Che cosa è cambiato nel passaggio fra due letture dello stesso abbonamento.
 * Restituisce gli eventi da notificare, in ordine. Non si avvisa di un evento
 * che lo trovava già così (Stripe ripete e riordina).
 */
export function billingEventsForTransition(params: {
  previousStatus: string;
  nextStatus: string;
  previousCancelAtPeriodEnd: boolean;
  nextCancelAtPeriodEnd: boolean;
  /** Vero se prima non c'era una data di sottoscrizione: è il primo pagamento. */
  firstConfirmation: boolean;
}): BillingEvent[] {
  const events: BillingEvent[] = [];
  const live = (s: string) => s === 'active' || s === 'past_due';
  if (params.firstConfirmation && live(params.nextStatus)) {
    events.push('subscription_started');
  }
  if (params.nextStatus === 'canceled' && params.previousStatus !== 'canceled') {
    // Un abbonamento mai cominciato che si chiude non è «terminato».
    if (!params.firstConfirmation && params.previousStatus !== 'incomplete') {
      events.push('subscription_ended');
    }
    return events;
  }
  if (live(params.nextStatus)) {
    if (!params.previousCancelAtPeriodEnd && params.nextCancelAtPeriodEnd) {
      events.push('cancel_scheduled');
    } else if (params.previousCancelAtPeriodEnd && !params.nextCancelAtPeriodEnd) {
      events.push('cancel_undone');
    }
  }
  return events;
}

/**
 * L'abbonamento è da ricordare adesso? Dentro la finestra dei
 * `RENEWAL_REMINDER_DAYS` giorni, solo se è vivo e si rinnoverà davvero.
 */
export function isRenewalReminderDue(params: {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  now: Date;
}): boolean {
  if (params.status !== 'active' || params.cancelAtPeriodEnd) return false;
  if (!params.currentPeriodEnd) return false;
  const ms = params.currentPeriodEnd.getTime() - params.now.getTime();
  return ms > 0 && ms <= RENEWAL_REMINDER_DAYS * 24 * 60 * 60 * 1000;
}
