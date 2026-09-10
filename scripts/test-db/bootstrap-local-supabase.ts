/**
 * Applica lo schema applicativo a un Supabase locale già avviato
 * (`supabase start`, dentro `scripts/test-db/local-supabase/`).
 *
 * **Perché è diverso da `bootstrap.ts`.** Quello script ricostruisce
 * `auth.users` e `auth.uid()` a mano, perché il contenitore Postgres puro su
 * cui gira non ha nessuno dei due — servivano per i test di dominio e delle
 * rotte, che non fanno mai un login vero. Qui il login è vero: Supabase
 * locale porta GoTrue, uno schema `auth` reale, e un `auth.uid()` reale che
 * legge il JWT che GoTrue ha davvero firmato. Ricostruirli sarebbe un errore
 * doppio — inutile, e capace di nascondere un'incompatibilità vera fra le
 * migrazioni e lo schema Auth reale, che è esattamente ciò che questo giro di
 * collaudo deve verificare.
 *
 * Quindi questo script fa una cosa sola in più rispetto a un Postgres vuoto:
 * ricostruisce `rls_auto_enable()` / `ensure_rls`, che restano una
 * personalizzazione di questo progetto e non fanno parte dello stack
 * Supabase standard — né locale né gestito.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TEST_DATABASE_MARKER_VALUE } from '../../lib/core/test-env/test-database';
import { abort, connectToTestDatabase } from './connect';

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, 'lib/db/migrations');

type JournalEntry = { idx: number; tag: string };

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

const ENSURE_RLS_TRIGGER = `
drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.rls_auto_enable();
`;

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
  const { sql, description } = await connectToTestDatabase({ skipMarker: true });
  console.log(`\nSupabase locale: ${description}`);

  // La verifica che questo giro di collaudo deve fare per davvero: lo schema
  // auth è quello vero di GoTrue, non una ricostruzione.
  const [authCheck] = await sql<{ has_users: boolean; has_uid_fn: boolean }[]>`
    select
      exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users') as has_users,
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'uid') as has_uid_fn
  `;
  if (!authCheck.has_users || !authCheck.has_uid_fn) {
    throw new Error(
      'Lo schema auth non sembra quello reale di Supabase (auth.users o auth.uid() mancanti): questo script è pensato per un Supabase locale già avviato con `supabase start`, non per il contenitore Postgres nudo di scripts/test-db/bootstrap.ts.'
    );
  }
  console.log('Schema auth reale confermato: auth.users e auth.uid() esistono già (GoTrue).');

  if (reset) {
    // Solo lo schema pubblico: `auth`, `storage`, `realtime` restano gestiti
    // da Supabase e non vanno toccati.
    await sql.unsafe('drop schema if exists public cascade');
    await sql.unsafe('drop schema if exists app_private cascade');
    await sql.unsafe('create schema public');
    await sql.unsafe('grant usage on schema public to anon, authenticated, service_role');
    console.log('Schema pubblico ricreato da zero (auth/storage/realtime intatti).');
  }

  await sql.unsafe(RLS_AUTO_ENABLE);
  console.log("rls_auto_enable() riprodotta (personalizzazione del progetto, non standard Supabase).");

  /*
   * Il marcatore, in una tabella e non in un parametro di sessione.
   *
   * `ALTER DATABASE ... SET` richiede un privilegio che il ruolo `postgres`
   * di un Supabase locale non ha — deliberatamente: qui gira con gli stessi
   * permessi ridotti della produzione (`Create role, Create DB, Replication,
   * Bypass RLS`, non `Superuser`), non con quelli comodi di un container
   * Postgres nudo. Una riga, scritta dallo stesso ruolo che ha appena
   * applicato le migrazioni, dichiara lo stesso fatto con lo stesso peso.
   */
  await sql.unsafe(`
    create table if not exists public.kaipai_test_marker (value text not null);
    truncate public.kaipai_test_marker;
    insert into public.kaipai_test_marker (value) values ('${TEST_DATABASE_MARKER_VALUE}');
  `);
  console.log(`Marcatore scritto (tabella): ${TEST_DATABASE_MARKER_VALUE}`);

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
      await sql.unsafe(content);
    } catch (error) {
      throw new Error(
        `Migrazione ${entry.tag} fallita contro lo schema Supabase reale: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    await sql`insert into app_test_migrations (tag) values (${entry.tag})`;
    count += 1;
  }
  console.log(
    count > 0
      ? `Migrazioni applicate: ${count} su ${journal().length} — nessuna incompatibilità con lo schema Auth reale.`
      : 'Nessuna migrazione da applicare.'
  );

  await sql.unsafe(ENSURE_RLS_TRIGGER);
  console.log('Event trigger ensure_rls attivo.');

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
    throw new Error('Nessuna policy attiva: bootstrap considerato fallito.');
  }

  console.log('\n✔ Supabase locale pronto, con lo schema applicativo completo.\n');
  await sql.end({ timeout: 5 });
}

main().catch(abort);
