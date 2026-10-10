import 'server-only';
import { createHash } from 'node:crypto';
import { after } from 'next/server';
import { headers as nextHeaders } from 'next/headers';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { pageViewsDaily, perfSamples, uiErrors, usageEvents, usageExcludedIps, users, visitorDays } from '@/lib/db/schema';
import { ttlMemo } from '@/lib/core/cache/ttl-memo';
import {
  type UsageEvent,
  type UsageOutcome,
  type UsageProps,
  clientIpFromHeaders,
  deviceClassFromUserAgent,
  isBotUserAgent,
  isExcludedIp,
  isPublicPageRoute,
  isUiErrorKind,
  normalizeIp,
  referrerKind,
  routeTemplate,
  sanitizeErrorCode,
  sanitizeMetric,
  sanitizeProps,
} from './catalog';

/**
 * Scrittura di «utilizzo, tempi ed errori».
 *
 * Regola che vale per ogni funzione di questo file: **non lancia mai**. Una
 * statistica che non si riesce a scrivere non deve rompere il gesto che stava
 * descrivendo (una prenotazione, un accesso): si ignora, si scrive una riga di
 * log e si va avanti — come fa `sendEmail` con le email.
 *
 * Seconda regola: **gli indirizzi esclusi non lasciano nessuna traccia.** Il
 * controllo sta qui, a monte di ogni scrittura, non nelle schermate che leggono:
 * un dato mai scritto non si può filtrare male dopo.
 */

const RELEASE = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
const OWN_HOSTS = ['kaipaicoaching.com', 'www.kaipaicoaching.com'];

/* ------------------------------ esclusioni ------------------------------ */

async function readExcludedIps(): Promise<string[]> {
  const rows = await db.select({ ip: usageExcludedIps.ip }).from(usageExcludedIps).orderBy(asc(usageExcludedIps.id));
  return rows.map((r) => r.ip);
}

let excludedMemo = ttlMemo(readExcludedIps, 60_000);

/** L'elenco degli indirizzi da non tracciare (ricordato un minuto: cambia di rado e si legge a ogni scrittura). */
export async function getExcludedIps(): Promise<string[]> {
  try {
    return await excludedMemo();
  } catch (error) {
    console.error('[usage] elenco esclusioni non letto', error instanceof Error ? error.message : error);
    return [];
  }
}

/** Dopo aver cambiato l'elenco, la modifica vale subito su questa istanza. */
export function resetExcludedIpsCache(): void {
  excludedMemo = ttlMemo(readExcludedIps, 60_000);
}

export async function addExcludedIp(rawIp: string, label: string | null, userId: number): Promise<boolean> {
  const ip = normalizeIp(rawIp);
  if (!ip) return false;
  await db
    .insert(usageExcludedIps)
    .values({ ip, label: label?.slice(0, 80) || null, createdBy: userId })
    .onConflictDoNothing({ target: usageExcludedIps.ip });
  resetExcludedIpsCache();
  return true;
}

export async function removeExcludedIp(id: number): Promise<void> {
  await db.delete(usageExcludedIps).where(eq(usageExcludedIps.id, id));
  resetExcludedIpsCache();
}

/* ------------------------------ contesto della richiesta ------------------------------ */

type HeaderReader = Pick<Headers, 'get'>;

/** Le intestazioni della richiesta in corso, o `null` fuori da una richiesta (un cron, un worker). */
async function currentHeaders(): Promise<HeaderReader | null> {
  try {
    return await nextHeaders();
  } catch {
    return null;
  }
}

async function shouldIgnore(h: HeaderReader | null): Promise<boolean> {
  if (!h) return false;
  if (isBotUserAgent(h.get('user-agent'))) return true;
  return isExcludedIp(clientIpFromHeaders((name) => h.get(name)), await getExcludedIps());
}

/* ------------------------------ eventi d'uso ------------------------------ */

export type UsageInput = {
  event: UsageEvent;
  userId?: number | null;
  role?: 'athlete' | 'coach' | 'admin' | 'club' | null;
  isDemo?: boolean;
  entityType?: string | null;
  entityId?: number | null;
  outcome?: UsageOutcome;
  props?: UsageProps;
};

async function writeUsage(input: UsageInput, h: HeaderReader | null): Promise<void> {
  try {
    if (await shouldIgnore(h)) return;
    await db.insert(usageEvents).values({
      userId: input.userId ?? null,
      role: input.role ?? null,
      isDemo: input.isDemo ?? false,
      event: input.event,
      entityType: input.entityType?.slice(0, 30) ?? null,
      entityId: input.entityId ?? null,
      outcome: input.outcome ?? 'ok',
      props: sanitizeProps(input.props) ?? null,
      source: h ? 'web' : 'server',
      deviceClass: deviceClassFromUserAgent(h?.get('user-agent')),
      release: RELEASE,
    });
  } catch (error) {
    console.error('[usage] evento non scritto', input.event, error instanceof Error ? error.message : error);
  }
}

/**
 * Registra un gesto che conta. Non rallenta e non rompe quello che sta
 * descrivendo: la scrittura parte dopo la risposta quando c'è una richiesta in
 * corso, subito altrimenti (cron, worker). Le intestazioni si leggono prima:
 * dentro `after` non sono disponibili.
 */
export async function trackUsage(input: UsageInput, request?: Request): Promise<void> {
  try {
    const h: HeaderReader | null = request ? request.headers : await currentHeaders();
    try {
      after(() => writeUsage(input, h));
    } catch {
      await writeUsage(input, h);
    }
  } catch (error) {
    console.error('[usage] tracciamento non avviato', error instanceof Error ? error.message : error);
  }
}

/**
 * L'accesso con un fornitore esterno (Google): si conosce solo l'identificativo
 * dell'accesso, quindi si cerca l'account. Se non c'è ancora (prima
 * registrazione) non si registra niente: la registrazione ha il suo evento.
 */
export async function trackSignInByAuthId(authId: string | undefined, method: string, request: Request): Promise<void> {
  if (!authId) return;
  try {
    const [row] = await db
      .select({ id: users.id, isDemo: users.isDemo })
      .from(users)
      .where(eq(users.authId, authId))
      .limit(1);
    if (!row) return;
    await trackUsage({ event: 'auth_sign_in', userId: row.id, isDemo: row.isDemo, props: { method } }, request);
  } catch (error) {
    console.error('[usage] accesso non registrato', error instanceof Error ? error.message : error);
  }
}

/* ------------------------------ raccolta dal browser ------------------------------ */

export type CollectPayload = {
  /** Il percorso della pagina (verrà ridotto a modello). */
  r?: unknown;
  /** Il referrer del documento, solo alla prima pagina della visita. */
  ref?: unknown;
  /** 1 se è una navigazione interna all'app. */
  n?: unknown;
  /** Conta una visita alla pagina. */
  pv?: unknown;
  /** Misure: [{ n: 'LCP', v: 1800 }]. */
  m?: unknown;
  /** Un errore visto dall'utente: { k, c, d }. */
  e?: unknown;
  /** Connessione dichiarata dal browser. */
  c?: unknown;
};

const CONNECTIONS = new Set(['slow-2g', '2g', '3g', '4g']);
const MAX_METRICS = 12;

const buckets = new Map<string, { count: number; resetAt: number }>();
function withinRateLimit(key: string, now = Date.now()): boolean {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 120) return false;
  current.count += 1;
  return true;
}

function dailyFingerprint(day: string, ip: string, ua: string): string | null {
  const secret = process.env.USAGE_HASH_SECRET ?? process.env.CRON_SECRET;
  if (!secret) return null;
  // Il segreto cambia ogni giorno: l'impronta di ieri non si ricollega a quella di oggi.
  const daily = createHash('sha256').update(`${secret}|${day}`).digest('hex');
  return createHash('sha256').update(`${daily}|${ip}|${ua}`).digest('hex').slice(0, 32);
}

async function countPageView(route: string, ref: unknown, internal: boolean, h: HeaderReader): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const ip = clientIpFromHeaders((name) => h.get(name));
  const ua = h.get('user-agent') ?? '';
  const kind = internal ? 'interno' : referrerKind(typeof ref === 'string' ? ref : null, OWN_HOSTS);
  const fingerprint = ip ? dailyFingerprint(day, ip, ua) : null;

  let isNewVisitor = 0;
  if (fingerprint) {
    const inserted = await db
      .insert(visitorDays)
      .values({ day, fingerprint })
      .onConflictDoNothing()
      .returning({ fingerprint: visitorDays.fingerprint });
    isNewVisitor = inserted.length > 0 ? 1 : 0;
  }
  await db
    .insert(pageViewsDaily)
    .values({ day, route, referrerKind: kind, views: 1, uniques: isNewVisitor })
    .onConflictDoUpdate({
      target: [pageViewsDaily.day, pageViewsDaily.route, pageViewsDaily.referrerKind],
      set: {
        views: sql`${pageViewsDaily.views} + 1`,
        uniques: sql`${pageViewsDaily.uniques} + ${isNewVisitor}`,
      },
    });
}

/**
 * Riceve ciò che il browser ha misurato. Risponde sempre 204: chi lo manda non
 * deve mai accorgersi di niente, e un errore qui non è un suo problema.
 */
export async function handleCollect(request: Request): Promise<Response> {
  const done = () => new Response(null, { status: 204 });
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== new URL(request.url).host) return done();
    const h = request.headers;
    if (await shouldIgnore(h)) return done();
    const ip = clientIpFromHeaders((name) => h.get(name)) ?? 'sconosciuto';
    if (!withinRateLimit(ip)) return done();

    const text = await request.text();
    if (text.length > 4096) return done();
    const body = JSON.parse(text) as CollectPayload;

    const route = routeTemplate(typeof body.r === 'string' ? body.r : '/');
    const deviceClass = deviceClassFromUserAgent(h.get('user-agent'));
    const connection = typeof body.c === 'string' && CONNECTIONS.has(body.c) ? body.c : null;

    if (body.pv === 1 && isPublicPageRoute(route)) {
      await countPageView(route, body.ref, body.n === 1, h);
    }

    if (Array.isArray(body.m)) {
      const rows = body.m
        .slice(0, MAX_METRICS)
        .map((item) => {
          const entry = item as { n?: unknown; v?: unknown };
          return sanitizeMetric(entry?.n, entry?.v);
        })
        .filter((x): x is { metric: string; value: number } => x !== null)
        .map((x) => ({ route, metric: x.metric, value: x.value, deviceClass, connection, release: RELEASE }));
      if (rows.length > 0) await db.insert(perfSamples).values(rows);
    }

    const err = body.e as { k?: unknown; c?: unknown; d?: unknown } | undefined;
    if (err && isUiErrorKind(err.k)) {
      await db.insert(uiErrors).values({
        route,
        kind: err.k,
        code: sanitizeErrorCode(err.c),
        digest: sanitizeErrorCode(err.d)?.slice(0, 40) ?? null,
        deviceClass,
        release: RELEASE,
      });
    }
  } catch (error) {
    console.error('[usage] raccolta non riuscita', error instanceof Error ? error.message : error);
  }
  return done();
}

/* ------------------------------ errori del server ------------------------------ */

type PlainHeaders = Record<string, string | string[] | undefined>;

/**
 * Un errore lanciato dal server mentre serviva una pagina, un'azione o una
 * rotta (lo chiama `instrumentation.ts`). Si registra il tipo, il percorso come
 * modello e l'identificativo di Next, mai il messaggio: può contenere dati. Chi
 * sta nell'elenco delle esclusioni non lascia traccia, come per tutto il resto.
 */
export async function recordServerError(
  error: { name?: string; digest?: string },
  request: { path: string; headers: PlainHeaders },
  context: { routePath?: string; routeType?: string }
): Promise<void> {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') headers.set(key, value);
      else if (Array.isArray(value) && value[0]) headers.set(key, value[0]);
    }
    if (await shouldIgnore(headers)) return;
    const route = routeTemplate(context.routePath || request.path);
    const code = sanitizeErrorCode(`${context.routeType ?? 'server'}:${error.name ?? 'Error'}`);
    await db.insert(uiErrors).values({
      route,
      kind: 'server',
      code,
      digest: sanitizeErrorCode(error.digest)?.slice(0, 40) ?? null,
      deviceClass: deviceClassFromUserAgent(headers.get('user-agent')),
      release: RELEASE,
    });
  } catch (cause) {
    console.error('[usage] errore del server non registrato', cause instanceof Error ? cause.message : cause);
  }
}

/* ------------------------------ pulizia ------------------------------ */

/** Cancella ciò che ha passato la sua scadenza. Restituisce quante righe ha tolto per tabella. */
export async function cleanupUsageData(now: Date = new Date()): Promise<Record<string, number>> {
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const day = (n: number) => daysAgo(n).toISOString().slice(0, 10);
  const events = await db.delete(usageEvents).where(sql`${usageEvents.occurredAt} < ${daysAgo(395)}`).returning({ id: usageEvents.id });
  const perf = await db.delete(perfSamples).where(sql`${perfSamples.occurredAt} < ${daysAgo(90)}`).returning({ id: perfSamples.id });
  const errors = await db.delete(uiErrors).where(sql`${uiErrors.occurredAt} < ${daysAgo(90)}`).returning({ id: uiErrors.id });
  const visitors = await db.delete(visitorDays).where(sql`${visitorDays.day} < ${day(2)}`).returning({ day: visitorDays.day });
  return { usage_events: events.length, perf_samples: perf.length, ui_errors: errors.length, visitor_days: visitors.length };
}
