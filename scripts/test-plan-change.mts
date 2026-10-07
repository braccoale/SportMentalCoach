// Prova il cambio piano dal prossimo rinnovo con l'orologio di prova di Stripe,
// chiamando il codice vero (`changeAthletePlan`) e guardando il webhook di
// produzione riscrivere la riga.
//
//   npm run pagamenti:prova-cambio-piano -- <email atleta> <email coach>
//   npm run pagamenti:prova-cambio-piano -- <email atleta> <email coach> --apply
//
// Senza `--apply` racconta soltanto che cosa farebbe. Come
// `test-billing-cycle.mjs`: il database di sviluppo è la produzione, il
// webhook è quello di produzione, le email di ciclo arrivano davvero, Stripe
// solo in modalità TEST su un orologio dedicato che a fine corsa viene
// cancellato. Le righe di prova si chiamano «PROVA ciclo» e si tolgono a fine
// corsa.
import postgres from 'postgres';
import * as billingModule from '@/lib/core/billing';

// tsx carica i moduli del progetto come CommonJS: gli export con nome stanno
// sotto `default` quando l'interoperabilità non li espone.
const billing: typeof billingModule =
  (billingModule as unknown as { default?: typeof billingModule }).default ?? billingModule;
const { changeAthletePlan, setAthleteSubscriptionCancellation } = billing;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const [athleteEmail, coachEmail] = args.filter((a) => !a.startsWith('--'));
if (!athleteEmail || !coachEmail) {
  console.error('Uso: test-plan-change.ts <email atleta> <email coach> [--apply]');
  process.exit(1);
}
const key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
if (!key.startsWith('sk_test_')) {
  console.error('Serve una chiave Stripe di TEST (sk_test_…).');
  process.exit(1);
}
const sql = postgres(process.env.POSTGRES_URL!, { max: 1 });
const DAY = 86400;
let accountId = '';

function encode(params: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') out.push(...encode(v as Record<string, unknown>, name));
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}
async function stripe(method: string, path: string, params: Record<string, unknown> = {}) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(accountId ? { 'Stripe-Account': accountId } : {}),
    },
    body: method === 'GET' ? undefined : encode(params).join('&'),
  });
  const body = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) throw new Error(`Stripe ${method} ${path}: ${body?.error?.message ?? response.status}`);
  return body;
}

const results: { name: string; ok: boolean }[] = [];
function record(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? '✔' : '✘'} ${name}${detail ? `  (${detail})` : ''}`);
}
async function waitFor<T>(read: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 120000) {
  const start = Date.now();
  let last: T | undefined;
  while (Date.now() - start < timeoutMs) {
    last = await read();
    if (predicate(last)) return { ok: true, value: last };
    await new Promise((r) => setTimeout(r, 4000));
  }
  return { ok: false, value: last };
}
async function advance(clockId: string, toUnix: number) {
  await stripe('POST', `/v1/test_helpers/test_clocks/${clockId}/advance`, { frozen_time: toUnix });
  const done = await waitFor(
    () => stripe('GET', `/v1/test_helpers/test_clocks/${clockId}`),
    (c: any) => c.status === 'ready',
    180000
  );
  if (!done.ok) throw new Error('L’orologio di prova non è tornato «ready».');
}
const rowOf = async (id: number) =>
  (
    await sql`select status, plan_id, plan_name, sessions_per_month, monthly_price_cents,
                     pending_plan_id, pending_schedule_id, cancel_at_period_end, current_period_end
              from plan_subscriptions where id = ${id}`
  )[0];

let clockId: string | null = null;
const rowIds: number[] = [];
try {
  const people = await sql`
    select id, email from users where lower(email) in (${athleteEmail.toLowerCase()}, ${coachEmail.toLowerCase()})`;
  const athlete = people.find((u) => u.email.toLowerCase() === athleteEmail.toLowerCase());
  const coach = people.find((u) => u.email.toLowerCase() === coachEmail.toLowerCase());
  if (!athlete || !coach) throw new Error('Non trovo entrambi gli utenti.');
  const [billing] = await sql`select stripe_account_id from coach_billing_profiles where coach_user_id = ${coach.id} limit 1`;
  accountId = billing?.stripe_account_id ?? '';
  if (!accountId) throw new Error('Il coach non ha un account Stripe.');
  const plans = await sql`
    select id, name, sessions_per_month, monthly_price_cents from coach_session_plans
    where coach_user_id = ${coach.id} and status = 'active' order by sessions_per_month, id`;
  if (plans.length < 2) throw new Error('Servono almeno due piani attivi del coach.');
  const [planA, planB] = plans;
  const live = await sql`select id from plan_subscriptions where athlete_user_id = ${athlete.id} and coach_user_id = ${coach.id} and status in ('active','past_due')`;
  if (live.length) throw new Error(`C’è già un abbonamento vivo per la coppia (#${live.map((r) => r.id).join(', #')}).`);

  console.log(`Atleta #${athlete.id} · Coach #${coach.id} · Account ${accountId}`);
  console.log(`Piano di partenza: ${planA.name} (${planA.sessions_per_month}/mese, ${planA.monthly_price_cents / 100} €) → piano nuovo: ${planB.name} (${planB.sessions_per_month}/mese, ${planB.monthly_price_cents / 100} €)`);
  if (!apply) {
    console.log('\nAnteprima: non ho fatto niente. Aggiungi --apply per eseguire.');
    process.exit(0);
  }

  const t0 = Math.floor(Date.now() / 1000);
  const clock = await stripe('POST', '/v1/test_helpers/test_clocks', { frozen_time: t0, name: 'PROVA cambio piano KaiPai' });
  clockId = clock.id;
  console.log(`\nOrologio ${clockId} creato.\n`);

  const [row] = await sql`
    insert into plan_subscriptions
      (athlete_user_id, coach_user_id, plan_id, plan_name, sessions_per_month,
       monthly_price_cents, currency, status, stripe_account_id)
    values (${athlete.id}, ${coach.id}, ${planA.id}, 'PROVA ciclo', ${planA.sessions_per_month},
            ${planA.monthly_price_cents}, 'EUR', 'incomplete', ${accountId})
    returning id`;
  rowIds.push(row.id);
  const customer = await stripe('POST', '/v1/customers', { email: athlete.email, name: 'PROVA cambio piano', test_clock: clockId });
  const pm = await stripe('POST', '/v1/payment_methods/pm_card_visa/attach', { customer: customer.id });
  await stripe('POST', `/v1/customers/${customer.id}`, { invoice_settings: { default_payment_method: pm.id } });
  const product = await stripe('POST', '/v1/products', { name: planA.name });
  const subscription = await stripe('POST', '/v1/subscriptions', {
    customer: customer.id,
    items: [{ price_data: { currency: 'eur', unit_amount: planA.monthly_price_cents, recurring: { interval: 'month' }, product: product.id } }],
    metadata: { kaipai_plan_subscription_id: String(row.id), kaipai_plan_id: String(planA.id) },
  });

  console.log('Cambio piano');
  const started = await waitFor(() => rowOf(row.id), (r) => r.status === 'active');
  record('l’abbonamento di prova parte attivo', started.ok);

  const r1 = await changeAthletePlan({ athleteUserId: athlete.id, subscriptionRowId: row.id, newPlanId: planB.id });
  const afterChange = await rowOf(row.id);
  record('il cambio si programma', r1.ok && afterChange.pending_plan_id === planB.id && Boolean(afterChange.pending_schedule_id), r1.ok ? '' : r1.error);
  record('finché non c’è il rinnovo il piano resta quello di prima', afterChange.plan_id === planA.id);

  const r2 = await changeAthletePlan({ athleteUserId: athlete.id, subscriptionRowId: row.id, newPlanId: planA.id });
  const afterCancel = await rowOf(row.id);
  record('scegliere di nuovo il piano attuale annulla il cambio', r2.ok && r2.cancelled === true && afterCancel.pending_plan_id === null && afterCancel.pending_schedule_id === null);

  const r3 = await changeAthletePlan({ athleteUserId: athlete.id, subscriptionRowId: row.id, newPlanId: planB.id });
  record('il cambio si può riprogrammare', r3.ok);

  await advance(clockId!, t0 + 32 * DAY);
  const switched = await waitFor(() => rowOf(row.id), (r) => r.plan_id === planB.id);
  record('al rinnovo il webhook riscrive il piano', switched.ok, switched.value ? `${switched.value.plan_name}` : '');
  record('sedute e prezzo sono quelli del piano nuovo', switched.value?.sessions_per_month === planB.sessions_per_month && switched.value?.monthly_price_cents === planB.monthly_price_cents);
  record('il cambio in attesa è azzerato', switched.value?.pending_plan_id === null && switched.value?.pending_schedule_id === null);

  const invoices = await stripe('GET', `/v1/invoices?subscription=${subscription.id}&limit=3`);
  const amounts = (invoices.data ?? []).map((i: any) => i.amount_paid);
  record('Stripe ha addebitato il prezzo nuovo al rinnovo', amounts[0] === planB.monthly_price_cents, `addebiti: ${amounts.join(', ')}`);

  await advance(clockId!, t0 + 65 * DAY);
  const second = await waitFor(() => rowOf(row.id), (r) => r.status === 'active' && r.plan_id === planB.id && r.current_period_end > (switched.value?.current_period_end ?? new Date(0)));
  record('dopo il cambio l’abbonamento continua a rinnovarsi', second.ok);

  const r4 = await changeAthletePlan({ athleteUserId: athlete.id, subscriptionRowId: row.id, newPlanId: planA.id });
  record('si può programmare un nuovo cambio', r4.ok);
  const r5 = await setAthleteSubscriptionCancellation({ athleteUserId: athlete.id, subscriptionRowId: row.id, cancelAtPeriodEnd: true });
  const afterEnd = await rowOf(row.id);
  record('annullare il rinnovo con un cambio in attesa rilascia il cambio', r5.ok && afterEnd.cancel_at_period_end === true && afterEnd.pending_plan_id === null);
} catch (error) {
  console.error('\nInterrotto:', error instanceof Error ? error.message : error);
  results.push({ name: 'esecuzione', ok: false });
} finally {
  if (apply && clockId) {
    try {
      await stripe('DELETE', `/v1/test_helpers/test_clocks/${clockId}`);
      console.log(`\nOrologio ${clockId} cancellato.`);
      await new Promise((r) => setTimeout(r, 6000));
    } catch (error) {
      console.error('Orologio non cancellato:', error instanceof Error ? error.message : error);
    }
  }
  if (apply && rowIds.length) await sql`delete from plan_subscriptions where id in ${sql(rowIds)}`;
  await sql.end();
}

if (results.length) {
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} verifiche riuscite.`);
  if (bad.length) {
    console.log('Da guardare:', bad.map((b) => b.name).join(' · '));
    process.exitCode = 1;
  }
}
process.exit(process.exitCode ?? 0);
