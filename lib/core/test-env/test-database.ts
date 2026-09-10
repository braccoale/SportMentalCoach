/**
 * Il cancello fra i test e la produzione.
 *
 * **Perché non basta il nome della variabile.** In questo repository
 * `.env.local`, la Preview e la Produzione puntano tutti allo stesso progetto
 * Supabase: non c'è nessun ambiente in cui sbagliare senza conseguenze. Un
 * modulo che si accontenti di leggere `TEST_DATABASE_URL` non prova niente —
 * quella variabile può contenere l'URL della produzione, e nessun errore lo
 * direbbe. Il codice che segue guarda **dove punta l'URL**, non come si chiama
 * la variabile che lo contiene.
 *
 * Il controllo ha due metà, e servono entrambe:
 *
 * 1. `assertTestDatabaseUrl` qui — statica, pura, verificabile senza rete:
 *    l'URL esiste, non coincide con quello di produzione, non ha l'aspetto di
 *    un servizio gestito, e il nome del database si riconosce come di prova.
 * 2. `TEST_DATABASE_MARKER_SETTING` — dinamica, e la applica chi si collega:
 *    il database deve dichiararsi di prova da sé. È l'unica metà che regge
 *    anche quando un giorno la produzione girerà su un host che somiglia a
 *    questo, e la sola che nessuno può soddisfare per sbaglio.
 *
 * Modulo puro: nessun `server-only`, nessun accesso alla rete. Deve poter
 * essere importato da uno script `node` tanto quanto dal codice del server.
 */

/**
 * L'impostazione che il database di prova porta scritta addosso.
 *
 * La imposta `scripts/test-db/bootstrap.mjs` con `ALTER DATABASE ... SET`, e
 * vale per ogni connessione a quel database. La produzione non ce l'ha e non
 * può acquisirla per caso: darsi questo nome è un atto deliberato.
 */
export const TEST_DATABASE_MARKER_SETTING = 'kaipai.environment';
export const TEST_DATABASE_MARKER_VALUE = 'test';

/**
 * Host che non possono ospitare un database di prova.
 *
 * Non è un elenco di sicurezza — è un elenco di **posti in cui in questo
 * progetto vive la produzione**. Serve a fermare l'errore più probabile:
 * copiare l'URL da `.env.local` dentro `TEST_DATABASE_URL` per far girare
 * subito un test.
 */
const MANAGED_HOST_FRAGMENTS = [
  'supabase.co',
  'supabase.com',
  'supabase.in',
  'neon.tech',
  'vercel-storage.com',
  'rds.amazonaws.com',
  'azure.com',
  'render.com',
];

export type TestDatabaseRejection =
  /** `TEST_DATABASE_URL` assente o vuota. */
  | 'MISSING'
  /** Non è un URL analizzabile. */
  | 'MALFORMED'
  /** Coincide con `POSTGRES_URL`: è la produzione, comunque si chiami. */
  | 'MATCHES_PRODUCTION'
  /** Punta a un servizio gestito: qui non ci vive un database usa e getta. */
  | 'MANAGED_HOST'
  /** Il nome del database non si riconosce come di prova. */
  | 'NOT_RECOGNIZABLE';

export class TestDatabaseError extends Error {
  constructor(
    public readonly code: TestDatabaseRejection,
    message: string
  ) {
    super(message);
    this.name = 'TestDatabaseError';
  }
}

const MESSAGES: Record<TestDatabaseRejection, string> = {
  MISSING:
    'TEST_DATABASE_URL non è configurata. I test di autorizzazione girano su un database dedicato, mai su quello dell’applicazione.',
  MALFORMED: 'TEST_DATABASE_URL non è un URL PostgreSQL valido.',
  MATCHES_PRODUCTION:
    'TEST_DATABASE_URL coincide con POSTGRES_URL. Sarebbe la produzione con un altro nome.',
  MANAGED_HOST:
    'TEST_DATABASE_URL punta a un servizio gestito. Il database di prova è locale e si può buttare via.',
  NOT_RECOGNIZABLE:
    'Il nome del database in TEST_DATABASE_URL non si riconosce come ambiente di prova: deve contenere «test».',
};

export type TestDatabaseEnvironment = {
  TEST_DATABASE_URL?: string;
  POSTGRES_URL?: string;
  /**
   * Scappatoia dichiarata, per un database di prova che non può chiamarsi
   * «test» — per esempio quando lo assegna un runner di integrazione continua.
   * Salta **solo** il controllo sul nome: non quello sull'uguaglianza con la
   * produzione, e non quello sull'host.
   */
  ALLOW_NONSTANDARD_TEST_DATABASE?: string;
};

/**
 * Restituisce l'URL, o lancia dicendo quale controllo non è passato.
 *
 * L'ordine dei controlli è quello della gravità: prima si esclude che sia la
 * produzione, poi che sia un servizio gestito, e solo per ultimo si guarda il
 * nome — che è il criterio più debole, e infatti è l'unico disattivabile.
 */
export function assertTestDatabaseUrl(
  environment: TestDatabaseEnvironment = process.env as TestDatabaseEnvironment
): string {
  const testUrl = environment.TEST_DATABASE_URL?.trim();
  if (!testUrl) throw reject('MISSING');

  const productionUrl = environment.POSTGRES_URL?.trim();
  if (productionUrl && normalize(testUrl) === normalize(productionUrl)) {
    throw reject('MATCHES_PRODUCTION');
  }

  let parsed: URL;
  try {
    parsed = new URL(testUrl);
  } catch {
    throw reject('MALFORMED');
  }
  if (!parsed.protocol.startsWith('postgres')) throw reject('MALFORMED');

  const host = parsed.hostname.toLowerCase();
  if (MANAGED_HOST_FRAGMENTS.some((fragment) => host.endsWith(fragment))) {
    throw reject('MANAGED_HOST');
  }

  const database = parsed.pathname.replace(/^\//, '').toLowerCase();
  if (!database) throw reject('MALFORMED');
  if (
    !database.includes('test') &&
    environment.ALLOW_NONSTANDARD_TEST_DATABASE !== 'true'
  ) {
    throw reject('NOT_RECOGNIZABLE');
  }

  return testUrl;
}

/**
 * Il database si è dichiarato di prova?
 *
 * Chi si collega legge `current_setting('kaipai.environment', true)` e passa
 * qui il risultato. `null` significa «l'impostazione non c'è»: è la risposta
 * che darebbe la produzione, ed è per questo che il valore assente non vale
 * come consenso.
 */
export function isTestDatabaseMarker(value: string | null | undefined): boolean {
  return value?.trim() === TEST_DATABASE_MARKER_VALUE;
}

/**
 * Una seconda forma dello stesso marcatore, per un caso che il primo non
 * copre.
 *
 * `ALTER DATABASE ... SET` richiede un privilegio che il ruolo `postgres` di
 * un Supabase locale **non ha**: quel ruolo è deliberatamente meno che
 * superuser, per somigliare a quello di produzione (`Create role, Create DB,
 * Replication, Bypass RLS` — non `Superuser`). Lì il marcatore non può vivere
 * in un parametro di sessione: vive in una riga, scritta da chi ha già
 * dimostrato di poter scrivere nello schema applicativo — che è esattamente
 * il privilegio che serve per aver potuto applicare le migrazioni.
 */
export const TEST_DATABASE_MARKER_TABLE = 'public.kaipai_test_marker';

export function isTestDatabaseMarkerRow(
  row: { value: string } | null | undefined
): boolean {
  return row?.value?.trim() === TEST_DATABASE_MARKER_VALUE;
}

/** Il messaggio da stampare quando il marcatore manca. */
export function markerRejectionMessage(actual: string | null | undefined): string {
  return `Il database raggiunto non si dichiara un ambiente di prova: ${TEST_DATABASE_MARKER_SETTING} vale ${
    actual?.trim() ? `«${actual.trim()}»` : 'niente'
  }. Esegui prima «npm run test:db:bootstrap».`;
}

/**
 * Nasconde la password prima di stampare un URL.
 *
 * Gli script dicono a quale database si sono collegati, ed è giusto che lo
 * dicano: è metà della prova che non stanno toccando la produzione. L'altra
 * metà è che quella riga non finisca in un registro con dentro una credenziale.
 */
export function describeDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(/^\//, '');
    return `${parsed.hostname}:${parsed.port || '5432'}/${database}`;
  } catch {
    return '(url non analizzabile)';
  }
}

function reject(code: TestDatabaseRejection): TestDatabaseError {
  return new TestDatabaseError(code, MESSAGES[code]);
}

/** Una barra finale o uno spazio non fanno di due URL uguali due database diversi. */
function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
