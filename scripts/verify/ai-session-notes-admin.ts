import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL non configurata.');
  }

  const raw = postgres(process.env.POSTGRES_URL, {
    prepare: false,
    max: 1,
  });
  const startedAt = new Date();
  let actorUserId: number | null = null;
  let targetUserId: number | null = null;
  let entitlementId: number | null = null;

  const {
    FEATURE_CODES,
    getFeatureAccess,
    getFeatureAdminUsers,
    revokeFeatureEntitlement,
    setFeatureEntitlement,
  } = await import('../../lib/core/features/index');
  const { createProductionAiSessionNotesDependencies } = await import(
    '../../lib/core/ai-session-notes/dependencies'
  );
  const { client } = await import('../../lib/db/drizzle');
  const dependencies = createProductionAiSessionNotesDependencies();

  try {
    const [admin] = await raw`
      select u.id
      from public.users u
      join public.user_roles ur on ur.user_id = u.id
      where ur.role_key = 'admin'
        and u.deleted_at is null
      order by u.id
      limit 1
    `;
    assert.ok(admin, 'Serve un amministratore per la verifica.');
    const adminId = Number(admin.id);
    actorUserId = adminId;

    const [target] = await raw`
      select u.id
      from public.users u
      where u.deleted_at is null
        -- I conti demo non compaiono piu' nella proiezione admin
        -- (lib/core/features/index.ts): sceglierne uno come bersaglio farebbe
        -- fallire l'asserzione «la ricerca admin trova il target» per il
        -- motivo sbagliato.
        and u.is_demo = false
        and u.id <> ${adminId}
        and not exists (
          select 1 from public.user_roles ur
          where ur.user_id = u.id
            and ur.role_key = 'admin'
        )
        and not exists (
          select 1 from public.user_feature_entitlements ufe
          where ufe.user_id = u.id
            and ufe.feature_code = 'AI_SESSION_NOTES'
        )
      order by u.id
      limit 1
    `;
    assert.ok(target, 'Serve un utente senza entitlement per la verifica.');
    const targetId = Number(target.id);
    targetUserId = targetId;

    await assert.rejects(
      () =>
        getFeatureAdminUsers(
          targetId,
          FEATURE_CODES.AI_SESSION_NOTES
        ),
      /FORBIDDEN/
    );
    await assert.rejects(
      () =>
        setFeatureEntitlement({
          actorUserId: targetId,
          targetUserId: targetId,
          featureCode: FEATURE_CODES.AI_SESSION_NOTES,
          status: 'enabled',
          source: 'admin',
        }),
      /FORBIDDEN/
    );

    const adminProjection = await getFeatureAdminUsers(
      adminId,
      FEATURE_CODES.AI_SESSION_NOTES
    );
    assert.ok(
      adminProjection.some((row) => row.userId === targetId),
      'La ricerca admin non trova il target.'
    );
    assert.deepEqual(
      Object.keys(adminProjection[0] ?? {}).sort(),
      [
        'displayName',
        'email',
        'expiresAt',
        'roles',
        'source',
        'startsAt',
        'status',
        'usageCount',
        'usageLimit',
        'userId',
      ].sort(),
      'La proiezione admin espone campi non necessari.'
    );

    await setFeatureEntitlement({
      actorUserId: adminId,
      targetUserId: targetId,
      featureCode: FEATURE_CODES.AI_SESSION_NOTES,
      status: 'enabled',
      source: 'admin',
    });
    let access = await getFeatureAccess(
      targetId,
      FEATURE_CODES.AI_SESSION_NOTES
    );
    assert.equal(access.allowed, true, 'Enable admin non efficace.');
    const [createdEntitlement] = await raw`
      select id
      from public.user_feature_entitlements
      where user_id = ${targetId}
        and feature_code = 'AI_SESSION_NOTES'
    `;
    entitlementId = Number(createdEntitlement.id);

    const validStart = new Date(Date.now() - 60_000);
    const validExpiry = new Date(Date.now() + 24 * 60 * 60_000);
    await setFeatureEntitlement({
      actorUserId: adminId,
      targetUserId: targetId,
      featureCode: FEATURE_CODES.AI_SESSION_NOTES,
      status: 'trial',
      source: 'trial',
      startsAt: validStart,
      expiresAt: validExpiry,
    });
    access = await getFeatureAccess(
      targetId,
      FEATURE_CODES.AI_SESSION_NOTES
    );
    assert.equal(access.allowed, true, 'Trial valido considerato non valido.');

    const expiredStart = new Date(Date.now() - 48 * 60 * 60_000);
    const expiredEnd = new Date(Date.now() - 24 * 60 * 60_000);
    await setFeatureEntitlement({
      actorUserId: adminId,
      targetUserId: targetId,
      featureCode: FEATURE_CODES.AI_SESSION_NOTES,
      status: 'trial',
      source: 'trial',
      startsAt: expiredStart,
      expiresAt: expiredEnd,
    });
    access = await getFeatureAccess(
      targetId,
      FEATURE_CODES.AI_SESSION_NOTES
    );
    assert.deepEqual(
      { allowed: access.allowed, reason: access.reason },
      { allowed: false, reason: 'expired' },
      'Trial scaduto ancora valido.'
    );

    await setFeatureEntitlement({
      actorUserId: adminId,
      targetUserId: targetId,
      featureCode: FEATURE_CODES.AI_SESSION_NOTES,
      status: 'enabled',
      source: 'admin',
    });
    await revokeFeatureEntitlement({
      actorUserId: adminId,
      targetUserId: targetId,
      featureCode: FEATURE_CODES.AI_SESSION_NOTES,
    }, dependencies.liveKit);
    access = await getFeatureAccess(
      targetId,
      FEATURE_CODES.AI_SESSION_NOTES
    );
    assert.deepEqual(
      { allowed: access.allowed, reason: access.reason },
      { allowed: false, reason: 'disabled' },
      'La revoca non è immediatamente efficace.'
    );

    const audit = await raw`
      select event_type
      from public.session_ai_audit_events
      where session_ai_notes_id is null
        and actor_user_id = ${adminId}
        and event_metadata ->> 'targetUserId' = ${String(targetId)}
        and createddate >= ${startedAt}
    `;
    const eventTypes = new Set(audit.map((row) => row.event_type));
    assert.ok(eventTypes.has('entitlement_granted'), 'Audit enable assente.');
    assert.ok(
      eventTypes.has('entitlement_trial_started'),
      'Audit trial assente.'
    );
    assert.ok(eventTypes.has('entitlement_revoked'), 'Audit revoca assente.');

    console.log(
      'AI_SESSION_NOTES admin verification: OK ' +
        '(accesso, proiezione, enable, trial, scadenza, revoca, audit)'
    );
  } finally {
    if (actorUserId && targetUserId) {
      await raw`
        delete from public.session_ai_audit_events
        where session_ai_notes_id is null
          and actor_user_id = ${actorUserId}
          and event_metadata ->> 'targetUserId' = ${String(targetUserId)}
          and createddate >= ${startedAt}
      `;
    }
    if (entitlementId) {
      await raw`
        delete from public.user_feature_entitlements
        where id = ${entitlementId}
      `;
    }
    await client.end();
    await raw.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
