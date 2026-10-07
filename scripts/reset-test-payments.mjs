// Azzera le prove di pagamento fra un atleta e un coach: l'abbonamento e le
// sedute acquistate a parte, nel database e (con --stripe) su Stripe.
//
// Serve a rifare i test dall'inizio: «Abbonati», «Aggiungi una sessione»,
// rinnovo fallito. Non è uno strumento di manutenzione: chiede di essere
// invocato a mano, su una coppia precisa di indirizzi, e senza `--apply` si
// limita a raccontare che cosa farebbe.
//
//   npm run pagamenti:reset-prove -- <email atleta> <email coach>
//   npm run pagamenti:reset-prove -- <email atleta> <email coach> --apply
//   npm run pagamenti:reset-prove -- <email atleta> <email coach> --apply --stripe
//
// **Il database di sviluppo è la produzione**: la coppia la scrivi tu, e tutto
// quello che viene cancellato è elencato prima. Rifiuta di andare avanti con
// una chiave Stripe «live»: con denaro vero cancellare le righe significherebbe
// perdere traccia di pagamenti reali.
//
// Cosa NON tocca:
//  - le prenotazioni e le sessioni (per quelle c'è `wipe-sessions-between-users.mjs`);
//  - i pagamenti già fatti su Stripe: in modalità test restano come storico, non
//    si possono cancellare (si cancella il cliente, e con lui gli abbonamenti);
//  - l'account Stripe del coach e la sua verifica.
import postgres from 'postgres';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const withStripe = args.includes('--stripe');
const [athleteEmail, coachEmail] = args.filter((a) => !a.startsWith('--'));

if (!athleteEmail || !coachEmail) {
  console.error(
    'Uso: reset-test-payments.mjs <email atleta> <email coach> [--apply] [--stripe]'
  );
  process.exit(1);
}
if (!process.env.POSTGRES_URL) {
  console.error('POSTGRES_URL non è impostata (usa npm run pagamenti:reset-prove).');
  process.exit(1);
}

const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
if (withStripe && !stripeKey.startsWith('sk_test_')) {
  console.error(
    'Con --stripe serve una chiave di TEST (sk_test_…). Con una chiave live non si cancella niente.'
  );
  process.exit(1);
}
if (stripeKey.startsWith('sk_live_')) {
  console.error('La chiave Stripe è LIVE: questo strumento non si usa con denaro vero.');
  process.exit(1);
}

const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

async function stripe(method, path, accountId) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      ...(accountId ? { 'Stripe-Account': accountId } : {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

try {
  const people = await sql`
    select id, email, name, last_name from users
    where lower(email) in (${athleteEmail.toLowerCase()}, ${coachEmail.toLowerCase()})
  `;
  const athlete = people.find((u) => u.email.toLowerCase() === athleteEmail.toLowerCase());
  const coach = people.find((u) => u.email.toLowerCase() === coachEmail.toLowerCase());
  if (!athlete || !coach) {
    console.error('Non trovo entrambi gli utenti:', people.map((u) => u.email));
    process.exit(1);
  }
  console.log(`Atleta: ${athlete.email} (#${athlete.id})  ·  Coach: ${coach.email} (#${coach.id})`);

  const subs = await sql`
    select id, status, plan_name, stripe_subscription_id, stripe_customer_id, stripe_account_id
    from plan_subscriptions
    where athlete_user_id = ${athlete.id} and coach_user_id = ${coach.id}
    order by id
  `;
  const credits = await sql`
    select id, kind, status, price_cents, booking_id, stripe_payment_intent_id
    from session_credits
    where athlete_user_id = ${athlete.id} and coach_user_id = ${coach.id}
    order by id
  `;
  const [{ n: bookingsCount }] = await sql`
    select count(*)::int as n from bookings b
    join provider_profiles p on p.id = b.provider_id
    where b.client_id = ${athlete.id} and p.user_id = ${coach.id}
  `;

  console.log(`\nAbbonamenti da cancellare (${subs.length}):`);
  for (const s of subs) {
    console.log(`  #${s.id}  ${s.status}  ${s.plan_name}  ${s.stripe_subscription_id ?? '(senza abbonamento Stripe)'}`);
  }
  console.log(`Sedute acquistate a parte da cancellare (${credits.length}):`);
  for (const c of credits) {
    console.log(`  #${c.id}  ${c.kind}  ${c.status}  ${(c.price_cents / 100).toFixed(2)} €  ${c.booking_id ? `legata alla prenotazione ${c.booking_id}` : 'non pianificata'}`);
  }
  if (bookingsCount > 0) {
    console.log(`\nNota: tra i due ci sono ${bookingsCount} prenotazioni, che NON vengono toccate (per quelle: wipe-sessions-between-users.mjs).`);
  }

  // Clienti Stripe da togliere: quelli registrati sulle righe e quelli creati
  // dal Checkout con l'email dell'atleta sullo stesso account del coach.
  const accounts = [...new Set(subs.map((s) => s.stripe_account_id).filter(Boolean))];
  const customersToDelete = [];
  if (withStripe) {
    for (const accountId of accounts) {
      const ids = new Set(subs.filter((s) => s.stripe_account_id === accountId && s.stripe_customer_id).map((s) => s.stripe_customer_id));
      const listed = await stripe('GET', `/v1/customers?email=${encodeURIComponent(athlete.email)}&limit=100`, accountId);
      for (const customer of listed.body?.data ?? []) ids.add(customer.id);
      for (const id of ids) customersToDelete.push({ accountId, id });
    }
    console.log(`\nClienti Stripe (test) da cancellare (${customersToDelete.length}):`);
    for (const c of customersToDelete) console.log(`  ${c.id}  sull'account ${c.accountId}`);
    if (customersToDelete.length) {
      console.log('  (cancellare il cliente annulla subito i suoi abbonamenti; i pagamenti già fatti restano nello storico di prova)');
    }
  }

  if (!apply) {
    console.log('\nAnteprima: non ho cancellato niente. Aggiungi --apply per farlo.');
    process.exit(0);
  }

  // Prima Stripe: se fallisce le righe restano e si può ripetere.
  if (withStripe) {
    for (const { accountId, id } of customersToDelete) {
      const result = await stripe('DELETE', `/v1/customers/${id}`, accountId);
      const missing = result.status === 404 || result.body?.error?.code === 'resource_missing';
      console.log(`  Stripe ${id}: ${result.ok ? 'cancellato' : missing ? 'già assente' : `ERRORE ${result.status} ${result.body?.error?.message ?? ''}`}`);
      if (!result.ok && !missing) {
        console.error('Mi fermo: le righe del database non sono state toccate.');
        process.exit(1);
      }
    }
  }

  await sql.begin(async (tx) => {
    await tx`delete from session_credits where athlete_user_id = ${athlete.id} and coach_user_id = ${coach.id}`;
    await tx`delete from plan_subscriptions where athlete_user_id = ${athlete.id} and coach_user_id = ${coach.id}`;
  });
  console.log(`\nFatto: ${subs.length} abbonamenti e ${credits.length} sedute cancellati dal database.`);
} finally {
  await sql.end();
}
