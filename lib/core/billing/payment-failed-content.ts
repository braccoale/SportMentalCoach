/**
 * Il testo delle due email quando il rinnovo di un abbonamento non va a buon
 * fine: una per l'atleta (che deve sistemare il pagamento) e una per il coach
 * (che deve sapere perché non può fissare nuove sedute e con chi parlare).
 *
 * Sono email **operative** e non si possono disattivare: non nascono dal
 * catalogo delle notifiche (nessun evento nuovo, nessuna migrazione, nessuna
 * riga da seminare), come il benvenuto e l'esito di Appunti AI.
 *
 * Cosa NON dicono, di proposito:
 *  - niente dati della carta né il motivo del rifiuto della banca: non li
 *    abbiamo e non vanno comunque in una email;
 *  - niente promesse sui tentativi di Stripe («riproverà tra 3 giorni»): i
 *    tentativi li decidono le impostazioni di fatturazione di ciascun coach, e
 *    non le controlliamo. Si dice che «può ritentare».
 *
 * Modulo puro.
 */

export type PaymentFailedRole = 'athlete' | 'coach';

export type PaymentFailedContent = {
  subject: string;
  preview: string;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  rows: { label: string; value: string }[];
  actionLabel: string;
  actionPath: string;
};

function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export function buildPaymentFailedContent(input: {
  role: PaymentFailedRole;
  /** Il destinatario. */
  recipientName: string | null | undefined;
  /** L'altra persona: il coach per l'atleta, l'atleta per il coach. */
  counterpartName: string;
  /** Per il link alla scheda dell'atleta (solo per il coach). */
  athleteUserId: number;
  planName: string;
  /** Già formattato: «300,00 €». */
  amountLabel: string;
  /** Già formattato: «6 novembre 2026», o null se non si sa. */
  periodEndLabel: string | null;
}): PaymentFailedContent {
  const rows = [
    { label: 'Piano', value: input.planName },
    { label: 'Importo', value: input.amountLabel },
    ...(input.periodEndLabel
      ? [{ label: 'Rinnovo del', value: input.periodEndLabel }]
      : []),
  ];
  const name = firstName(input.recipientName);
  const greeting = name ? `Ciao ${name},` : 'Ciao,';

  if (input.role === 'athlete') {
    return {
      subject: 'Il pagamento del tuo abbonamento non è andato a buon fine',
      preview: `Non siamo riusciti a incassare il rinnovo con ${input.counterpartName}.`,
      eyebrow: 'Pagamento non riuscito',
      title: 'Il rinnovo del tuo abbonamento non è andato a buon fine',
      paragraphs: [
        greeting,
        `Non siamo riusciti a incassare il rinnovo del tuo abbonamento con ${input.counterpartName}.`,
        'Il sistema di pagamento può ritentare l’addebito nei prossimi giorni. Controlla intanto che la carta sia valida e abbia fondi sufficienti.',
        'Finché il pagamento non va a buon fine non puoi prenotare nuove sedute del piano; quelle già fissate restano valide.',
        'Se il problema persiste, scrivi al tuo coach o al supporto di KaiPai.',
      ],
      rows,
      actionLabel: 'Vai ai tuoi abbonamenti',
      actionPath: '/dashboard/athlete/abbonamenti',
    };
  }

  return {
    subject: `Pagamento in ritardo: ${input.counterpartName}`,
    preview: `Il rinnovo dell’abbonamento di ${input.counterpartName} non è andato a buon fine.`,
    eyebrow: 'Pagamento in ritardo',
    title: `Il rinnovo di ${input.counterpartName} non è andato a buon fine`,
    paragraphs: [
      greeting,
      `Il rinnovo dell’abbonamento di ${input.counterpartName} non è stato incassato.`,
      'Finché il pagamento non va a buon fine non puoi fissare nuove sedute del piano con lui; quelle già in agenda restano. Il sistema di pagamento può ritentare l’addebito.',
      'Se lo ritieni utile, scrivigli: spesso basta una carta scaduta.',
    ],
    rows,
    actionLabel: 'Apri la scheda dell’atleta',
    actionPath: `/dashboard/coach/athletes/${input.athleteUserId}`,
  };
}

/**
 * Si avvisa solo nel momento in cui un abbonamento **diventa** in ritardo, non a
 * ogni evento che lo trova già così: Stripe manda più aggiornamenti per lo
 * stesso pagamento fallito (e ripete gli eventi), e ogni tentativo non deve
 * essere una nuova email.
 */
export function shouldNotifyPaymentFailed(
  previous: string,
  next: string
): boolean {
  return next === 'past_due' && previous !== 'past_due';
}

/**
 * La chiave che rende l'invio ripetibile senza doppioni: una volta per
 * destinatario, per abbonamento e per periodo di rinnovo (mai una finestra di
 * tempo, che inghiottirebbe un secondo pagamento fallito dei mesi dopo).
 */
export function paymentFailedIdempotencyKey(params: {
  role: PaymentFailedRole;
  recipientUserId: number;
  subscriptionId: number;
  periodEnd: Date | null;
}): string {
  const period = params.periodEnd ? params.periodEnd.getTime() : 'x';
  return `v1:payment_failed:email:${params.recipientUserId}:sub${params.subscriptionId}-${params.role}-p${period}`;
}
