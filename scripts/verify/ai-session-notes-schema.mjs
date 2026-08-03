/**
 * Verifica in sola lettura che le migrazioni 0036 e 0037 siano applicate
 * correttamente al database puntato da POSTGRES_URL.
 *
 * Non esegue alcuna DDL e non scrive nulla: si limita a interrogare il
 * catalogo di sistema. Va lanciato dopo `drizzle-kit migrate`, su qualunque
 * ambiente, prima di rilasciare il codice che dipende da questo schema.
 */
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL non configurata.');
}

const sql = postgres(process.env.POSTGRES_URL, { prepare: false, max: 1 });
let failures = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  OK   ${label}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${label} ${detail}`);
}

try {
  const target = new URL(process.env.POSTGRES_URL);
  console.log(`target: ${target.hostname}:${target.port || 'default'}${target.pathname}\n`);

  console.log('0036 — session_ai_reports');
  const columns = (
    await sql`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'session_ai_reports'
        and column_name in ('report_kind', 'source_fingerprint')
    `
  ).map((row) => row.column_name);
  check('report_kind e source_fingerprint presenti', columns.length === 2, JSON.stringify(columns));

  const uniques = (
    await sql`
      select conname from pg_constraint
      where conrelid = 'public.session_ai_reports'::regclass and contype = 'u'
    `
  ).map((row) => row.conname);
  check(
    'unique (session, kind, version)',
    uniques.includes('session_ai_reports_session_kind_version_unique'),
    JSON.stringify(uniques)
  );
  check(
    'vecchia unique su session_ai_notes_id rimossa',
    !uniques.includes('session_ai_reports_session_ai_notes_id_key'),
    JSON.stringify(uniques)
  );

  const indexes = (
    await sql`
      select indexname from pg_indexes
      where schemaname = 'public' and tablename = 'session_ai_reports'
    `
  ).map((row) => row.indexname);
  check(
    'indice parziale una-bozza-aperta',
    indexes.includes('session_ai_reports_one_open_draft_idx'),
    JSON.stringify(indexes)
  );

  console.log('\n0037 — session_ai_commitments');
  const table = await sql`select to_regclass('public.session_ai_commitments') as present`;
  check('tabella creata', table[0].present !== null);

  if (table[0].present !== null) {
    const constraints = (
      await sql`
        select conname from pg_constraint
        where conrelid = 'public.session_ai_commitments'::regclass and contype = 'c'
      `
    ).map((row) => row.conname);
    for (const name of [
      'session_ai_commitments_owner_check',
      'session_ai_commitments_status_check',
      'session_ai_commitments_completed_check',
      'session_ai_commitments_timestamp_check',
    ]) {
      check(`check ${name}`, constraints.includes(name), JSON.stringify(constraints));
    }

    const rls = await sql`
      select relrowsecurity from pg_class
      where oid = 'public.session_ai_commitments'::regclass
    `;
    check('RLS abilitata', rls[0].relrowsecurity === true);

    const policies = await sql`
      select policyname, cmd from pg_policies
      where schemaname = 'public' and tablename = 'session_ai_commitments'
    `;
    check(
      'policy SELECT coach/admin/atleta-owner',
      policies.length === 1 &&
        policies[0].policyname === 'ai_commitments_select_coach_admin_or_owning_athlete' &&
        policies[0].cmd === 'SELECT',
      JSON.stringify(policies)
    );

    const trigger = (
      await sql`
        select tgname from pg_trigger
        where tgrelid = 'public.session_ai_commitments'::regclass and not tgisinternal
      `
    ).map((row) => row.tgname);
    check('trigger updateddate', trigger.includes('trg_set_updateddate'), JSON.stringify(trigger));
  }

  console.log('\nPrivilegi dei ruoli browser');
  const grants = await sql`
    select role_name, table_name,
      has_table_privilege(role_name, 'public.' || table_name,
        'INSERT,UPDATE,DELETE,TRUNCATE') as can_write
    from unnest(array['anon', 'authenticated']) as roles(role_name)
    cross join unnest(array['session_ai_reports', 'session_ai_commitments'])
      as tables(table_name)
  `;
  for (const grant of grants) {
    check(
      `${grant.role_name} su ${grant.table_name}: nessuna scrittura`,
      grant.can_write === false,
      `can_write=${grant.can_write}`
    );
  }

  const audit = await sql`
    select pg_get_constraintdef(oid) as def from pg_constraint
    where conname = 'session_ai_audit_events_type_check'
  `;
  check(
    'audit event types estesi',
    audit.length === 1 &&
      audit[0].def.includes('commitment_updated_by_athlete') &&
      audit[0].def.includes('compass_report_approved'),
    audit.length ? '' : 'constraint assente'
  );
} finally {
  await sql.end();
}

if (failures > 0) {
  console.log(`\nAI_SESSION_NOTES schema verification: ${failures} CONTROLLI FALLITI`);
  process.exit(1);
}
console.log('\nAI_SESSION_NOTES schema verification: OK');
