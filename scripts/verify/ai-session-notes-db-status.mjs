import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local' });

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL is required');
}

const sql = postgres(process.env.POSTGRES_URL, {
  max: 1,
  prepare: false
});

try {
  const [identity] = await sql`
    select
      current_database() as database,
      current_user as db_user,
      inet_server_addr()::text as server_address,
      current_setting('server_version') as server_version
  `;
  const latestMigrations = await sql`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    order by created_at desc
    limit 5
  `;
  const existingPhase1Tables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'user_feature_entitlements',
        'session_ai_notes',
        'session_ai_consents',
        'session_transcript_segments',
        'session_ai_reports',
        'session_ai_audit_events',
        'session_participant_recordings',
        'session_audio_recordings',
        'session_ai_processing_jobs',
        'livekit_webhook_receipts'
      )
    order by table_name
  `;
  const auditColumns = await sql`
    select
      table_name,
      array_agg(column_name order by ordinal_position) as columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'user_feature_entitlements',
        'session_ai_notes',
        'session_ai_consents',
        'session_transcript_segments',
        'session_ai_reports',
        'session_ai_audit_events',
        'session_participant_recordings',
        'session_audio_recordings',
        'session_ai_processing_jobs',
        'livekit_webhook_receipts'
      )
      and column_name in (
        'createddate', 'createdby', 'updateddate', 'updatedby',
        'created_at', 'created_by', 'updated_at', 'updated_by'
      )
    group by table_name
    order by table_name
  `;
  const rlsStatus = await sql`
    select c.relname as table_name, c.relrowsecurity as rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'user_feature_entitlements',
        'session_ai_notes',
        'session_ai_consents',
        'session_transcript_segments',
        'session_ai_reports',
        'session_ai_audit_events',
        'session_participant_recordings',
        'session_audio_recordings',
        'session_ai_processing_jobs',
        'livekit_webhook_receipts'
      )
    order by c.relname
  `;
  const policies = await sql`
    select tablename, policyname, cmd, roles, qual
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'user_feature_entitlements',
        'session_ai_notes',
        'session_ai_consents',
        'session_transcript_segments',
        'session_ai_reports',
        'session_ai_audit_events',
        'session_participant_recordings',
        'session_audio_recordings',
        'session_ai_processing_jobs',
        'livekit_webhook_receipts'
      )
    order by tablename, policyname
  `;
  const triggers = await sql`
    select event_object_table as table_name, trigger_name
    from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table in (
        'user_feature_entitlements',
        'session_ai_notes',
        'session_ai_consents',
        'session_transcript_segments',
        'session_ai_reports',
        'session_ai_audit_events',
        'session_participant_recordings',
        'session_audio_recordings',
        'session_ai_processing_jobs',
        'livekit_webhook_receipts'
      )
    order by event_object_table
  `;
  const constraints = await sql`
    select
      c.relname as table_name,
      con.conname as constraint_name,
      con.contype as constraint_type
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'user_feature_entitlements',
        'session_ai_notes',
        'session_ai_consents',
        'session_transcript_segments',
        'session_ai_reports',
        'session_ai_audit_events',
        'session_participant_recordings',
        'session_audio_recordings',
        'session_ai_processing_jobs',
        'livekit_webhook_receipts'
      )
    order by c.relname, con.conname
  `;
  const indexes = await sql`
    select tablename, indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename in (
        'user_feature_entitlements',
        'session_ai_notes',
        'session_ai_consents',
        'session_transcript_segments',
        'session_ai_reports',
        'session_ai_audit_events',
        'session_participant_recordings',
        'session_audio_recordings',
        'session_ai_processing_jobs',
        'livekit_webhook_receipts'
      )
    order by tablename, indexname
  `;
  const grants = await sql`
    select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) as privileges
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated', 'service_role')
      and table_name in (
        'user_feature_entitlements',
        'session_ai_notes',
        'session_ai_consents',
        'session_transcript_segments',
        'session_ai_reports',
        'session_ai_audit_events',
        'session_participant_recordings',
        'session_audio_recordings',
        'session_ai_processing_jobs',
        'livekit_webhook_receipts'
      )
    group by grantee, table_name
    order by grantee, table_name
  `;
  const storagePolicies = await sql`
    select policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
    order by policyname
  `;

  const result = {
    identity,
    latestMigrations,
    existingPhase1Tables,
    auditColumns,
    rlsStatus,
    policies,
    triggers,
    constraints,
    indexes,
    grants,
    storagePolicies
  };

  if (process.argv.includes('--summary')) {
    const unsafeClientGrants = grants.filter(
      (grant) =>
        grant.grantee !== 'service_role' &&
        grant.privileges !== 'SELECT'
    );
    console.log(JSON.stringify({
      identity,
      latestMigration: latestMigrations[0],
      protectedTableCount: existingPhase1Tables.length,
      auditColumns,
      rlsEnabledCount: rlsStatus.filter((row) => row.rls_enabled).length,
      policyCount: policies.length,
      triggerCount: triggers.length,
      constraintCount: constraints.length,
      indexCount: indexes.length,
      unsafeClientGrants,
      grants,
      storagePolicies
    }, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await sql.end();
}
