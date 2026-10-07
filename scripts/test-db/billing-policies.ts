import { abort, connectToTestDatabase } from './connect';
import {
  impersonate,
  makeBooking,
  makeUser,
  seedPilotScene,
  seedRoles,
} from './fixtures';

let checks = 0;
let failures = 0;

function check(condition: boolean, label: string): void {
  checks += 1;
  if (condition) console.log(`  ✔ ${label}`);
  else {
    failures += 1;
    console.error(`  ✖ ${label}`);
  }
}

async function rejects(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return false;
  } catch {
    return true;
  }
}

async function visibleCount(sql: Awaited<ReturnType<typeof connectToTestDatabase>>['sql'], table: string) {
  const [row] = await sql.unsafe<{ n: number }[]>(`select count(*)::int as n from public.${table}`);
  return row.n;
}

async function main(): Promise<void> {
  const { sql, description } = await connectToTestDatabase();
  console.log(`\nDatabase di prova: ${description}`);
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { coachA, coachB, athlete, otherAthlete, providerA } = await seedPilotScene(sql);
  await seedRoles(sql);
  const admin = await makeUser(sql, 'billingAdmin', 'admin', suffix);

  const [customerA] = await sql<{ id: number }[]>`
    insert into public.billing_customers
      (beneficiary_user_id, payer_user_id, email_snapshot)
    values (${athlete.id}, ${athlete.id}, ${`athlete-${suffix}@test.local`})
    returning id
  `;
  const [customerB] = await sql<{ id: number }[]>`
    insert into public.billing_customers
      (beneficiary_user_id, payer_user_id, email_snapshot)
    values (${otherAthlete.id}, ${otherAthlete.id}, ${`other-${suffix}@test.local`})
    returning id
  `;

  check(
    await rejects(() => sql`
      insert into public.billing_customers (beneficiary_user_id, email_snapshot)
      values (${athlete.id}, 'invalid@test.local')
    `),
    'il payer constraint rifiuta un customer senza pagatore'
  );
  check(
    await rejects(() => sql`
      insert into public.billing_customers
        (beneficiary_user_id, payer_user_id, payer_guardian_id, email_snapshot)
      values (${athlete.id}, ${athlete.id}, 1, 'invalid@test.local')
    `),
    'il payer constraint rifiuta due pagatori contemporanei'
  );

  const [relationshipA] = await sql<{ id: number }[]>`
    insert into public.coach_athlete_commercial_relationships
      (coach_user_id, athlete_user_id, source, commission_bps)
    values (${coachA.id}, ${athlete.id}, 'KAIPAI_SOURCED', 3000)
    returning id
  `;
  const [relationshipB] = await sql<{ id: number }[]>`
    insert into public.coach_athlete_commercial_relationships
      (coach_user_id, athlete_user_id, source, commission_bps)
    values (${coachB.id}, ${otherAthlete.id}, 'KAIPAI_SOURCED', 3000)
    returning id
  `;
  check(
    await rejects(() => sql`
      insert into public.coach_athlete_commercial_relationships
        (coach_user_id, athlete_user_id, source, commission_bps)
      values (${coachA.id}, ${athlete.id}, 'KAIPAI_SOURCED', 3000)
    `),
    'una coppia coach-atleta ha una sola relazione commerciale'
  );

  const [orderA] = await sql<{ id: number }[]>`
    insert into public.billing_orders
      (commercial_relationship_id, billing_customer_id, coach_user_id, athlete_user_id,
       product_type, billing_mode, coach_rate_cents, session_quantity,
       gross_amount_cents, platform_commission_bps, platform_fee_cents,
       coach_compensation_cents, acquisition_source, idempotency_key)
    values
      (${relationshipA.id}, ${customerA.id}, ${coachA.id}, ${athlete.id},
       'essential', 'subscription', 7000, 2, 14000, 3000, 4200, 9800,
       'KAIPAI_SOURCED', ${`order-a-${suffix}`})
    returning id
  `;
  await sql`
    insert into public.billing_orders
      (commercial_relationship_id, billing_customer_id, coach_user_id, athlete_user_id,
       product_type, billing_mode, coach_rate_cents, session_quantity,
       gross_amount_cents, platform_commission_bps, platform_fee_cents,
       coach_compensation_cents, acquisition_source, idempotency_key)
    values
      (${relationshipB.id}, ${customerB.id}, ${coachB.id}, ${otherAthlete.id},
       'single', 'one_off', 6000, 1, 6000, 3000, 1800, 4200,
       'KAIPAI_SOURCED', ${`order-b-${suffix}`})
  `;

  const [locked] = await sql<{ locked_at: Date | null }[]>`
    select locked_at from public.coach_athlete_commercial_relationships where id = ${relationshipA.id}
  `;
  check(locked.locked_at !== null, 'il primo ordine blocca automaticamente l’attribuzione');
  check(
    await rejects(() => sql`
      update public.coach_athlete_commercial_relationships
      set source = 'COACH_SOURCED', commission_bps = 1000
      where id = ${relationshipA.id}
    `),
    'l’attribuzione bloccata è immutabile'
  );
  check(
    await rejects(() => sql`
      insert into public.billing_orders
        (commercial_relationship_id, billing_customer_id, coach_user_id, athlete_user_id,
         product_type, billing_mode, coach_rate_cents, session_quantity,
         gross_amount_cents, platform_commission_bps, platform_fee_cents,
         coach_compensation_cents, acquisition_source, idempotency_key)
      values
        (${relationshipA.id}, ${customerA.id}, ${coachA.id}, ${athlete.id},
         'single', 'one_off', 7000, 1, 7000, 3000, 1, 6999,
         'KAIPAI_SOURCED', ${`bad-split-${suffix}`})
    `),
    'il DB rifiuta uno snapshot economico con percentuale alterata'
  );

  const booking = await makeBooking(sql, providerA, athlete.id, 'accepted', new Date('2026-10-10T10:00:00Z'));
  const [credit] = await sql<{ id: number }[]>`
    insert into public.session_credits
      (order_id, athlete_user_id, coach_user_id, product_type,
       granted_at, expires_at, status)
    values (${orderA.id}, ${athlete.id}, ${coachA.id}, 'essential',
      '2026-09-01T00:00:00Z', '2026-11-01T00:00:00Z', 'available')
    returning id
  `;
  await sql`
    update public.session_credits
    set status = 'reserved', reserved_at = '2026-09-20T12:00:00Z', booking_id = ${booking}
    where id = ${credit.id}
  `;
  check(
    await rejects(() => sql`
      update public.session_credits
      set booking_id = ${booking + 1}
      where id = ${credit.id}
    `),
    'un credito riservato non può essere associato a una seconda booking'
  );
  await sql`
    update public.session_credits
    set status = 'consumed', consumed_at = '2026-09-21T12:00:00Z'
    where id = ${credit.id}
  `;
  check(
    await rejects(() => sql`
      update public.session_credits
      set booking_id = ${booking + 1}, consumed_at = '2026-09-22T12:00:00Z'
      where id = ${credit.id}
    `),
    'un credito consumato non può essere consumato una seconda volta'
  );
  const [expiredCredit] = await sql<{ id: number }[]>`
    insert into public.session_credits
      (order_id, athlete_user_id, coach_user_id, product_type,
       granted_at, expires_at, status)
    values (${orderA.id}, ${athlete.id}, ${coachA.id}, 'single',
      '2026-01-01T00:00:00Z', '2026-03-02T00:00:00Z', 'expired')
    returning id
  `;
  check(
    await rejects(() => sql`
      update public.session_credits
      set status = 'reserved', reserved_at = '2026-03-03T00:00:00Z', booking_id = ${booking + 1}
      where id = ${expiredCredit.id}
    `),
    'un credito scaduto non può essere riservato'
  );
  check(
    await rejects(() => sql`
      insert into public.session_credits
        (order_id, athlete_user_id, coach_user_id, product_type,
         granted_at, expires_at, rollover_generation, rolled_from_credit_id)
      values (${orderA.id}, ${athlete.id}, ${coachA.id}, 'essential',
        '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z', 2, ${credit.id})
    `),
    'il DB rifiuta un rollover oltre un periodo'
  );

  await impersonate(sql, athlete.authId);
  check((await visibleCount(sql, 'billing_orders')) === 1, 'RLS atleta mostra soltanto i propri ordini');
  check((await visibleCount(sql, 'session_credits')) === 2, 'RLS atleta mostra soltanto i propri crediti');
  check((await visibleCount(sql, 'coach_athlete_commercial_relationships')) === 1, 'RLS atleta isola la propria relazione commerciale');
  check((await visibleCount(sql, 'stripe_webhook_events')) === 0, 'RLS non espone il log webhook all’atleta');
  check(
    await rejects(() => sql`
      update public.billing_orders set status = 'paid' where id = ${orderA.id}
    `),
    'l’atleta non può scrivere dati finanziari direttamente'
  );

  await impersonate(sql, coachA.authId);
  check((await visibleCount(sql, 'billing_orders')) === 1, 'RLS coach mostra soltanto i propri ordini');
  check((await visibleCount(sql, 'session_credits')) === 2, 'RLS coach mostra soltanto i crediti delle proprie relazioni');
  check((await visibleCount(sql, 'billing_customers')) === 0, 'il coach non legge l’identità del pagatore');
  check(
    await rejects(() => sql`
      insert into public.business_events (event_name, idempotency_key, source, occurred_at)
      values ('checkout_started', ${`forbidden-${suffix}`}, 'server', now())
    `),
    'il coach non può scrivere eventi business direttamente'
  );

  await impersonate(sql, admin.authId);
  check((await visibleCount(sql, 'billing_orders')) === 2, 'l’admin vede tutti gli ordini');
  check((await visibleCount(sql, 'billing_customers')) === 2, 'l’admin vede i billing customer');

  await impersonate(sql, null);
  console.log(`\n${failures === 0 ? '✔' : '✖'} ${checks - failures}/${checks} verifiche billing superate.\n`);
  await sql.end({ timeout: 5 });
  if (failures > 0) process.exit(1);
}

main().catch(abort);
