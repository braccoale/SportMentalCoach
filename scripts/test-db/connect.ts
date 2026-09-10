/**
 * L'unico modo, in questo repository, in cui uno script si collega a un
 * database per provare qualcosa.
 *
 * Fa tre cose che nessuno script dovrebbe rifare per conto suo:
 *
 * 1. **Carica solo `.env.test.local`.** Non tocca `.env.local`, dove vive
 *    l'URL della produzione: se quel file non viene letto, nessuna svista
 *    successiva può usarne il contenuto. `POSTGRES_URL` viene letta a parte,
 *    dal file, **senza entrare in `process.env`**, e serve a una cosa sola:
 *    accorgersi che qualcuno l'ha copiata dentro `TEST_DATABASE_URL`.
 * 2. **Applica il cancello statico** di `assertTestDatabaseUrl`.
 * 3. **Chiede al database di dichiararsi.** È la parte che regge davvero: un
 *    URL può somigliare a quello che si vuole, ma solo un database preparato
 *    apposta risponde `test` a `current_setting('kaipai.environment')`.
 *
 * Se una delle tre fallisce lo script si interrompe. Non esiste un ripiego
 * sulla produzione, e non c'è nessun interruttore per aggiungerne uno.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import {
  assertTestDatabaseUrl,
  describeDatabaseUrl,
  isTestDatabaseMarker,
  isTestDatabaseMarkerRow,
  markerRejectionMessage,
  TEST_DATABASE_MARKER_SETTING,
} from '../../lib/core/test-env/test-database';

/** Gli script girano dalla radice del repository, via npm. */
const ROOT = process.cwd();

/** Legge una chiave da un file `.env` senza scriverla in `process.env`. */
function readEnvValue(file: string, key: string): string | undefined {
  let content: string;
  try {
    content = readFileSync(path.join(ROOT, file), 'utf8');
  } catch {
    return undefined;
  }
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1] !== key) continue;
    return match[2].replace(/^["']|["']$/g, '').trim();
  }
  return undefined;
}

/** Carica `.env.test.local` in `process.env`, e nient'altro. */
function loadTestEnvironment(): void {
  let content: string;
  try {
    content = readFileSync(path.join(ROOT, '.env.test.local'), 'utf8');
  } catch {
    return;
  }
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    if (process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}

export type TestConnection = {
  sql: postgres.Sql;
  url: string;
  /** Host, porta e database, senza credenziali: si può stampare. */
  description: string;
};

/**
 * Si collega al database di prova, oppure interrompe.
 *
 * `skipMarker` esiste per il solo bootstrap, che il marcatore deve ancora
 * scriverlo. Ogni altro chiamante lo lascia stare: usarlo altrove
 * significherebbe rinunciare all'unico controllo che guarda il database vero.
 */
export async function connectToTestDatabase(
  options: { skipMarker?: boolean } = {}
): Promise<TestConnection> {
  loadTestEnvironment();

  const url = assertTestDatabaseUrl({
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    // Dal file, non dall'ambiente: così non resta caricata da nessuna parte.
    POSTGRES_URL: readEnvValue('.env.local', 'POSTGRES_URL') ?? process.env.POSTGRES_URL,
    ALLOW_NONSTANDARD_TEST_DATABASE: process.env.ALLOW_NONSTANDARD_TEST_DATABASE,
  });

  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

  if (!options.skipMarker) {
    const [row] = await sql<{ marker: string | null }[]>`
      select current_setting(${TEST_DATABASE_MARKER_SETTING}, true) as marker
    `;
    const guc = isTestDatabaseMarker(row?.marker);

    // La seconda forma: una riga, non un parametro di sessione. Il ruolo
    // `postgres` di un Supabase locale non può impostare il primo — vedi il
    // commento su `isTestDatabaseMarkerRow` — quindi qui si guarda anche la
    // tabella, quando esiste. Una tabella assente non è un errore: è la
    // risposta di qualunque database che non ha ancora ricevuto il bootstrap.
    let table = false;
    try {
      const [tableRow] = await sql<{ value: string }[]>`
        select value from public.kaipai_test_marker limit 1
      `;
      table = isTestDatabaseMarkerRow(tableRow);
    } catch {
      table = false;
    }

    if (!guc && !table) {
      await sql.end({ timeout: 5 });
      throw new Error(markerRejectionMessage(row?.marker ?? null));
    }
  }

  return { sql, url, description: describeDatabaseUrl(url) };
}

/** Interrompe lo script stampando il motivo, senza traccia dello stack. */
export function abort(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}
