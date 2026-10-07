/**
 * Se un atleta può prenotare una seduta con un coach a pagamento, e perché no.
 *
 * Una sola decisione, usata due volte: dal **server**, che rifiuta la
 * prenotazione, e dalla **lista** «Nuovo appuntamento», che offre soltanto le
 * date che il server accetterebbe. Offrire e poi negare nello stesso gesto
 * sembra un guasto.
 *
 * Le regole, come decise:
 *  - un coach senza pagamenti attivi (o senza piani acquistabili) resta come
 *    prima: nessun abbonamento richiesto;
 *  - la sessione conoscitiva gratuita non consuma niente e non richiede niente;
 *  - per un coach a pagamento serve un abbonamento vivo con quel coach;
 *  - si prenota **dentro il periodo pagato**, più una tolleranza di
 *    `BOOKING_GRACE_DAYS_AFTER_PERIOD` giorni dopo la fine (una seduta il 7
 *    novembre per chi si rinnova il 6). Oltre non si sa se il rinnovo avverrà,
 *    quindi non si fissa niente: dopo il rinnovo il periodo nuovo apre le sue
 *    date. Le sedute fissate nella tolleranza si contano contro le sedute del
 *    periodo che sta finendo;
 *  - un abbonamento annullato a fine periodo non dà sedute oltre la fine;
 *  - un pagamento in ritardo ferma le nuove prenotazioni.
 *
 * Modulo puro: si prova con date fisse.
 */

import { sessionUsageForPeriod, type UsageBooking } from './session-usage';
import { formatLongDateRome } from './subscription-status';

export type CreditSubscription = {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  sessionsPerMonth: number;
};

export type CreditPeriod = { index: 0 | 1; start: Date; end: Date };

/** Quanti giorni dopo la fine del periodo pagato si può ancora fissare una seduta. */
export const BOOKING_GRACE_DAYS_AFTER_PERIOD = 7;

/** «Un mese dopo», con il giorno ridotto se il mese dopo è più corto (31 gen → 28 feb). */
export function addOneMonthUtc(date: Date): Date {
  if (Number.isNaN(date.getTime())) throw new Error('INVALID_DATE');
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const lastDayNextMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month + 1,
      Math.min(day, lastDayNextMonth),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}

/** Il periodo corrente e quello successivo, o `null` se Stripe non ha ancora dato le date. */
export function creditPeriods(
  subscription: Pick<CreditSubscription, 'currentPeriodStart' | 'currentPeriodEnd'>
): { current: CreditPeriod; next: CreditPeriod } | null {
  const { currentPeriodStart: start, currentPeriodEnd: end } = subscription;
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  return {
    current: { index: 0, start, end },
    next: { index: 1, start: end, end: addOneMonthUtc(end) },
  };
}

export type BookingAccessRefusal =
  | 'NO_SUBSCRIPTION'
  | 'SUBSCRIPTION_PAST_DUE'
  | 'PERIOD_UNKNOWN'
  | 'BEFORE_PERIOD'
  | 'TOO_FAR'
  | 'AFTER_END'
  | 'NO_CREDITS';

export type BookingAccess =
  /** `usesCredit`: la seduta non esce dal piano ma da una acquistata a parte. */
  | { ok: true; usesCredit?: boolean }
  | { ok: false; reason: BookingAccessRefusal; message: string };

export type BookingViewer = 'athlete' | 'coach';

export type BookingAccessInput = {
  /** Il coach ha i pagamenti attivi e almeno un piano acquistabile. */
  requiresSubscription: boolean;
  isIntro: boolean;
  subscription: CreditSubscription | null;
  scheduledFor: Date;
  /** Le prenotazioni di questo atleta con questo coach nei due periodi. */
  bookings: UsageBooking[];
  /**
   * Chi sta prenotando: il messaggio parla a lui. Un coach che fissa una
   * sessione non deve leggere «abbonati dalla sua scheda»: la regola è la
   * stessa, la frase no. Se manca, è l'atleta.
   */
  viewer?: BookingViewer;
  /**
   * Le sedute acquistate a parte ancora libere (pagate, non scadute, non già
   * legate a una prenotazione viva). Coprono ciò che il piano non copre.
   */
  credits?: { expiresAt: Date }[];
};

type MessageContext = {
  total?: number;
  renewal?: string;
  nextStart?: string;
  lastBookable?: string;
};

function refusalMessage(
  reason: BookingAccessRefusal,
  viewer: BookingViewer,
  ctx: MessageContext
): string {
  const athlete = viewer === 'athlete';
  switch (reason) {
    case 'NO_SUBSCRIPTION':
      return athlete
        ? 'Per prenotare con questo coach serve un abbonamento. Abbonati dalla sua scheda.'
        : 'Con i pagamenti attivi puoi fissare una sessione solo con atleti che hanno un abbonamento con te. Questo atleta non ne ha uno (la sessione conoscitiva gratuita ne è esente).';
    case 'SUBSCRIPTION_PAST_DUE':
      return athlete
        ? 'L’ultimo pagamento del tuo abbonamento non è andato a buon fine: sistemalo per prenotare nuove sedute.'
        : 'L’ultimo pagamento di questo atleta non è andato a buon fine: non puoi fissare nuove sessioni finché non lo sistema.';
    case 'PERIOD_UNKNOWN':
      return athlete
        ? 'Stiamo ancora confermando il tuo abbonamento: riprova tra poco.'
        : 'Stiamo ancora confermando l’abbonamento di questo atleta: riprova tra poco.';
    case 'BEFORE_PERIOD':
      return 'Scegli una data a partire da oggi.';
    case 'TOO_FAR':
      return athlete
        ? `Puoi prenotare fino al ${ctx.lastBookable}: oltre, il tuo abbonamento non si è ancora rinnovato.`
        : `Puoi fissare sessioni fino al ${ctx.lastBookable}: oltre, l’abbonamento dell’atleta non si è ancora rinnovato.`;
    case 'AFTER_END':
      return athlete
        ? `Il tuo abbonamento termina il ${ctx.renewal}: dopo quella data non puoi prenotare. Puoi riattivarlo dalla pagina Abbonamenti.`
        : `L’abbonamento di questo atleta termina il ${ctx.renewal}: dopo quella data non puoi fissare sessioni.`;
    case 'NO_CREDITS':
      if (ctx.nextStart) {
        return athlete
          ? `Hai già prenotato tutte le ${ctx.total} sedute del periodo che inizia il ${ctx.nextStart}.`
          : `Questo atleta ha già tutte le ${ctx.total} sedute del periodo che inizia il ${ctx.nextStart} fissate.`;
      }
      return athlete
        ? `Hai già usato tutte le ${ctx.total} sedute di questo periodo. Il prossimo rinnovo è il ${ctx.renewal}: da quella data puoi prenotare le nuove sedute.`
        : `Questo atleta ha già usato tutte le ${ctx.total} sedute di questo periodo. Il prossimo rinnovo è il ${ctx.renewal}: da quella data puoi fissare le nuove sedute.`;
  }
}

/**
 * Rifiuti che una seduta acquistata a parte risolve: niente abbonamento, un
 * pagamento in ritardo, il piano a fine corsa o le sedute del periodo finite.
 * Non risolve invece una data nel passato né un abbonamento ancora da
 * confermare: lì non è questione di sedute.
 */
const COVERED_BY_PURCHASED_SESSION: ReadonlySet<BookingAccessRefusal> = new Set([
  'NO_SUBSCRIPTION',
  'SUBSCRIPTION_PAST_DUE',
  'AFTER_END',
  'TOO_FAR',
  'NO_CREDITS',
]);

/**
 * La regola completa: prima il piano; se il piano non basta, una seduta
 * acquistata a parte, a patto che sia ancora valida **alla data scelta**. Le
 * sedute extra si consumano così dopo quelle del piano, mai prima.
 */
export function decideBookingAccess(input: BookingAccessInput): BookingAccess {
  const plan = decidePlanAccess(input);
  if (plan.ok || !COVERED_BY_PURCHASED_SESSION.has(plan.reason)) return plan;
  // Prima si prenotano le sedute del piano, dentro il periodo e la tolleranza:
  // la seduta extra non apre date più lontane finché al piano ne restano.
  if (plan.reason === 'TOO_FAR' && planSessionsLeft(input) > 0) return plan;
  const at = input.scheduledFor.getTime();
  const covered = (input.credits ?? []).some(
    (credit) => credit.expiresAt.getTime() > at
  );
  return covered ? { ok: true, usesCredit: true } : plan;
}

/** Le sedute del piano ancora da fissare nel periodo (con la tolleranza); 0 se non si sa. */
function planSessionsLeft(input: BookingAccessInput): number {
  const subscription = input.subscription;
  const periods = subscription ? creditPeriods(subscription) : null;
  if (!subscription || !periods) return 0;
  const limit = new Date(
    periods.current.end.getTime() + BOOKING_GRACE_DAYS_AFTER_PERIOD * 24 * 60 * 60 * 1000
  );
  const usage = sessionUsageForPeriod({
    sessionsPerMonth: subscription.sessionsPerMonth,
    periodStart: periods.current.start,
    periodEnd: limit,
    bookings: input.bookings,
  });
  return usage.known ? usage.remaining : 0;
}

function decidePlanAccess(input: BookingAccessInput): BookingAccess {
  const viewer = input.viewer ?? 'athlete';
  const refuse = (
    reason: BookingAccessRefusal,
    ctx: MessageContext = {}
  ): BookingAccess => ({
    ok: false,
    reason,
    message: refusalMessage(reason, viewer, ctx),
  });

  if (!input.requiresSubscription || input.isIntro) return { ok: true };

  const subscription = input.subscription;
  if (!subscription) return refuse('NO_SUBSCRIPTION');
  if (subscription.status === 'past_due') return refuse('SUBSCRIPTION_PAST_DUE');

  const periods = creditPeriods(subscription);
  if (!periods) return refuse('PERIOD_UNKNOWN');

  const at = input.scheduledFor.getTime();
  const { current } = periods;

  if (at < current.start.getTime()) return refuse('BEFORE_PERIOD');
  if (at >= current.end.getTime() && subscription.cancelAtPeriodEnd) {
    return refuse('AFTER_END', { renewal: formatLongDateRome(current.end) });
  }
  const limit = new Date(
    current.end.getTime() + BOOKING_GRACE_DAYS_AFTER_PERIOD * 24 * 60 * 60 * 1000
  );
  if (at >= limit.getTime()) {
    return refuse('TOO_FAR', {
      lastBookable: formatLongDateRome(new Date(limit.getTime() - 1)),
    });
  }

  // La tolleranza usa le sedute del periodo che sta finendo: si conta tutto
  // ciò che è fissato da inizio periodo fino al limite.
  const usage = sessionUsageForPeriod({
    sessionsPerMonth: subscription.sessionsPerMonth,
    periodStart: current.start,
    periodEnd: limit,
    bookings: input.bookings,
  });
  if (usage.known && usage.remaining <= 0) {
    return refuse('NO_CREDITS', {
      total: usage.total,
      renewal: formatLongDateRome(current.end),
    });
  }

  return { ok: true };
}

/** Quante sedute restano nel periodo corrente e in quello successivo: per mostrarle. */
export function creditsSummary(
  subscription: CreditSubscription,
  bookings: UsageBooking[]
): {
  total: number;
  remainingNow: number | null;
  remainingNext: number | null;
  renewalLabel: string | null;
} {
  const periods = creditPeriods(subscription);
  if (!periods) {
    return { total: subscription.sessionsPerMonth, remainingNow: null, remainingNext: null, renewalLabel: null };
  }
  const left = (period: CreditPeriod) => {
    const usage = sessionUsageForPeriod({
      sessionsPerMonth: subscription.sessionsPerMonth,
      periodStart: period.start,
      periodEnd: period.end,
      bookings,
    });
    return usage.known ? usage.remaining : null;
  };
  return {
    total: subscription.sessionsPerMonth,
    remainingNow: left(periods.current),
    remainingNext: left(periods.next),
    renewalLabel: formatLongDateRome(periods.current.end),
  };
}
