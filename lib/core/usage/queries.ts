import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { fillSeries, lastDays, romeToday } from './series';

/**
 * Le letture della pagina «Utilizzo» dell'amministrazione.
 *
 * Tutte sul passato recente e tutte aggregate dal database: la pagina non
 * scarica righe per contarle. I giorni sono giorni di Roma, perché è così che
 * chi guarda la pagina ragiona («oggi», «ieri»).
 */

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>): Promise<Row[]> => (await db.execute(q)) as unknown as Row[];
const num = (v: unknown): number => Number(v ?? 0);

/**
 * Esegue le letture a piccoli gruppi. Il database passa da un pooler che si
 * impunta con molte richieste in volo insieme (vedi `lib/db/drizzle.ts`): con
 * quattordici query lanciate tutte insieme la pagina restava appesa.
 */
async function runLimited<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    results.push(...(await Promise.all(tasks.slice(i, i + limit).map((task) => task()))));
  }
  return results;
}

export type UsageReport = {
  /** Da quando esistono dati d'uso (prima non si registrava niente). */
  trackingSince: string | null;
  visits: {
    perDay: { day: string; views: number; uniques: number }[];
    byReferrer: { kind: string; views: number; uniques: number }[];
    topRoutes: { route: string; views: number; uniques: number }[];
    totalUniques: number;
  };
  demo: { total: number; byRole: { role: string; n: number }[]; recent: { at: string; role: string; device: string | null }[] };
  newUsers: { id: number; createdAt: string; roles: string; source: string }[];
  activeUsers: { role: string; users: number }[];
  funnel: { event: string; users: number }[];
  bookings: { event: string; n: number }[];
  /** Un punto per ogni giorno (giorni di Roma), con zero dove non è successo niente. */
  series: { day: string; views: number; uniques: number; events: number; users: number; demo: number; errors: number }[];
  /** Le pagine aperte da chi ha un account: quante volte e da quante persone diverse. */
  accountSections: { route: string; views: number; users: number }[];
  perfRoutes: {
    route: string;
    metric: string;
    n: number;
    p50: number;
    p75: number;
    p95: number;
  }[];
  errors: { kind: string; code: string | null; route: string; n: number; lastAt: string }[];
  joinDenied: { reason: string; n: number }[];
};

export async function getUsageReport(days = 30): Promise<UsageReport> {
  const since = sql`now() - (${days}::int * interval '1 day')`;

  const [first, perDay, byReferrer, topRoutes, uniquesTotal, demoByRole, demoRecent, newUsers, active, funnel, bookings, perf, errors, denied, eventsPerDay, errorsPerDay, sections] =
    await runLimited([
      () => rows(sql`select least(
          (select min(occurred_at) from usage_events),
          (select min(day)::timestamp from page_views_daily),
          (select min(occurred_at) from perf_samples)
        ) as since`),
      () => rows(sql`select day::text as day, sum(views)::int as views, sum(uniques)::int as uniques
        from page_views_daily where day >= (now() - (${days}::int * interval '1 day'))::date
        group by day order by day desc`),
      () => rows(sql`select referrer_kind as kind, sum(views)::int as views, sum(uniques)::int as uniques
        from page_views_daily where day >= (now() - (${days}::int * interval '1 day'))::date
        group by referrer_kind order by 3 desc, 2 desc`),
      () => rows(sql`select route, sum(views)::int as views, sum(uniques)::int as uniques
        from page_views_daily where day >= (now() - (${days}::int * interval '1 day'))::date
        group by route order by 3 desc, 2 desc limit 8`),
      () => rows(sql`select coalesce(sum(uniques),0)::int as n from page_views_daily
        where day >= (now() - (${days}::int * interval '1 day'))::date`),
      () => rows(sql`select coalesce(role,'sconosciuto') as role, count(*)::int as n from usage_events
        where event = 'demo_opened' and occurred_at >= ${since} group by 1 order by 2 desc`),
      () => rows(sql`select occurred_at as at, coalesce(role,'sconosciuto') as role, device_class as device
        from usage_events where event = 'demo_opened' order by occurred_at desc limit 8`),
      // Chi si è iscritto, dalla tabella degli utenti: vale anche per prima che si registrasse l'uso.
      () => rows(sql`select u.id, u.created_at as created_at,
          coalesce((select string_agg(ur.role_key, ', ' order by ur.role_key) from user_roles ur where ur.user_id = u.id), '') as roles,
          case when exists (select 1 from usage_events e where e.user_id = u.id and e.event = 'signup_completed') then 'registrato' else 'prima del tracciamento' end as source
        from users u
        where u.is_demo = false and u.deleted_at is null
          and not exists (select 1 from user_roles ur where ur.user_id = u.id and ur.role_key = 'admin')
        order by u.created_at desc limit 12`),
      () => rows(sql`select coalesce(role, 'non indicato') as role, count(distinct user_id)::int as users
        from usage_events where user_id is not null and is_demo = false and occurred_at >= ${since}
        group by 1 order by 2 desc`),
      () => rows(sql`select event, count(distinct user_id)::int as users from usage_events
        where is_demo = false and user_id is not null and occurred_at >= ${since}
          and event in ('signup_completed','onboarding_completed','coach_profile_submitted','coach_profile_approved','booking_requested','booking_accepted','session_joined','booking_completed','review_left')
        group by event`),
      () => rows(sql`select event, count(*)::int as n from usage_events
        where occurred_at >= ${since} and event in ('booking_requested','booking_accepted','booking_declined','booking_cancelled','booking_completed')
        group by event`),
      () => rows(sql`select route, metric, count(*)::int as n,
          percentile_cont(0.5) within group (order by value) as p50,
          percentile_cont(0.75) within group (order by value) as p75,
          percentile_cont(0.95) within group (order by value) as p95
        from perf_samples where occurred_at >= ${since}
        group by route, metric having count(*) >= 1
        order by n desc limit 60`),
      () => rows(sql`select kind, code, route, count(*)::int as n, max(occurred_at) as last_at
        from ui_errors where occurred_at >= ${since}
        group by kind, code, route order by n desc, last_at desc limit 20`),
      () => rows(sql`select coalesce(props->>'reason','sconosciuto') as reason, count(*)::int as n from usage_events
        where event = 'session_joined' and outcome = 'denied' and occurred_at >= ${since}
        group by 1 order by 2 desc limit 8`),
      () => rows(sql`select (occurred_at at time zone 'Europe/Rome')::date::text as day,
          (count(*) filter (where event <> 'page_view'))::int as events,
          (count(distinct user_id) filter (where user_id is not null and is_demo = false))::int as users,
          (count(*) filter (where event = 'demo_opened'))::int as demo
        from usage_events
        where occurred_at >= ${since} and (is_demo = false or event = 'demo_opened')
        group by 1`),
      () => rows(sql`select (occurred_at at time zone 'Europe/Rome')::date::text as day, count(*)::int as n
        from ui_errors where occurred_at >= ${since} group by 1`),
      () => rows(sql`select props->>'route' as route, count(*)::int as views, count(distinct user_id)::int as users
        from usage_events where event = 'page_view' and is_demo = false and occurred_at >= ${since}
        group by 1 order by 2 desc limit 15`),
    ], 4);

  const days30 = lastDays(days, romeToday());
  const viewsSeries = perDay.map((r) => ({ day: String(r.day), views: num(r.views), uniques: num(r.uniques) }));
  const eventsSeries = eventsPerDay.map((r) => ({
    day: String(r.day),
    events: num(r.events),
    users: num(r.users),
    demo: num(r.demo),
  }));
  const errorsSeries = errorsPerDay.map((r) => ({ day: String(r.day), errors: num(r.n) }));
  const byDay = <T extends { day: string }>(list: T[]) => new Map(list.map((x) => [x.day, x]));
  const v = byDay(viewsSeries);
  const e = byDay(eventsSeries);
  const er = byDay(errorsSeries);
  const series = fillSeries(
    days30.map((day) => ({
      day,
      views: v.get(day)?.views ?? 0,
      uniques: v.get(day)?.uniques ?? 0,
      events: e.get(day)?.events ?? 0,
      users: e.get(day)?.users ?? 0,
      demo: e.get(day)?.demo ?? 0,
      errors: er.get(day)?.errors ?? 0,
    })),
    days30,
    ['views', 'uniques', 'events', 'users', 'demo', 'errors']
  );

  const iso = (v: unknown) => (v ? new Date(v as string | Date).toISOString() : '');
  return {
    trackingSince: first[0]?.since ? iso(first[0].since) : null,
    visits: {
      perDay: perDay.map((r) => ({ day: String(r.day), views: num(r.views), uniques: num(r.uniques) })),
      byReferrer: byReferrer.map((r) => ({ kind: String(r.kind), views: num(r.views), uniques: num(r.uniques) })),
      topRoutes: topRoutes.map((r) => ({ route: String(r.route), views: num(r.views), uniques: num(r.uniques) })),
      totalUniques: num(uniquesTotal[0]?.n),
    },
    demo: {
      total: demoByRole.reduce((sum, r) => sum + num(r.n), 0),
      byRole: demoByRole.map((r) => ({ role: String(r.role), n: num(r.n) })),
      recent: demoRecent.map((r) => ({ at: iso(r.at), role: String(r.role), device: r.device ? String(r.device) : null })),
    },
    newUsers: newUsers.map((r) => ({
      id: num(r.id),
      createdAt: iso(r.created_at),
      roles: String(r.roles || '—'),
      source: String(r.source),
    })),
    activeUsers: active.map((r) => ({ role: String(r.role), users: num(r.users) })),
    funnel: funnel.map((r) => ({ event: String(r.event), users: num(r.users) })),
    bookings: bookings.map((r) => ({ event: String(r.event), n: num(r.n) })),
    series,
    accountSections: sections.map((r) => ({ route: String(r.route ?? ''), views: num(r.views), users: num(r.users) })),
    perfRoutes: perf.map((r) => ({
      route: String(r.route),
      metric: String(r.metric),
      n: num(r.n),
      p50: num(r.p50),
      p75: num(r.p75),
      p95: num(r.p95),
    })),
    errors: errors.map((r) => ({
      kind: String(r.kind),
      code: r.code ? String(r.code) : null,
      route: String(r.route),
      n: num(r.n),
      lastAt: iso(r.last_at),
    })),
    joinDenied: denied.map((r) => ({ reason: String(r.reason), n: num(r.n) })),
  };
}

export async function getExcludedIpRows(): Promise<{ id: number; ip: string; label: string | null; createdAt: string }[]> {
  const result = await rows(sql`select id, ip, label, created_at from usage_excluded_ips order by id`);
  return result.map((r) => ({
    id: num(r.id),
    ip: String(r.ip),
    label: r.label ? String(r.label) : null,
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}
