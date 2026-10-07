import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

/**
 * La vista admin dei pagamenti: abbonamenti, sedute acquistate e salute del
 * webhook Stripe. Solo lettura, pensata per il supporto («l'atleta dice di aver
 * pagato e non vede niente»): in una riga si vede chi, cosa, in che stato e se
 * Stripe ha parlato con noi.
 *
 * Nessun dato di carta e nessun importo oltre al prezzo del piano: non li
 * abbiamo, e il dettaglio dei movimenti sta nella dashboard Stripe del coach.
 */

export type AdminSubscriptionRow = {
  id: number;
  athleteName: string;
  coachName: string;
  planName: string;
  monthlyPriceCents: number;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  subscribedAt: Date | null;
  updatedAt: Date;
};

export type AdminCreditRow = {
  id: number;
  athleteName: string;
  coachName: string;
  kind: string;
  status: string;
  priceCents: number;
  grantedAt: Date | null;
  expiresAt: Date | null;
  bookingId: number | null;
  createdAt: Date;
};

export type AdminWebhookEventRow = {
  id: number;
  eventType: string;
  status: string;
  attempts: number;
  lastErrorCode: string | null;
  receivedAt: Date;
};

export type AdminPaymentsOverview = {
  subscriptions: AdminSubscriptionRow[];
  credits: AdminCreditRow[];
  failedEvents: AdminWebhookEventRow[];
  /** Eventi falliti non ancora riusciti, negli ultimi 30 giorni. */
  failedEventCount: number;
  /** Abbonamenti con il pagamento in ritardo. */
  pastDueCount: number;
  /** L'ultimo evento ricevuto da Stripe, per vedere che il canale è vivo. */
  lastEventAt: Date | null;
};

const LIMIT = 50;

// `db.execute` restituisce le colonne con il nome SQL e le date come stringa
// o Date a seconda del driver: si normalizza una volta qui.
function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

const PERSON = (alias: string) => sql.raw(`
  coalesce(nullif(trim(${alias}p.display_name), ''),
           nullif(trim(concat_ws(' ', ${alias}.name, ${alias}.last_name)), ''),
           ${alias}.email)
`);

export async function getAdminPaymentsOverview(): Promise<AdminPaymentsOverview> {
  const [subs, credits, failed, counts] = await Promise.all([
    db.execute(sql`
      SELECT s.id, s.plan_name, s.monthly_price_cents, s.status,
             s.cancel_at_period_end, s.current_period_end, s.subscribed_at,
             s.updated_at,
             ${PERSON('a')} AS athlete_name,
             ${PERSON('c')} AS coach_name
      FROM plan_subscriptions s
      JOIN users a ON a.id = s.athlete_user_id
      LEFT JOIN profiles ap ON ap.user_id = a.id
      JOIN users c ON c.id = s.coach_user_id
      LEFT JOIN profiles cp ON cp.user_id = c.id
      ORDER BY s.updated_at DESC
      LIMIT ${LIMIT}
    `),
    db.execute(sql`
      SELECT k.id, k.kind, k.status, k.price_cents, k.granted_at, k.expires_at,
             k.booking_id, k.created_at,
             ${PERSON('a')} AS athlete_name,
             ${PERSON('c')} AS coach_name
      FROM session_credits k
      JOIN users a ON a.id = k.athlete_user_id
      LEFT JOIN profiles ap ON ap.user_id = a.id
      JOIN users c ON c.id = k.coach_user_id
      LEFT JOIN profiles cp ON cp.user_id = c.id
      ORDER BY k.created_at DESC
      LIMIT ${LIMIT}
    `),
    db.execute(sql`
      SELECT id, event_type, status, attempts, last_error_code, received_at
      FROM stripe_webhook_events
      WHERE status = 'failed' AND received_at > now() - interval '30 days'
      ORDER BY received_at DESC
      LIMIT 20
    `),
    db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM stripe_webhook_events
          WHERE status = 'failed' AND received_at > now() - interval '30 days') AS failed_events,
        (SELECT count(*)::int FROM plan_subscriptions WHERE status = 'past_due') AS past_due,
        (SELECT max(received_at) FROM stripe_webhook_events) AS last_event_at
    `),
  ]);

  const rows = (r: unknown) => r as unknown as Record<string, unknown>[];
  const [c] = rows(counts);

  return {
    subscriptions: rows(subs).map((r) => ({
      id: Number(r.id),
      athleteName: String(r.athlete_name),
      coachName: String(r.coach_name),
      planName: String(r.plan_name),
      monthlyPriceCents: Number(r.monthly_price_cents),
      status: String(r.status),
      cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
      currentPeriodEnd: toDate(r.current_period_end),
      subscribedAt: toDate(r.subscribed_at),
      updatedAt: toDate(r.updated_at) ?? new Date(0),
    })),
    credits: rows(credits).map((r) => ({
      id: Number(r.id),
      athleteName: String(r.athlete_name),
      coachName: String(r.coach_name),
      kind: String(r.kind),
      status: String(r.status),
      priceCents: Number(r.price_cents),
      grantedAt: toDate(r.granted_at),
      expiresAt: toDate(r.expires_at),
      bookingId: r.booking_id === null ? null : Number(r.booking_id),
      createdAt: toDate(r.created_at) ?? new Date(0),
    })),
    failedEvents: rows(failed).map((r) => ({
      id: Number(r.id),
      eventType: String(r.event_type),
      status: String(r.status),
      attempts: Number(r.attempts),
      lastErrorCode: r.last_error_code ? String(r.last_error_code) : null,
      receivedAt: toDate(r.received_at) ?? new Date(0),
    })),
    failedEventCount: Number(c?.failed_events ?? 0),
    pastDueCount: Number(c?.past_due ?? 0),
    lastEventAt: toDate(c?.last_event_at),
  };
}

/** Il numero da mostrare sul badge del menu: ciò che chiede un'occhiata. */
export async function getAdminPaymentsAttentionCount(): Promise<number> {
  const [row] = (await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM stripe_webhook_events
        WHERE status = 'failed' AND received_at > now() - interval '30 days')
      + (SELECT count(*)::int FROM plan_subscriptions WHERE status = 'past_due') AS n
  `)) as unknown as { n: number }[];
  return Number(row?.n ?? 0);
}
