// Prova il ciclo mensile degli abbonamenti con l'orologio di prova di Stripe
// (test clock): rinnovo riuscito, annullamento del rinnovo e riattivazione,
// fine dell'abbonamento, rinnovo fallito. Verifica come reagiscono il webhook
// di produzione, il database e le email.
//
//   npm run pagamenti:prova-ciclo -- <email atleta> <email coach>
//   npm run pagamenti:prova-ciclo -- <email atleta> <email coach> --apply
//
// Senza `--apply` racconta soltanto che cosa farebbe.
//
// **Il database di sviluppo è la produzione**, e il webhook che riceve gli
// eventi è quello di produzione: lo script scrive due righe in
// `plan_subscriptions` (piano «PROVA ciclo», 1,00 €) per la coppia indicata, e
// le email di ciclo arrivano davvero ai due indirizzi. Su Stripe usa solo
// chiavi di TEST e un orologio dedicato, che a fine corsa viene cancellato
// con tutto quello che contiene. Rifiuta chiavi live.
//
// Per ripulire le righe dopo la prova:
//   npm run pagamenti:reset-prove -- <email atleta> <email coach> --apply
import postgres from 'postgres';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const [athleteEmail, coachEmail] = args.filter((a) => !a.startsWith('--'));
if (!athleteEmail || !coachEmail) {
  console.error('Uso: test-billing-cycle.mjs <email atleta> <email coach> [--apply]');
  process.exit(1);
}
if (!process.env.POSTGRES_URL) {
  console.error('POSTGRES_URL non è impostata (usa npm run pagamenti:prova-ciclo).');
  process.exit(1);
}
const key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
if (!key.startsWith('sk_test_')) {
  console.error('Serve una chiave Stripe di TEST (sk_test_…). Con una chiave live questo strumento non si usa.');
  process.exit(1);
}

const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
const DAY = 86400;

// ── Stripe, con codifica form annidata ────────────────────────────────────
function encode(params, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') out.push(...encode(v, name));
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}
let accountId = null;
async function stripe(method, path, params = {}) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(accountId ? { 'Stripe-Account': accountId } : {}),
    },
    body: method === 'GET' ? undefined : encode(params).join('&'),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Stripe ${method} ${path}: ${body?.error?.message ?? response.status}`);
  }
  return body;
}

// ── Verifiche ─────────────────────────────────────────────────────────────
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? '✔' : '✘'} ${name}${detail ? `  (${detail})` : ''}`);
}
async function waitFor(label, read, predicate, timeoutMs = 120000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await read();
    if (predicate(last)) return { ok: true, value: last };
    await new Promise((r) => setTimeout(r, 4000));
  }
  return { ok: false, value: last };
}
async function advance(clockId, toUnix) {
  await stripe('POST', `/v1/test_helpers/test_clocks/${clockId}/advance`, { frozen_time: toUnix });
  const done = await waitFor(
    'orologio',
    () => stripe('GET', `/v1/test_helpers/test_clocks/${clockId}`),
    (c) => c.status === 'ready',
    180000
  );
  if (!done.ok) throw new Error('L’orologio di prova non è tornato «ready».');
}
const rowOf = async (id) =>
  (await sql`select status, cancel_at_period_end, current_period_end, subscribed_at, stripe_subscription_id from plan_subscriptions where id = ${id}`)[0];

async function newSubscription({ athlete, coach, plan, clockId, paymentMethod }) {
  const [row] = await sql`
    insert into plan_subscriptions
      (athlete_user_id, coach_user_id, plan_id, plan_name, sessions_per_month,
       monthly_price_cents, currency, status, stripe_account_id)
    values (${athlete.id}, ${coach.id}, ${plan.id}, 'PROVA ciclo', ${plan.sessions_per_month},
            100, 'EUR', 'incomplete', ${accountId})
    returning id`;
  const customer = await stripe('POST', '/v1/customers', {
    email: athlete.email,
    name: 'PROVA ciclo',
    test_clock: clockId,
  });
  const pm = await stripe('POST', `/v1/payment_methods/${paymentMethod}/attach`, { customer: customer.id });
  await stripe('POST', `/v1/customers/${customer.id}`, { invoice_settings: { default_payment_method: pm.id } });
  const product = await stripe('POST', '/v1/products', { name: 'PROVA ciclo mensile' });
  const subscription = await stripe('POST', '/v1/subscriptions', {
    customer: customer.id,
    items: [{ price_data: { currency: 'eur', unit_amount: 100, recurring: { interval: 'month' }, product: product.id } }],
    metadata: { kaipai_plan_subscription_id: String(row.id) },
  });
  return { rowId: row.id, customer, subscription };
}

let clockId = null;
const testBookings = [];
try {
  const people = await sql`
    select id, email, name from users
    where lower(email) in (${athleteEmail.toLowerCase()}, ${coachEmail.toLowerCase()})`;
  const athlete = people.find((u) => u.email.toLowerCase() === athleteEmail.toLowerCase());
  const coach = people.find((u) => u.email.toLowerCase() === coachEmail.toLowerCase());
  if (!athlete || !coach) throw new Error('Non trovo entrambi gli utenti.');
  const [billing] = await sql`select stripe_account_id from coach_billing_profiles where coach_user_id = ${coach.id} limit 1`;
  accountId = billing?.stripe_account_id ?? process.env.PROVA_STRIPE_ACCOUNT ?? null;
  if (!accountId) throw new Error('Non trovo l’account Stripe del coach (PROVA_STRIPE_ACCOUNT=acct_… per indicarlo).');
  const [plan] = await sql`select id, sessions_per_month from coach_session_plans where coach_user_id = ${coach.id} order by id limit 1`;
  if (!plan) throw new Error('Il coach non ha piani.');
  const live = await sql`select id from plan_subscriptions where athlete_user_id = ${athlete.id} and coach_user_id = ${coach.id} and status in ('active','past_due')`;
  if (live.length) throw new Error(`C’è già un abbonamento vivo per la coppia (#${live.map((r) => r.id).join(', #')}): ripulisci con pagamenti:reset-prove.`);

  console.log(`Atleta: ${athlete.email} (#${athlete.id})  ·  Coach: ${coach.email} (#${coach.id})  ·  Account: ${accountId}`);
  console.log('Scenario A: rinnovo riuscito → annullo il rinnovo → riattivo → annullo → fine abbonamento');
  console.log('Scenario B: rinnovo fallito (carta che rifiuta dal secondo addebito)');
  if (!apply) {
    console.log('\nAnteprima: non ho fatto niente. Aggiungi --apply per eseguire.');
    process.exit(0);
  }

  const startedAt = new Date();
  const t0 = Math.floor(Date.now() / 1000);
  const clock = await stripe('POST', '/v1/test_helpers/test_clocks', { frozen_time: t0, name: 'PROVA ciclo KaiPai' });
  clockId = clock.id;
  console.log(`\nOrologio di prova ${clockId} creato.\n`);

  // ── A ───────────────────────────────────────────────────────────────────
  console.log('A · abbonamento che si rinnova e poi finisce');
  const a = await newSubscription({ athlete, coach, plan, clockId, paymentMethod: 'pm_card_visa' });
  const a1 = await waitFor('A attivo', () => rowOf(a.rowId), (r) => r.status === 'active' && r.subscribed_at && r.current_period_end);
  record('il primo pagamento rende attivo l’abbonamento e scrive la data', a1.ok, a1.value?.status);
  const firstEnd = a1.value?.current_period_end;
  // La ricevuta: la fattura ospitata da Stripe, quella che apre
  // /api/payments/receipt (stessa chiamata di `latestSubscriptionReceiptUrl`).
  const invoices = await stripe('GET', `/v1/invoices?subscription=${a.subscription.id}&status=paid&limit=1`);
  record('Stripe dà il collegamento alla ricevuta del primo pagamento', typeof invoices.data?.[0]?.hosted_invoice_url === 'string');

  await advance(clockId, t0 + 32 * DAY);
  const a2 = await waitFor('A rinnovo', () => rowOf(a.rowId), (r) => r.status === 'active' && r.current_period_end > firstEnd);
  record('il rinnovo sposta la fine del periodo in avanti', a2.ok, `${firstEnd?.toISOString?.()} → ${a2.value?.current_period_end?.toISOString?.()}`);

  await stripe('POST', `/v1/subscriptions/${a.subscription.id}`, { cancel_at_period_end: true });
  const a3 = await waitFor('A annullo', () => rowOf(a.rowId), (r) => r.cancel_at_period_end === true);
  record('annullare il rinnovo si vede sul database', a3.ok);

  await stripe('POST', `/v1/subscriptions/${a.subscription.id}`, { cancel_at_period_end: false });
  const a4 = await waitFor('A riattivo', () => rowOf(a.rowId), (r) => r.cancel_at_period_end === false);
  record('riattivare il rinnovo si vede sul database', a4.ok);

  await stripe('POST', `/v1/subscriptions/${a.subscription.id}`, { cancel_at_period_end: true });
  await waitFor('A annullo bis', () => rowOf(a.rowId), (r) => r.cancel_at_period_end === true);
  await advance(clockId, t0 + 65 * DAY);
  const a5 = await waitFor('A fine', () => rowOf(a.rowId), (r) => r.status === 'canceled');
  record('a fine periodo l’abbonamento annullato si chiude', a5.ok, a5.value?.status);

  // ── B ───────────────────────────────────────────────────────────────────
  console.log('\nB · rinnovo che fallisce');
  const b = await newSubscription({ athlete, coach, plan, clockId, paymentMethod: 'pm_card_visa' });
  const b1 = await waitFor('B attivo', () => rowOf(b.rowId), (r) => r.status === 'active');
  record('il secondo abbonamento parte attivo', b1.ok);
  // Due sedute fissate: una nel periodo già pagato, una in quello che non
  // verrà pagato. Dopo il rinnovo fallito deve restare la prima e saltare la
  // seconda (sistema, non consuma).
  const [provider] = await sql`select id from provider_profiles where user_id = ${coach.id} limit 1`;
  const at = (days) => new Date((t0 + days * DAY) * 1000);
  const insertBooking = async (days) =>
    (await sql`insert into bookings (client_id, provider_id, status, scheduled_for, duration_min)
               values (${athlete.id}, ${provider.id}, 'accepted', ${at(days)}, 60) returning id`)[0].id;
  const paidBooking = await insertBooking(70);
  const unpaidBooking = await insertBooking(99);
  testBookings.push(paidBooking, unpaidBooking);
  const bad = await stripe('POST', '/v1/payment_methods/pm_card_chargeCustomerFail/attach', { customer: b.customer.id });
  await stripe('POST', `/v1/customers/${b.customer.id}`, { invoice_settings: { default_payment_method: bad.id } });
  await advance(clockId, t0 + 100 * DAY);
  const b2 = await waitFor('B ritardo', () => rowOf(b.rowId), (r) => r.status === 'past_due');
  record('con la carta che rifiuta l’abbonamento passa a «in ritardo»', b2.ok, b2.value?.status);
  const afterwards = await waitFor(
    'sedute',
    async () => (await sql`select id, status, late_cancellation, updated_by from bookings where id in (${paidBooking}, ${unpaidBooking})`),
    (rows) => rows.find((r) => r.id === unpaidBooking)?.status === 'cancelled',
    60000
  );
  const byId = (id) => afterwards.value?.find((r) => r.id === id);
  record('la seduta del periodo non pagato è annullata dal sistema', afterwards.ok && byId(unpaidBooking)?.updated_by === null && byId(unpaidBooking)?.late_cancellation === false);
  record('la seduta del periodo già pagato resta', byId(paidBooking)?.status === 'accepted');

  // ── Email e webhook ─────────────────────────────────────────────────────
  await new Promise((r) => setTimeout(r, 8000));
  console.log('\nEmail registrate dalla prova (registro delle consegne):');
  const deliveries = await sql`
    select template_key, status, count(*)::int as n
    from notification_email_deliveries
    where created_at >= ${startedAt} and template_key like any (array['billing\\_%', 'payment\\_failed\\_%'])
    group by 1, 2 order by 1, 2`;
  for (const d of deliveries) console.log(`  ${d.template_key.padEnd(40)} ${d.status.padEnd(10)} ×${d.n}`);
  const expected = [
    'billing_subscription_started_athlete', 'billing_subscription_started_coach',
    'billing_cancel_scheduled_athlete', 'billing_cancel_undone_athlete',
    'billing_subscription_ended_athlete', 'billing_subscription_ended_coach',
    'payment_failed_athlete', 'payment_failed_coach',
  ];
  for (const key of expected) {
    record(`email ${key}`, deliveries.some((d) => d.template_key === key));
  }
  const failed = await sql`select event_type, last_error_code from stripe_webhook_events where status = 'failed' and received_at >= ${startedAt}`;
  record('nessun evento Stripe fallito durante la prova', failed.length === 0, failed.map((f) => `${f.event_type}:${f.last_error_code}`).join(', '));
} catch (error) {
  console.error('\nInterrotto:', error instanceof Error ? error.message : error);
  results.push({ name: 'esecuzione', ok: false });
} finally {
  if (apply && testBookings.length) {
    await sql`delete from bookings where id in ${sql(testBookings)}`;
  }
  if (apply && clockId) {
    // Prima l'orologio (porta via clienti e abbonamenti di prova), poi si
    // lascia al webhook il tempo di registrare le chiusure.
    try {
      await stripe('DELETE', `/v1/test_helpers/test_clocks/${clockId}`);
      console.log(`\nOrologio ${clockId} cancellato.`);
      await new Promise((r) => setTimeout(r, 6000));
    } catch (error) {
      console.error('Orologio non cancellato:', error instanceof Error ? error.message : error);
    }
  }
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
