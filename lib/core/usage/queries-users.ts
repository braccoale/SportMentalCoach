import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

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
export const NON_MEANINGFUL_EVENTS = ['auth_sign_in', 'auth_sign_out', 'signup_completed'] as const;

export type UserRow = {
  id: number;
  name: string;
  roles: string;
  createdAt: string;
  events: number;
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
      count(e.id)::int as events,
      (count(e.id) filter (where e.event not in ('auth_sign_in','auth_sign_out','signup_completed')))::int as meaningful,
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
      meaningful: num(r.meaningful),
      activeDays: num(r.active_days),
      lastAt,
      live: lastAt ? now.getTime() - new Date(lastAt).getTime() <= 5 * 60_000 : false,
    };
  });

  const sevenDaysAgo = now.getTime() - 7 * 86_400_000;
  const activeInPeriod = users.filter((u) => u.events > 0);
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
export async function getUserTimeline(userId: number, limit = 150): Promise<{ name: string; roles: string; events: TimelineEvent[] } | null> {
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
  return {
    name: String(user.name),
    roles: String(user.roles || '—'),
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
