/**
 * Le regole pure di «utilizzo, tempi ed errori»: quali eventi esistono, come si
 * riconosce un percorso, un dispositivo, un robot, una provenienza, e quando un
 * indirizzo va ignorato.
 *
 * Modulo puro, senza `server-only` e senza accesso al database: lo leggono il
 * server che scrive, il browser che misura e i test. Le decisioni stanno qui
 * perché i test le provino senza rete.
 *
 * Due regole che governano tutto il resto:
 * - **Si registra ciò che serve a capire l'uso, non chi è la persona.** Mai
 *   un IP, mai un testo libero (può contenere un nome), mai un indirizzo con un
 *   identificativo dentro: i percorsi si salvano come modello (`/coaches/:slug`).
 * - **Il traffico dell'amministratore è rumore di fondo.** Un indirizzo
 *   nell'elenco delle esclusioni non lascia nessuna traccia, di nessun tipo.
 */

/** Gli eventi d'uso. L'elenco è chiuso: un evento che non c'è qui non si scrive. */
export const USAGE_EVENTS = [
  // Accesso
  'auth_sign_in',
  'auth_sign_out',
  'signup_completed',
  'demo_opened',
  // Guida di benvenuto e profilo del coach
  'onboarding_step_completed',
  'onboarding_completed',
  'coach_profile_submitted',
  'coach_profile_approved',
  'coach_profile_rejected',
  // Prenotazioni
  'booking_requested',
  'booking_accepted',
  'booking_declined',
  'booking_cancelled',
  'booking_completed',
  // Navigazione di chi ha un account (solo adulti, mai gli amministratori)
  'page_view',
  // Sedute
  'session_joined',
  // Contenuti e funzioni
  'coach_video_published',
  'coach_match_used',
  'review_left',
] as const;

export type UsageEvent = (typeof USAGE_EVENTS)[number];

export const USAGE_OUTCOMES = ['ok', 'denied', 'error'] as const;
export type UsageOutcome = (typeof USAGE_OUTCOMES)[number];

export function isUsageEvent(value: unknown): value is UsageEvent {
  return typeof value === 'string' && (USAGE_EVENTS as readonly string[]).includes(value);
}

export type UsageProps = Record<string, string | number | boolean>;

const MAX_PROP_KEYS = 8;
const MAX_PROP_KEY_LENGTH = 30;
const MAX_PROP_STRING_LENGTH = 60;

/**
 * I dettagli di un evento, ripuliti: al massimo otto voci, chiavi corte, valori
 * semplici e brevi. Un valore che non rispetta il formato si scarta, non si
 * tronca a metà: meglio una voce in meno che una voce tagliata che sembra vera.
 */
export function sanitizeProps(input: unknown): UsageProps | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: UsageProps = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_PROP_KEYS) break;
    if (!/^[a-z][a-z0-9_]*$/i.test(key) || key.length > MAX_PROP_KEY_LENGTH) continue;
    if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'string' && value.length > 0 && value.length <= MAX_PROP_STRING_LENGTH) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/* ------------------------------ percorsi ------------------------------ */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dopo questi segmenti, il successivo è un valore e non una pagina. */
const DYNAMIC_AFTER: Record<string, string> = {
  coaches: ':slug',
  blog: ':slug',
  'mental-coach': ':sport',
  invita: ':code',
  video: ':room',
  tutore: ':token',
  invito: ':code',
};

/** Pagine fisse che stanno sotto uno di quei segmenti e non vanno scambiate per un valore. */
const STATIC_CHILDREN = new Set(['aiutami-a-scegliere']);

const MAX_ROUTE_LENGTH = 120;

/**
 * Il percorso come modello: `/coaches/mario-rossi` → `/coaches/:slug`,
 * `/dashboard/coach/athletes/42` → `/dashboard/coach/athletes/:id`. Così non
 * finisce mai nei dati un nome o un numero che identifica una persona, e le
 * misure di pagine dello stesso tipo si sommano.
 */
export function routeTemplate(input: string | null | undefined): string {
  if (!input) return '/';
  const path = input.split('#')[0].split('?')[0] || '/';
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  const out: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const parent = i > 0 ? segments[i - 1] : null;
    if (/^\d+$/.test(segment) || UUID.test(segment)) {
      out.push(':id');
    } else if (parent && DYNAMIC_AFTER[parent] && !STATIC_CHILDREN.has(segment) && out[out.length - 1] === parent) {
      out.push(DYNAMIC_AFTER[parent]);
    } else {
      out.push(segment.toLowerCase());
    }
  }
  return `/${out.join('/')}`.slice(0, MAX_ROUTE_LENGTH);
}

/** Dove non si registra la navigazione di una persona: interfacce tecniche e pagine dell'amministrazione. */
const UNTRACKED_PREFIXES = ['/api', '/auth', '/_next', '/dashboard/admin', '/qa', '/video'];

export function isTrackablePageRoute(template: string): boolean {
  return !UNTRACKED_PREFIXES.some((prefix) => template === prefix || template.startsWith(`${prefix}/`));
}

/**
 * Di chi si registra la navigazione. Mai di un amministratore (guarda il sito,
 * non lo usa) e mai di chi è minorenne o di cui non si conosce l'età: per i
 * ragazzi bastano i gesti. Chi non ha un profilo atleta (un coach) conta come
 * adulto: si registra solo da maggiorenne.
 */
export function isNavigationTrackedFor(input: { isAdmin: boolean; hasAthleteProfile: boolean; age: number | null }): boolean {
  if (input.isAdmin) return false;
  if (!input.hasAthleteProfile) return true;
  return input.age !== null && input.age >= 18;
}

/** I nomi che l'amministratore legge al posto dei percorsi. Un percorso che non c'è qui si mostra com'è. */
const PAGE_LABELS: Record<string, string> = {
  '/': 'Home',
  '/coaches': 'Elenco coach',
  '/coaches/:slug': 'Scheda di un coach',
  '/coaches/aiutami-a-scegliere': 'Aiutami a scegliere',
  '/dashboard': 'Dashboard',
  '/dashboard/athlete': 'Dashboard atleta',
  '/dashboard/coach': 'Dashboard coach',
  '/dashboard/coach/calendar': 'Calendario (coach)',
  '/dashboard/coach/profile': 'Profilo (coach)',
  '/dashboard/coach/services': 'Disponibilità (coach)',
  '/dashboard/coach/pagamenti': 'Pagamenti (coach)',
  '/dashboard/coach/athletes': 'I miei atleti',
  '/dashboard/coach/athletes/:id': 'Scheda di un atleta',
  '/dashboard/coach/academy': 'Academy (coach)',
  '/dashboard/coach/messages': 'Messaggi (coach)',
  '/dashboard/coach/appunti-ai': 'Appunti AI',
  '/dashboard/coach/security': 'Sicurezza (coach)',
  '/dashboard/athlete/calendar': 'Calendario (atleta)',
  '/dashboard/messages': 'Messaggi',
  '/dashboard/supporto': 'Supporto',
  '/dashboard/settings': 'Impostazioni',
  '/dashboard/appointments/:id': 'Dettaglio appuntamento',
  '/onboarding': 'Guida di benvenuto',
  '/blog': 'Blog',
  '/blog/:slug': 'Articolo del blog',
  '/mental-coach/:sport': 'Pagina di uno sport',
};

export function pageLabel(route: string): string {
  return PAGE_LABELS[route] ?? route;
}

/** Le pagine pubbliche di cui si contano le visite (le altre stanno dietro l'accesso e non servono). */
const PUBLIC_ROUTES = new Set([
  '/',
  '/coaches',
  '/coaches/:slug',
  '/coaches/aiutami-a-scegliere',
  '/famiglie',
  '/atleti',
  '/academy',
  '/diventa-coach',
  '/societa',
  '/chi-siamo',
  '/blog',
  '/blog/:slug',
  '/mental-coach/:sport',
  '/invita/:code',
  '/privacy',
  '/terms',
  '/cookie',
]);

export function isPublicPageRoute(template: string): boolean {
  return PUBLIC_ROUTES.has(template);
}

/* ------------------------------ dispositivo ------------------------------ */

export type DeviceClass = 'mobile' | 'tablet' | 'desktop';

/** La classe del dispositivo dallo user agent; `null` se manca. */
export function deviceClassFromUserAgent(ua: string | null | undefined): DeviceClass | null {
  if (!ua) return null;
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|windows phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** Robot, anteprime dei social e strumenti automatici: non sono persone e non si contano. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|whatsapp|preview|monitor|uptime|curl|wget|python-requests|node-fetch|axios|vercel-screenshot/i.test(
    ua
  );
}

/* ------------------------------ provenienza ------------------------------ */

export type ReferrerKind = 'diretto' | 'ricerca' | 'social' | 'altro' | 'interno';

const SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|qwant|yandex|baidu)\./i;
const SOCIAL_HOSTS =
  /(^|\.)(facebook|instagram|linkedin|twitter|x|t|youtube|tiktok|whatsapp|telegram|reddit|pinterest)\.(com|me|co)$|(^|\.)(lnkd\.in|fb\.me|l\.facebook\.com|t\.co)$/i;

/**
 * Da dove arriva una visita, in cinque categorie. L'indirizzo di provenienza
 * non si conserva: si tiene soltanto la categoria.
 */
export function referrerKind(referrer: string | null | undefined, ownHosts: string[]): ReferrerKind {
  if (!referrer) return 'diretto';
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return 'diretto';
  }
  if (ownHosts.some((own) => host === own || host.endsWith(`.${own}`))) return 'interno';
  if (SEARCH_HOSTS.test(host)) return 'ricerca';
  if (SOCIAL_HOSTS.test(host)) return 'social';
  return 'altro';
}

/* ------------------------------ esclusioni ------------------------------ */

/**
 * L'indirizzo in forma confrontabile. Gli IPv4 restano com'erano (anche quelli
 * mappati dentro un IPv6); un IPv6 si riduce ai primi quattro gruppi, cioè alla
 * rete (/64): i dispositivi cambiano di continuo la parte finale per riservatezza
 * e un confronto sull'indirizzo intero non riconoscerebbe mai la stessa persona.
 */
export function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  let value = ip.trim().toLowerCase();
  if (!value) return null;
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) value = mapped[1];
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    const ok = value.split('.').every((part) => Number(part) <= 255);
    return ok ? value : null;
  }
  if (value.includes(':') && /^[0-9a-f:]+$/.test(value)) {
    const expanded = expandIpv6(value);
    return expanded ? expanded.slice(0, 4).join(':') : null;
  }
  return null;
}

function expandIpv6(value: string): string[] | null {
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = halves.length === 1 ? head : [...head, ...Array(missing).fill('0'), ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.replace(/^0+(?=.)/, ''));
}

/** Il primo indirizzo di `x-forwarded-for` (quello del visitatore, non dei server in mezzo). */
export function clientIpFromHeaders(get: (name: string) => string | null | undefined): string | null {
  const forwarded = get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return normalizeIp(first || get('x-real-ip'));
}

/** Vero se l'indirizzo è fra quelli da non tracciare. */
export function isExcludedIp(ip: string | null | undefined, excluded: readonly string[]): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  return excluded.some((entry) => normalizeIp(entry) === normalized);
}

/* ------------------------------ misure dei tempi ------------------------------ */

/** Le misure che accettiamo dal browser, con il massimo credibile: oltre è un errore o un abuso. */
export const VITAL_LIMITS: Record<string, { max: number }> = {
  LCP: { max: 120_000 },
  INP: { max: 60_000 },
  CLS: { max: 10 },
  TTFB: { max: 120_000 },
  FCP: { max: 120_000 },
};

/** I tempi «pronto» di una finestra precisa, misurati dal codice (per esempio `ready:booking_dialog`). */
export const READY_METRIC = /^ready:[a-z0-9_]{1,16}$/;

export function sanitizeMetric(name: unknown, value: unknown): { metric: string; value: number } | null {
  if (typeof name !== 'string' || typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const limit = VITAL_LIMITS[name];
  if (limit) return value <= limit.max ? { metric: name, value } : null;
  if (READY_METRIC.test(name)) return value <= 120_000 ? { metric: name, value } : null;
  return null;
}

export type VitalRating = 'good' | 'needs-improvement' | 'poor';

/** Le soglie pubbliche di Google (Core Web Vitals) per giudicare un valore: [buono fino a, scarso oltre]. */
const THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  TTFB: [800, 1800],
  FCP: [1800, 3000],
};

/** Una finestra «pronta» entro un secondo è buona; oltre tre secondi si fa attendere troppo. */
const READY_THRESHOLDS: [number, number] = [1000, 3000];

export function thresholdsFor(metric: string): [number, number] | null {
  if (READY_METRIC.test(metric)) return READY_THRESHOLDS;
  return THRESHOLDS[metric] ?? null;
}

export function rateVital(metric: string, value: number): VitalRating | null {
  const t = thresholdsFor(metric);
  if (!t) return null;
  if (value <= t[0]) return 'good';
  if (value <= t[1]) return 'needs-improvement';
  return 'poor';
}

/* ------------------------------ errori visti dall'utente ------------------------------ */

/** `server` è un errore lanciato dal server (lo registra `instrumentation.ts`): chi lo ha visto ha trovato una pagina rotta. */
export const UI_ERROR_KINDS = ['offline', 'caricamento', 'applicazione', 'azione', 'rete', 'server'] as const;
export type UiErrorKind = (typeof UI_ERROR_KINDS)[number];

export function isUiErrorKind(value: unknown): value is UiErrorKind {
  return typeof value === 'string' && (UI_ERROR_KINDS as readonly string[]).includes(value);
}

/** Un codice di errore breve e senza spazi: il nome dell'errore o la chiave di un messaggio, mai il testo. */
export function sanitizeErrorCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_.:-]{1,60}$/.test(trimmed) ? trimmed : null;
}
