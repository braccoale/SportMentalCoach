/**
 * Le due cose che il cancello deve rifiutare — provate per davvero, senza
 * avvicinarsi a un database di produzione.
 *
 * **Perché non con un client finto.** Un primo tentativo sostituiva il
 * pacchetto `postgres` con un mock: non ha retto — `mock.module` su un
 * pacchetto di terze parti, sotto il loader di tsx, non intercetta in modo
 * affidabile la risoluzione di un import bare come `import postgres from
 * 'postgres'`. Anziché inseguire quella combinazione, questo script usa
 * **codice vero contro infrastruttura vera**, ma sempre dentro il contenitore
 * Docker locale, mai fuori:
 *
 * 1. un secondo database, usa e getta, nello stesso contenitore del database
 *    di prova — mai marcato — per dimostrare che il cancello lo rifiuta;
 * 2. `.env` e `.env.local` spostati fuori dalla cartella (stesso metodo,
 *    stessa garanzia di ripristino, di `isolated-build.sh`) e sostituiti con
 *    un `.env.local` civetta, per dimostrare che `connectToTestDatabase` non
 *    lo legge mai in `process.env`.
 *
 * Nessuna delle due tocca `POSTGRES_URL` o un progetto Supabase reale.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { assertTestDatabaseUrl } from '../../lib/core/test-env/test-database';

let checks = 0;
let failures = 0;

function check(condition: boolean, label: string): void {
  checks += 1;
  if (condition) {
    console.log(`  ✔ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✖ ${label}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');
const ENV_LOCAL_PATH = path.join(ROOT, '.env.local');
const ENV_BAK = path.join(ROOT, '.env.negativecheck.bak');
const ENV_LOCAL_BAK = path.join(ROOT, '.env.local.negativecheck.bak');

async function main(): Promise<void> {
  section('Il codice, letto invece che eseguito');

  const connectSource = readFileSync(
    path.join(ROOT, 'scripts/test-db/connect.ts'),
    'utf8'
  );
  check(
    !/dotenv\.config\(\s*\)/.test(connectSource),
    'nessun `dotenv.config()` senza percorso: quello leggerebbe `.env` di default'
  );
  check(
    /loadTestEnvironment[\s\S]{0,300}readFileSync\(path\.join\(ROOT, '\.env\.test\.local'\)/.test(
      connectSource
    ),
    'l’unico file caricato in `process.env` è `.env.test.local`'
  );
  check(
    connectSource.includes("readEnvValue('.env.local', 'POSTGRES_URL')") &&
      !/process\.env\[[^\]]*\]\s*=\s*readEnvValue\('\.env\.local'/.test(connectSource),
    '`.env.local` viene letto solo per il confronto, mai scritto in `process.env`'
  );

  section('Un database reale, nello stesso contenitore, mai marcato');

  const baseUrl = assertTestDatabaseUrl({
    TEST_DATABASE_URL: readTestDatabaseUrl(),
  });
  const adminUrl = new URL(baseUrl);
  adminUrl.pathname = '/postgres'; // il database di sistema, per crearne uno nuovo

  const throwawayName = `kaipai_test_unmarked_${Date.now().toString(36)}`;
  const admin = postgres(adminUrl.toString(), { prepare: false, max: 1 });
  try {
    await admin.unsafe(`drop database if exists "${throwawayName}"`);
    await admin.unsafe(`create database "${throwawayName}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  const throwawayUrl = new URL(baseUrl);
  throwawayUrl.pathname = `/${throwawayName}`;

  // Nessun `ALTER DATABASE ... SET kaipai.environment = 'test'` qui: è
  // esattamente il database che il bootstrap non ha mai visto.
  const previousTestUrl = process.env.TEST_DATABASE_URL;
  const previousPostgresUrl = process.env.POSTGRES_URL;
  process.env.TEST_DATABASE_URL = throwawayUrl.toString();
  delete process.env.POSTGRES_URL;

  let rejected: string | null = null;
  try {
    const { connectToTestDatabase } = await import('./connect');
    await connectToTestDatabase();
  } catch (error) {
    rejected = error instanceof Error ? error.message : String(error);
  } finally {
    process.env.TEST_DATABASE_URL = previousTestUrl;
    if (previousPostgresUrl !== undefined) process.env.POSTGRES_URL = previousPostgresUrl;
  }
  check(
    rejected !== null && /non si dichiara un ambiente di prova/.test(rejected),
    'un database reale, ma senza il marcatore, interrompe lo script'
  );

  const cleanup = postgres(adminUrl.toString(), { prepare: false, max: 1 });
  try {
    await cleanup.unsafe(`drop database if exists "${throwawayName}"`);
  } finally {
    await cleanup.end({ timeout: 5 });
  }
  console.log(`  (database usa e getta «${throwawayName}» ripulito)`);

  section('.env.local non viene mai caricato');

  const hashEnv = existsSync(ENV_PATH) ? sha256(ENV_PATH) : null;
  const hashEnvLocal = existsSync(ENV_LOCAL_PATH) ? sha256(ENV_LOCAL_PATH) : null;

  if (existsSync(ENV_PATH)) renameSync(ENV_PATH, ENV_BAK);
  if (existsSync(ENV_LOCAL_PATH)) renameSync(ENV_LOCAL_PATH, ENV_LOCAL_BAK);

  let dynamicCheckPassed = false;
  let dynamicCheckError: string | null = null;
  try {
    // Una civetta: se `connect.ts` la leggesse in `process.env`, questo test
    // lo scoprirebbe subito, perché quel valore non assomiglia a niente che
    // il resto dello script si aspetti.
    writeFileSync(
      ENV_LOCAL_PATH,
      'POSTGRES_URL="postgres://civetta-produzione-mai-letta/invalid"\n'
    );

    delete process.env.POSTGRES_URL;
    const wasSet = 'POSTGRES_URL' in process.env;
    process.env.TEST_DATABASE_URL = baseUrl;

    const { connectToTestDatabase: connectFresh } = await import(
      `./connect?probe=${Date.now()}`
    );
    const connection = await connectFresh();
    await connection.sql.end({ timeout: 5 });

    dynamicCheckPassed =
      !wasSet &&
      !('POSTGRES_URL' in process.env) &&
      connection.url === baseUrl;
  } catch (error) {
    dynamicCheckError = error instanceof Error ? error.message : String(error);
  } finally {
    if (existsSync(ENV_LOCAL_PATH)) unlinkSync(ENV_LOCAL_PATH);
    if (existsSync(ENV_BAK)) renameSync(ENV_BAK, ENV_PATH);
    if (existsSync(ENV_LOCAL_BAK)) renameSync(ENV_LOCAL_BAK, ENV_LOCAL_PATH);
  }

  check(
    dynamicCheckPassed,
    dynamicCheckError
      ? `il file civetta ha causato un errore inatteso: ${dynamicCheckError}`
      : 'con un «.env.local» civetta presente, la connessione riesce comunque verso il database di prova indicato esplicitamente, e `POSTGRES_URL` resta non impostata'
  );

  const restoredHashEnv = existsSync(ENV_PATH) ? sha256(ENV_PATH) : null;
  const restoredHashEnvLocal = existsSync(ENV_LOCAL_PATH) ? sha256(ENV_LOCAL_PATH) : null;
  check(
    restoredHashEnv === hashEnv && restoredHashEnvLocal === hashEnvLocal,
    '`.env` e `.env.local` sono tornati esattamente come prima (hash invariato)'
  );

  console.log(
    `\n${failures === 0 ? '✔' : '✖'} ${checks - failures}/${checks} verifiche superate.\n`
  );
  if (failures > 0) process.exit(1);
}

function readTestDatabaseUrl(): string | undefined {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  try {
    const content = readFileSync(path.join(ROOT, '.env.test.local'), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*TEST_DATABASE_URL\s*=\s*(.*)\s*$/);
      if (match) return match[1].replace(/^["']|["']$/g, '').trim();
    }
  } catch {
    // niente da leggere: assertTestDatabaseUrl darà il suo errore, giusto
    return undefined;
  }
  return undefined;
}

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

main().catch((error) => {
  // Prima di uscire, tenta comunque il ripristino: un errore a metà script
  // non deve lasciare `.env`/`.env.local` spostati.
  if (existsSync(ENV_BAK)) renameSync(ENV_BAK, ENV_PATH);
  if (existsSync(ENV_LOCAL_BAK)) renameSync(ENV_LOCAL_BAK, ENV_LOCAL_PATH);
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
