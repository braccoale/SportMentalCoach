/**
 * Dallo stato di un abbonamento Stripe a quello che KaiPai ricorda, e come si
 * leggono le date di periodo.
 *
 * Gli stati di Stripe sono più dei nostri: li riduciamo a quattro. Nel dubbio
 * non si diventa mai `active`: un abbonamento che non sappiamo leggere non dà
 * sedute.
 *
 * Il periodo corrente, nelle versioni recenti dell'API, sta sugli elementi
 * dell'abbonamento e non più sull'abbonamento stesso: si leggono entrambi i
 * posti, perché la forma dipende dalla versione con cui Stripe ci scrive.
 *
 * Modulo puro.
 */

export const PLAN_SUBSCRIPTION_STATUSES = [
  'incomplete',
  'active',
  'past_due',
  'canceled',
] as const;
export type PlanSubscriptionStatus = (typeof PLAN_SUBSCRIPTION_STATUSES)[number];

export function planSubscriptionStatusFromStripe(
  status: string | null | undefined
): PlanSubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      // `incomplete`, `paused` e tutto ciò che non conosciamo.
      return 'incomplete';
  }
}

export type StripeSubscriptionLike = {
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  canceled_at?: number | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  items?: {
    data?: Array<{
      current_period_start?: number | null;
      current_period_end?: number | null;
    }> | null;
  } | null;
};

function fromUnix(value: number | null | undefined): Date | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? new Date(value * 1000)
    : null;
}

export function readSubscriptionPeriod(sub: StripeSubscriptionLike): {
  start: Date | null;
  end: Date | null;
} {
  const item = sub.items?.data?.[0];
  const start = fromUnix(sub.current_period_start ?? item?.current_period_start);
  const end = fromUnix(sub.current_period_end ?? item?.current_period_end);
  // Un periodo che finisce prima di iniziare non è un periodo.
  if (start && end && end.getTime() <= start.getTime()) {
    return { start: null, end: null };
  }
  return { start, end };
}

export function subscriptionUpdateFromStripe(sub: StripeSubscriptionLike): {
  status: PlanSubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
} {
  const period = readSubscriptionPeriod(sub);
  return {
    status: planSubscriptionStatusFromStripe(sub.status),
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    canceledAt: fromUnix(sub.canceled_at),
  };
}

/**
 * Lo stato da salvare quando arriva un evento, dato quello che c'è già.
 *
 * Stripe può consegnare gli eventi fuori ordine e più volte. Due regole lo
 * rendono innocuo senza dover ordinare nulla:
 *  - `canceled` è definitivo: chi si riabbona apre una riga nuova, non
 *    resuscita questa;
 *  - `incomplete` non fa mai tornare indietro un abbonamento già vivo: è
 *    l'eco di un evento vecchio, non una nuova verità.
 */
export function nextPlanSubscriptionStatus(
  current: PlanSubscriptionStatus,
  incoming: PlanSubscriptionStatus
): PlanSubscriptionStatus {
  if (current === 'canceled') return 'canceled';
  if (incoming === 'incomplete' && (current === 'active' || current === 'past_due')) {
    return current;
  }
  return incoming;
}

const OWN_METADATA_KEY = 'kaipai_plan_subscription_id';

/**
 * L'id della nostra riga, se l'oggetto Stripe porta il nostro segno.
 *
 * Un coach collegato incassa anche altro sul proprio conto e quegli eventi
 * arrivano allo stesso webhook: ci si riconosce dal segno che mettiamo noi.
 * Senza segno (o con un valore che non è un numero) l'evento non è nostro.
 */
export function ownRowId(
  metadata: Record<string, string> | null | undefined,
  clientReferenceId?: string | null
): number | null {
  const raw = metadata?.[OWN_METADATA_KEY] ?? clientReferenceId ?? null;
  if (!raw || !/^\d{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

const ITALIAN_MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
] as const;

/**
 * «6 ottobre 2026», nel calendario di Roma.
 *
 * Il giorno si legge in `Europe/Rome`, non in UTC: un abbonamento fatto alle
 * 23:30 del 6 ottobre a Roma è il 6 ottobre anche se in UTC è già il 7. I mesi
 * sono scritti qui: il nome del mese dato da `Intl` cambia con l'ICU del
 * server, e questa è una data che l'atleta legge come prova di quando ha
 * sottoscritto.
 */
export function formatLongDateRome(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const pick = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const day = pick('day');
  const month = pick('month');
  const year = pick('year');
  return `${day} ${ITALIAN_MONTHS[month - 1]} ${year}`;
}

/** Il giorno da mostrare come «sottoscritto il»: la conferma, o il primo segno. */
export function subscribedOn(row: {
  subscribedAt: Date | null;
  createdAt: Date;
}): Date {
  return row.subscribedAt ?? row.createdAt;
}
