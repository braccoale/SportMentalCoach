// Cancella tutte le prenotazioni (e tutto ciò che ne dipende — sessione AI,
// trascrizione, registrazioni audio, report, consensi, job di elaborazione,
// audit, impegni, segnalibri, note vocali) tra due utenti, in entrambe le
// direzioni (indipendentemente da chi è coach e chi è atleta).
//
// Le tabelle a valle di `session_ai_notes` hanno tutte
// `onDelete: 'cascade'` verso `session_ai_notes.id` (schema.ts), e
// `session_ai_notes.booking_id` ha `onDelete: 'cascade'` verso
// `bookings.id`: cancellare la riga in `bookings` cancella a cascata tutto
// il resto. Non tocca altre tabelle non collegate a una prenotazione
// (es. direct_messages, notifiche).
//
// Uso:
//   node --conditions=react-server --import tsx -r dotenv/config scripts/wipe-sessions-between-users.mjs <email1> <email2>            (anteprima, nessuna modifica)
//   node --conditions=react-server --import tsx -r dotenv/config scripts/wipe-sessions-between-users.mjs <email1> <email2> --apply     (cancella davvero)
import postgres from 'postgres';

const [, , email1, email2, flag] = process.argv;
if (!email1 || !email2) {
  console.error('Uso: wipe-sessions-between-users.mjs <email1> <email2> [--apply]');
  process.exit(1);
}
const apply = flag === '--apply';

const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

const users = await sql`
  select id, name, last_name, email from users where email in (${email1}, ${email2})
`;
if (users.length !== 2) {
  console.error('Non ho trovato entrambi gli utenti:', users);
  await sql.end();
  process.exit(1);
}
console.log('Utenti:', users);
const ids = users.map((u) => u.id);

const bookings = await sql`
  select b.id, b.status, b.scheduled_for, b.client_id, b.provider_id,
         atleta.email as athlete_email, coach_user.email as coach_email,
         san.id as session_ai_notes_id, san.status as ai_status
  from bookings b
  join users atleta on atleta.id = b.client_id
  join provider_profiles pp on pp.id = b.provider_id
  join users coach_user on coach_user.id = pp.user_id
  left join session_ai_notes san on san.booking_id = b.id
  where (b.client_id = ${ids[0]} and coach_user.id = ${ids[1]})
     or (b.client_id = ${ids[1]} and coach_user.id = ${ids[0]})
  order by b.scheduled_for
`;

console.log(`\nPrenotazioni trovate: ${bookings.length}`);
for (const row of bookings) {
  console.log(
    `  booking ${row.id} — ${row.status} — ${row.scheduled_for?.toISOString?.() ?? row.scheduled_for} — atleta ${row.athlete_email} / coach ${row.coach_email}${row.session_ai_notes_id ? ` — sessione AI ${row.session_ai_notes_id} (${row.ai_status})` : ''}`
  );
}

if (bookings.length === 0) {
  console.log('\nNiente da cancellare.');
  await sql.end();
  process.exit(0);
}

const bookingIds = bookings.map((b) => b.id);

if (!apply) {
  console.log('\nAnteprima: rilancia con --apply per cancellare davvero.');
  await sql.end();
  process.exit(0);
}

const deleted = await sql`
  delete from bookings where id in ${sql(bookingIds)} returning id
`;
console.log(`\nCancellate ${deleted.length} prenotazioni (a cascata: sessioni AI, trascrizioni, registrazioni, report, job, audit, impegni, segnalibri, note vocali).`);

await sql.end();
