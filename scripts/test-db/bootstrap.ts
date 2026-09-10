/**
 * Costruisce da zero il database su cui girano i test di autorizzazione.
 *
 * **Perché non basta un Postgres vuoto.** Le policy di questo progetto sono
 * scritte per Supabase: parlano di `auth.uid()` e dei ruoli `anon`,
 * `authenticated`, `service_role`. Su un Postgres normale quelle policy non si
 * creano nemmeno, e la tentazione — disattivare RLS «tanto è un test» —
 * renderebbe i test una recita: passerebbero sempre, e non direbbero niente su
 * chi può leggere cosa in produzione.
 *
 * Quindi qui si **riproduce** ciò che serve, invece di spegnerlo: i tre ruoli
 * veri, e una `auth.uid()` che legge la stessa impostazione di sessione che
 * legge quella di Supabase (`request.jwt.claim.sub`). Le migrazioni vengono poi
 * applicate **così come sono**, senza toccarle: se una policy non regge qui,
 * non reggerebbe nemmeno là.
 *
 * Non usa `db:setup`, `db:seed` né `drizzle-kit`: nessuno dei tre sa a quale
 * database sta parlando, e tutti e tre leggono `POSTGRES_URL`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  TEST_DATABASE_MARKER_SETTING,
  TEST_DATABASE_MARKER_VALUE,
} from '../../lib/core/test-env/test-database';
import { abort, connectToTestDatabase } from './connect';

/** Gli script girano dalla radice del repository, via npm. */
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, 'lib/db/migrations');

type JournalEntry = { idx: number; tag: string };

/**
 * I ruoli e la funzione d'identità di Supabase, ricostruiti.
 *
 * `auth.uid()` è deliberatamente identica a quella gestita: legge
 * `request.jwt.claim.sub`, che è ciò che gli script di verifica impostano per
 * impersonare una persona. Se cambiasse la forma là, cambierebbe il
 * significato dei test qui, ed è il motivo per cui sta scritta e non dedotta.
 */
const SUPABASE_SHIM = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant anon, authenticated, service_role to current_user;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- La tabella delle identità, ridotta a ciò che lo schema referenzia davvero:
-- la migrazione 0020 aggancia \`public.users.auth_id\` a questa chiave, ed è
-- l'unica colonna che il progetto usa. Ricostruirla per intero significherebbe
-- inseguire lo schema di Supabase senza guadagnarci un solo controllo in più.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  -- Letta dalla migrazione 0055 per riconoscere gli account dimostrativi.
  raw_app_meta_data  jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
`;

/**
 * `public.rls_auto_enable()`, **ricostruita**.
 *
 * Questa funzione e il suo event trigger \`ensure_rls\` esistono in produzione
 * ma **non sono creati da nessuna migrazione**: sono stati aggiunti a mano nel
 * progetto Supabase. La migrazione 0058 li dà per esistenti — li irrigidisce
 * con \`ALTER FUNCTION ... SET search_path\` e \`REVOKE\` — e senza di loro la
 * catena non si applica su un database nuovo.
 *
 * Il corpo qui sotto è quindi una **ricostruzione**, non una copia: il
 * sorgente di produzione non sta nel repository. È scritta per essere
 * *almeno altrettanto severa* dell'originale, che è la direzione sicura in
 * cui sbagliare: se una tabella nuova funziona qui con RLS attiva d'ufficio,
 * funziona anche là.
 */
const RLS_AUTO_ENABLE = `
create or replace function public.rls_auto_enable() returns event_trigger
language plpgsql
as $fn$
declare
  command record;
begin
  for command in select * from pg_event_trigger_ddl_commands()
  loop
    if command.command_tag = 'CREATE TABLE'
       and command.schema_name = 'public'
    then
      execute format('alter table %s enable row level security', command.object_identity);
    end if;
  end loop;
end
$fn$;
`;

/**
 * L'event trigger si attacca **dopo** le migrazioni, non prima.
 *
 * In produzione è stato creato a catena già avviata, quindi le tabelle
 * anteriori non hanno ricevuto RLS d'ufficio. Attaccarlo qui prima delle
 * migrazioni darebbe un database più severo dell'originale su decine di
 * tabelle vecchie, e i conteggi non direbbero più niente di vero.
 */
const ENSURE_RLS_TRIGGER = `
drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.rls_auto_enable();
`;

/** Le migrazioni già applicate a questo database, per poterlo riprendere. */
const LEDGER = `
create table if not exists app_test_migrations (
  tag         text primary key,
  applied_at  timestamptz not null default now()
);
`;

function journal(): JournalEntry[] {
  const raw = readFileSync(path.join(MIGRATIONS, 'meta/_journal.json'), 'utf8');
  const parsed = JSON.parse(raw) as { entries: JournalEntry[] };
  return parsed.entries.slice().sort((a, b) => a.idx - b.idx);
}

async function main(): Promise<void> {
  const reset = process.argv.includes('--reset');

  // Il marcatore non c'è ancora al primo giro: è questo script a scriverlo.
  const { sql, description } = await connectToTestDatabase({ skipMarker: true });
  console.log(`\nDatabase di prova: ${description}`);

  const [{ current_database: database }] = await sql<{ current_database: string }[]>`
    select current_database()
  `;

  // Da qui in poi ogni sessione verso questo database si dichiara di prova.
  // `ALTER DATABASE ... SET` vale dalla connessione successiva, quindi il
  // controllo del marcatore lo faranno gli script che vengono dopo.
  await sql.unsafe(
    `alter database "${database}" set ${TEST_DATABASE_MARKER_SETTING} = '${TEST_DATABASE_MARKER_VALUE}'`
  );
  console.log(`Marcatore scritto: ${TEST_DATABASE_MARKER_SETTING} = ${TEST_DATABASE_MARKER_VALUE}`);

  if (reset) {
    // Solo lo schema pubblico: i ruoli sono a livello di cluster e ricrearli a
    // ogni giro non serve.
    await sql.unsafe('drop schema if exists public cascade');
    await sql.unsafe('drop schema if exists app_private cascade');
    // Anche `auth`: le sue tabelle sono parte della copia, e un `create table
    // if not exists` sopra una versione precedente lascerebbe uno schema
    // vecchio senza dirlo.
    await sql.unsafe('drop schema if exists auth cascade');
    await sql.unsafe('create schema public');
    console.log('Schema pubblico ricreato da zero.');
  }

  await sql.unsafe(SUPABASE_SHIM);
  await sql.unsafe(RLS_AUTO_ENABLE);
  console.log('Ruoli, auth.uid() e rls_auto_enable() riprodotti.');

  await sql.unsafe(LEDGER);
  const applied = new Set(
    (await sql<{ tag: string }[]>`select tag from app_test_migrations`).map((r) => r.tag)
  );

  let count = 0;
  for (const entry of journal()) {
    if (applied.has(entry.tag)) continue;
    const file = path.join(MIGRATIONS, `${entry.tag}.sql`);
    const content = readFileSync(file, 'utf8');
    try {
      // Il file intero in una volta: `--> statement-breakpoint` è un commento
      // SQL, e il protocollo semplice accetta più istruzioni per messaggio.
      await sql.unsafe(content);
    } catch (error) {
      throw new Error(
        `Migrazione ${entry.tag} fallita: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    await sql`insert into app_test_migrations (tag) values (${entry.tag})`;
    count += 1;
  }
  console.log(
    count > 0 ? `Migrazioni applicate: ${count}.` : 'Nessuna migrazione da applicare.'
  );

  await sql.unsafe(ENSURE_RLS_TRIGGER);
  console.log('Event trigger ensure_rls attivo (come in produzione, a catena conclusa).');

  const [{ tables }] = await sql<{ tables: number }[]>`
    select count(*)::int as tables
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `;
  const [{ policies }] = await sql<{ policies: number }[]>`
    select count(*)::int as policies from pg_policies where schemaname = 'public'
  `;
  const [{ rls }] = await sql<{ rls: number }[]>`
    select count(*)::int as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  `;

  console.log(`\nTabelle: ${tables} · Tabelle con RLS attiva: ${rls} · Policy: ${policies}`);
  if (rls === 0 || policies === 0) {
    throw new Error(
      'Nessuna policy attiva: un database senza RLS farebbe passare qualunque test. Bootstrap considerato fallito.'
    );
  }
  console.log('\n✔ Database di prova pronto.\n');

  await sql.end({ timeout: 5 });
}

main().catch(abort);
