import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import type { WidgetSpec } from './catalog';

/**
 * Le letture sulle persone: chi usa la piattaforma, cosa ha fatto, come è
 * arrivato. Solo account veri: niente demo, niente amministratori (sono rumore
 * di fondo: sono loro a guardare). Aggregate dal database e a piccoli gruppi
 * (il pooler si impunta con molte richieste insieme).
 *
 * Mostrano nome e ruolo, non l'email: l'elenco completo degli utenti, con le
 * email, sta già nella sua pagina e qui non serve.
 */

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>): Promise<Row[]> => (await db.execute(q)) as unknown as Row[];
const num = (v: unknown): number => Number(v ?? 0);
const iso = (v: unknown) => (v ? new Date(v as string | Date).toISOString() : null);

/** Gli eventi che non dicono che la persona abbia fatto qualcosa di utile: accesso, uscita, registrazione. */
export const NON_MEANINGFUL_EVENTS = ['auth_sign_in', 'auth_sign_out', 'signup_completed', 'page_view'] as const;

export type UserRow = {
  id: number;
  name: string;
  roles: string;
  createdAt: string;
  events: number;
  /** Le pagine aperte nel periodo. */
  pages: number;
  meaningful: number;
  activeDays: number;
  lastAt: string | null;
  /** Ha fatto qualcosa negli ultimi cinque minuti. */
  live: boolean;
};

export type UsersOverview = {
  users: UserRow[];
  active7: number;
  medianActiveDays: number;
  meaningfulPerActiveUser: number;
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export async function getUsersOverview(days: number, now: Date = new Date()): Promise<UsersOverview> {
  const since = sql`now() - (${days}::int * interval '1 day')`;
  const result = await rows(sql`
    select u.id,
      coalesce(nullif(trim(concat(coalesce(u.name,''),' ',coalesce(u.last_name,''))),''), 'Senza nome') as name,
      coalesce((select string_agg(ur.role_key, ', ' order by ur.role_key) from user_roles ur where ur.user_id = u.id), '') as roles,
      u.created_at as created_at,
      (count(e.id) filter (where e.event <> 'page_view'))::int as events,
      (count(e.id) filter (where e.event = 'page_view'))::int as pages,
      (count(e.id) filter (where e.event not in ('auth_sign_in','auth_sign_out','signup_completed','page_view')))::int as meaningful,
      count(distinct (e.occurred_at at time zone 'Europe/Rome')::date)::int as active_days,
      (select max(x.occurred_at) from usage_events x where x.user_id = u.id and x.is_demo = false) as last_at
    from users u
    left join usage_events e on e.user_id = u.id and e.is_demo = false and e.occurred_at >= ${since}
    where u.is_demo = false and u.deleted_at is null
      and not exists (select 1 from user_roles ur where ur.user_id = u.id and ur.role_key = 'admin')
    group by u.id
    order by last_at desc nulls last, u.created_at desc
    limit 100`);

  const users: UserRow[] = result.map((r) => {
    const lastAt = iso(r.last_at);
    return {
      id: num(r.id),
      name: String(r.name),
      roles: String(r.roles || '—'),
      createdAt: iso(r.created_at) ?? '',
      events: num(r.events),
      pages: num(r.pages),
      meaningful: num(r.meaningful),
      activeDays: num(r.active_days),
      lastAt,
      live: lastAt ? now.getTime() - new Date(lastAt).getTime() <= 5 * 60_000 : false,
    };
  });

  const sevenDaysAgo = now.getTime() - 7 * 86_400_000;
  const activeInPeriod = users.filter((u) => u.events + u.pages > 0);
  return {
    users,
    active7: users.filter((u) => u.lastAt && new Date(u.lastAt).getTime() >= sevenDaysAgo).length,
    medianActiveDays: median(activeInPeriod.map((u) => u.activeDays)),
    meaningfulPerActiveUser:
      activeInPeriod.length > 0
        ? Math.round((activeInPeriod.reduce((a, u) => a + u.meaningful, 0) / activeInPeriod.length) * 10) / 10
        : 0,
  };
}

export type TimelineEvent = {
  at: string;
  event: string;
  outcome: string;
  entityType: string | null;
  entityId: number | null;
  props: Record<string, string | number | boolean> | null;
  device: string | null;
};

/** Gli ultimi gesti di una persona, dal più recente. Chi guarda viene registrato nel registro dell'amministrazione. */
export async function getUserTimeline(userId: number, limit = 300): Promise<{ name: string; roles: string; events: TimelineEvent[]; pages: { route: string; n: number }[] } | null> {
  const [user] = await rows(sql`
    select coalesce(nullif(trim(concat(coalesce(u.name,''),' ',coalesce(u.last_name,''))),''), 'Senza nome') as name,
      coalesce((select string_agg(ur.role_key, ', ' order by ur.role_key) from user_roles ur where ur.user_id = u.id), '') as roles
    from users u
    where u.id = ${userId} and u.is_demo = false and u.deleted_at is null
      and not exists (select 1 from user_roles ur where ur.user_id = u.id and ur.role_key = 'admin')`);
  if (!user) return null;
  const events = await rows(sql`
    select occurred_at, event, outcome, entity_type, entity_id, props, device_class
    from usage_events where user_id = ${userId} and is_demo = false
    order by occurred_at desc limit ${limit}`);
  // Le pagine che questa persona apre di più (su tutta la storia che abbiamo, non solo sugli ultimi gesti).
  const pages = await rows(sql`select props->>'route' as route, count(*)::int as n from usage_events
    where user_id = ${userId} and event = 'page_view' and is_demo = false
    group by 1 order by 2 desc limit 8`);
  return {
    name: String(user.name),
    roles: String(user.roles || '—'),
    pages: pages.map((r) => ({ route: String(r.route ?? ''), n: num(r.n) })),
    events: events.map((e) => ({
      at: iso(e.occurred_at) ?? '',
      event: String(e.event),
      outcome: String(e.outcome),
      entityType: e.entity_type ? String(e.entity_type) : null,
      entityId: e.entity_id != null ? num(e.entity_id) : null,
      props: (e.props as TimelineEvent['props']) ?? null,
      device: e.device_class ? String(e.device_class) : null,
    })),
  };
}

export type SignupSources = {
  total: number;
  byRole: { role: string; n: number }[];
  /** Quanti sono arrivati con l'invito di un altro utente. */
  invited: number;
  perDay: { day: string; n: number }[];
};

/** Da dove arrivano gli iscritti: chi è stato invitato da un utente e chi no. */
export async function getSignupSources(days: number): Promise<SignupSources> {
  const since = sql`now() - (${days}::int * interval '1 day')`;
  const [byRole, invited, perDay] = await Promise.all([
    rows(sql`select coalesce((select min(ur.role_key) from user_roles ur where ur.user_id = u.id), 'sconosciuto') as role, count(*)::int as n
      from users u
      where u.is_demo = false and u.deleted_at is null and u.created_at >= ${since}
        and not exists (select 1 from user_roles ur where ur.user_id = u.id and ur.role_key = 'admin')
      group by 1 order by 2 desc`),
    rows(sql`select count(*)::int as n from referrals r join users u on u.id = r.referred_user_id
      where u.is_demo = false and u.created_at >= ${since}`),
    rows(sql`select (u.created_at at time zone 'Europe/Rome')::date::text as day, count(*)::int as n
      from users u
      where u.is_demo = false and u.deleted_at is null and u.created_at >= ${since}
        and not exists (select 1 from user_roles ur where ur.user_id = u.id and ur.role_key = 'admin')
      group by 1 order by 1`),
  ]);
  return {
    total: byRole.reduce((a, r) => a + num(r.n), 0),
    byRole: byRole.map((r) => ({ role: String(r.role), n: num(r.n) })),
    invited: num(invited[0]?.n),
    perDay: perDay.map((r) => ({ day: String(r.day), n: num(r.n) })),
  };
}

/* ------------------------------ gli elenchi dietro i numeri ------------------------------ */

export type WidgetUserRow = {
  /** `null` per le righe anonime (un'apertura della demo). */
  id: number | null;
  name: string;
  roles: string;
  detail: string;
};

export type WidgetList = { rows: WidgetUserRow[]; note: string | null };

const when = (value: unknown): string =>
  value
    ? new Date(value as string | Date).toLocaleString('it-IT', {
        timeZone: 'Europe/Rome',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const NOT_ADMIN = sql`not exists (select 1 from user_roles ur where ur.user_id = u.id and ur.role_key = 'admin')`;
const NAME = sql`coalesce(nullif(trim(concat(coalesce(u.name,''),' ',coalesce(u.last_name,''))),''), 'Senza nome')`;
const ROLES = sql`coalesce((select string_agg(ur.role_key, ', ' order by ur.role_key) from user_roles ur where ur.user_id = u.id), '')`;

/**
 * Chi c'è dietro un numero o una barra. Solo account veri (niente demo né
 * amministratori), al massimo duecento righe, e solo ciò che la pagina ha già
 * mostrato in forma aggregata: nome, ruolo e un dettaglio.
 */
export async function getUsersForWidget(spec: WidgetSpec, days: number): Promise<WidgetList> {
  const since = sql`now() - (${days}::int * interval '1 day')`;
  const toRows = (list: Row[], detail: (r: Row) => string): WidgetUserRow[] =>
    list.map((r) => ({ id: num(r.id), name: String(r.name), roles: String(r.roles || '—'), detail: detail(r) }));

  const activity = (condition: ReturnType<typeof sql>) =>
    rows(sql`select u.id, ${NAME} as name, ${ROLES} as roles,
        (count(e.id) filter (where e.event <> 'page_view'))::int as events,
        (count(e.id) filter (where e.event = 'page_view'))::int as pages,
        max(e.occurred_at) as last_at
      from users u join usage_events e on e.user_id = u.id and e.is_demo = false
      where u.is_demo = false and u.deleted_at is null and ${NOT_ADMIN} and ${condition}
      group by u.id order by last_at desc limit 200`);
  const activityDetail = (r: Row) =>
    `${num(r.events)} ${num(r.events) === 1 ? 'gesto' : 'gesti'} · ${num(r.pages)} ${num(r.pages) === 1 ? 'pagina' : 'pagine'} · ultimo ${when(r.last_at)}`;

  switch (spec.kind) {
    case 'active7':
      return { rows: toRows(await activity(sql`e.occurred_at >= now() - interval '7 days'`), activityDetail), note: null };
    case 'active_day':
      return {
        rows: toRows(await activity(sql`(e.occurred_at at time zone 'Europe/Rome')::date = ${spec.day}::date`), activityDetail),
        note: null,
      };
    case 'median': {
      const overview = await getUsersOverview(days);
      return {
        rows: overview.users
          .filter((u) => u.events + u.pages > 0)
          .sort((a, b) => b.activeDays - a.activeDays)
          .map((u) => ({
            id: u.id,
            name: u.name,
            roles: u.roles,
            detail: `${u.activeDays} ${u.activeDays === 1 ? 'giorno attivo' : 'giorni attivi'}`,
          })),
        note: null,
      };
    }
    case 'signups':
    case 'signups_invited':
    case 'signups_direct':
    case 'signup_day': {
      const filter =
        spec.kind === 'signups_invited'
          ? sql`and r.id is not null`
          : spec.kind === 'signups_direct'
            ? sql`and r.id is null`
            : spec.kind === 'signup_day'
              ? sql`and (u.created_at at time zone 'Europe/Rome')::date = ${spec.day}::date`
              : sql``;
      const list = await rows(sql`select u.id, ${NAME} as name, ${ROLES} as roles, u.created_at as created_at,
          nullif(trim(concat(coalesce(i.name,''),' ',coalesce(i.last_name,''))),'') as inviter
        from users u
        left join referrals r on r.referred_user_id = u.id
        left join users i on i.id = r.inviter_user_id
        where u.is_demo = false and u.deleted_at is null and u.created_at >= ${since} and ${NOT_ADMIN} ${filter}
        order by u.created_at desc limit 200`);
      return {
        rows: toRows(list, (r) => `iscritto ${when(r.created_at)}${r.inviter ? ` · invitato da ${r.inviter}` : ''}`),
        note: null,
      };
    }
    case 'funnel':
    case 'event': {
      const list = await rows(sql`select u.id, ${NAME} as name, ${ROLES} as roles,
          count(e.id)::int as n, max(e.occurred_at) as last_at
        from users u join usage_events e on e.user_id = u.id and e.is_demo = false
        where u.is_demo = false and u.deleted_at is null and ${NOT_ADMIN}
          and e.event = ${spec.event} and e.occurred_at >= ${since}
        group by u.id order by last_at desc limit 200`);
      return {
        rows: toRows(list, (r) => `${num(r.n)} ${num(r.n) === 1 ? 'volta' : 'volte'} · ultima ${when(r.last_at)}`),
        note: null,
      };
    }
    case 'demo': {
      const list = await rows(sql`select occurred_at as at, coalesce(role, 'sconosciuto') as role, device_class as device
        from usage_events where event = 'demo_opened' and occurred_at >= ${since}
        order by occurred_at desc limit 200`);
      return {
        rows: list.map((r) => ({
          id: null,
          name: `Demo ${r.role === 'coach' ? 'coach' : r.role === 'athlete' ? 'atleta' : String(r.role)}`,
          roles: '',
          detail: `${when(r.at)}${r.device ? ` · ${r.device === 'mobile' ? 'telefono' : r.device === 'tablet' ? 'tablet' : 'computer'}` : ''}`,
        })),
        note: 'Chi apre la demo non ha un account: per scelta non sappiamo chi sia, vediamo solo quando e da che tipo di dispositivo.',
      };
    }
  }
}
