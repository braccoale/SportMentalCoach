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
 *  - le sedute si contano nel periodo in cui sono **fissate**: si può prenotare
 *    dopo il rinnovo con le sedute del periodo nuovo, ma al massimo di UN
 *    rinnovo avanti (oltre, il rinnovo non è ancora avvenuto e non si sa se
 *    avverrà);
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
  | { ok: true }
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

export function decideBookingAccess(input: BookingAccessInput): BookingAccess {
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
  const { current, next } = periods;

  if (at < current.start.getTime()) return refuse('BEFORE_PERIOD');
  if (at >= next.end.getTime()) {
    return refuse('TOO_FAR', {
      lastBookable: formatLongDateRome(new Date(next.end.getTime() - 1)),
    });
  }
  if (at >= current.end.getTime() && subscription.cancelAtPeriodEnd) {
    return refuse('AFTER_END', { renewal: formatLongDateRome(current.end) });
  }

  const period = at < current.end.getTime() ? current : next;
  const usage = sessionUsageForPeriod({
    sessionsPerMonth: subscription.sessionsPerMonth,
    periodStart: period.start,
    periodEnd: period.end,
    bookings: input.bookings,
  });
  if (usage.known && usage.remaining <= 0) {
    return period.index === 0
      ? refuse('NO_CREDITS', {
          total: usage.total,
          renewal: formatLongDateRome(current.end),
        })
      : refuse('NO_CREDITS', {
          total: usage.total,
          nextStart: formatLongDateRome(next.start),
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
