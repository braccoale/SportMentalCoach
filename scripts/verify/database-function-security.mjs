import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL non configurata.');
}

const sql = postgres(process.env.POSTGRES_URL, {
  prepare: false,
  max: 1,
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const publicFunctionNames = [
  'set_updated_at',
  'set_updateddate',
  'notification_preference_default_types',
  'attach_audio_segment_to_participant_recording',
  'create_default_notification_preferences',
  'current_app_user_coaches_ai_session',
  'current_app_user_id',
  'current_app_user_is_admin',
  'current_app_user_participates_in_booking',
  'refresh_participant_recording_aggregate',
  'rls_auto_enable',
];

const privateFunctionNames = [
  'current_app_user_coaches_ai_session',
  'current_app_user_id',
  'current_app_user_is_admin',
  'current_app_user_participates_in_booking',
];

try {
  await sql.begin('read only', async (tx) => {
    await tx.unsafe("set local statement_timeout = '15s'");

    const functions = await tx`
      select
        n.nspname as schema,
        p.proname as name,
        pg_get_function_identity_arguments(p.oid) as arguments,
        p.prosecdef as security_definer,
        coalesce(array_to_string(p.proconfig, ', '), '') as config,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'public' and p.proname = any(${publicFunctionNames}))
         or (n.nspname = 'app_private' and p.proname = any(${privateFunctionNames}))
      order by schema, name, arguments
    `;

    const publicFunctions = functions.filter((fn) => fn.schema === 'public');
    const privateFunctions = functions.filter((fn) => fn.schema === 'app_private');

    assert(
      publicFunctions.length === publicFunctionNames.length,
      `Attese ${publicFunctionNames.length} funzioni public, trovate ${publicFunctions.length}.`
    );
    assert(
      privateFunctions.length === privateFunctionNames.length,
      `Attese ${privateFunctionNames.length} funzioni app_private, trovate ${privateFunctions.length}.`
    );

    for (const fn of publicFunctions) {
      assert(
        fn.config.includes('search_path=""'),
        `${fn.schema}.${fn.name} non ha search_path vuoto.`
      );
      assert(
        !fn.anon_execute && !fn.authenticated_execute && !fn.service_execute,
        `${fn.schema}.${fn.name} conserva EXECUTE per un ruolo API.`
      );
    }

    for (const fn of privateFunctions) {
      assert(fn.security_definer, `${fn.schema}.${fn.name} non e' SECURITY DEFINER.`);
      assert(
        fn.config.includes('search_path=""'),
        `${fn.schema}.${fn.name} non ha search_path vuoto.`
      );
      assert(!fn.anon_execute, `${fn.schema}.${fn.name} e' eseguibile da anon.`);
      assert(
        fn.authenticated_execute,
        `${fn.schema}.${fn.name} non e' eseguibile dalle policy authenticated.`
      );
      assert(
        !fn.service_execute,
        `${fn.schema}.${fn.name} concede EXECUTE diretto a service_role.`
      );
    }

    const [schemaPrivileges] = await tx`
      select
        has_schema_privilege('anon', 'app_private', 'USAGE') as anon_usage,
        has_schema_privilege('authenticated', 'app_private', 'USAGE') as authenticated_usage,
        has_schema_privilege('service_role', 'app_private', 'USAGE') as service_usage
    `;
    assert(!schemaPrivileges.anon_usage, 'anon ha USAGE sullo schema app_private.');
    assert(
      schemaPrivileges.authenticated_usage,
      'authenticated non ha USAGE sullo schema app_private.'
    );
    assert(
      !schemaPrivileges.service_usage,
      'service_role ha USAGE diretto sullo schema app_private.'
    );

    const policies = await tx`
      select schemaname, tablename, policyname, qual
      from pg_policies
      where coalesce(qual, '') like '%current_app_user_%'
      order by tablename, policyname
    `;
    assert(policies.length === 5, `Attese 5 policy helper, trovate ${policies.length}.`);
    for (const policy of policies) {
      assert(
        policy.qual.includes('app_private.current_app_user_'),
        `${policy.tablename}.${policy.policyname} non usa gli helper privati.`
      );
      assert(
        !policy.qual.includes('public.current_app_user_'),
        `${policy.tablename}.${policy.policyname} usa ancora un helper public.`
      );
    }

    const unsafeDefaults = await tx`
      select
        n.nspname as schema,
        case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee
      from pg_default_acl d
      join pg_namespace n on n.oid = d.defaclnamespace
      cross join lateral aclexplode(d.defaclacl) as acl
      where pg_get_userbyid(d.defaclrole) = 'postgres'
        and n.nspname in ('public', 'app_private')
        and d.defaclobjtype = 'f'
        and acl.privilege_type = 'EXECUTE'
        and (
          (n.nspname = 'public' and (
            acl.grantee = 0
            or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated')
          ))
          or (n.nspname = 'app_private' and (
            acl.grantee = 0
            or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated', 'service_role')
          ))
        )
    `;
    assert(
      unsafeDefaults.length === 0,
      'I default privileges concedono ancora EXECUTE a un ruolo API non autorizzato.'
    );

    const triggerFunctions = await tx`
      select p.proname as name, count(*)::int as trigger_count
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace n on n.oid = p.pronamespace
      where not t.tgisinternal
        and n.nspname = 'public'
        and p.proname in (
          'set_updated_at',
          'set_updateddate',
          'attach_audio_segment_to_participant_recording',
          'create_default_notification_preferences',
          'refresh_participant_recording_aggregate'
        )
      group by p.proname
    `;
    const attachedTriggerFunctions = new Set(
      triggerFunctions.filter((fn) => fn.trigger_count > 0).map((fn) => fn.name)
    );
    for (const name of [
      'set_updated_at',
      'set_updateddate',
      'attach_audio_segment_to_participant_recording',
      'create_default_notification_preferences',
      'refresh_participant_recording_aggregate',
    ]) {
      assert(attachedTriggerFunctions.has(name), `${name} non e' piu' collegata a un trigger.`);
    }

    const eventTriggers = await tx`
      select evtname, evtenabled
      from pg_event_trigger
      where evtfoid = 'public.rls_auto_enable()'::regprocedure
    `;
    assert(
      eventTriggers.length === 1 && eventTriggers[0].evtname === 'ensure_rls' &&
        eventTriggers[0].evtenabled !== 'D',
      'L’event trigger ensure_rls non e’ piu’ attivo.'
    );
  });
} finally {
  await sql.end();
}

console.log('DATABASE FUNCTION SECURITY verification: OK');
