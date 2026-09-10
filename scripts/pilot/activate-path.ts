/**
 * Apre un percorso per il pilot, a mano e una coppia alla volta.
 *
 * **Perché non c'è un backfill.** La tentazione, avendo `coach_athlete_paths`,
 * è di riempirla con una query sola: tutte le coppie che hanno mai avuto una
 * prenotazione. Sarebbe tornare esattamente al criterio da cui questo modello
 * nasce per uscire — «esiste una prenotazione, quindi c'è una relazione» — e
 * aprirebbe di colpo la porta ai contributi verso coach che l'atleta non sente
 * da due anni, o che una volta gli hanno rifiutato una richiesta.
 *
 * Quindi: nessuna riga nasce da sola. Le coppie del pilot si attivano qui,
 * nominandole, con davanti la loro storia; da lì in avanti ci pensa
 * l'accettazione di una prenotazione, che è l'unico evento che le apre.
 *
 * ## Uso
 *
 * ```
 * node --conditions=react-server --import tsx scripts/pilot/activate-path.ts \
 *   --coach 83 --athlete 68            # mostra e basta
 * node --conditions=react-server --import tsx scripts/pilot/activate-path.ts \
 *   --coach 83 --athlete 68 --scrivi   # scrive
 * ```
 *
 * Senza `--scrivi` non tocca niente: stampa chi sono le due persone, quante
 * sedute hanno fatto e quale prenotazione userebbe come origine. È il momento
 * in cui accorgersi di aver sbagliato un identificativo.
 *
 * **Questo script scrive sul database configurato in `POSTGRES_URL`**, che in
 * questo progetto è la produzione. Non ha una modalità di prova che lo
 * reindirizzi altrove: l'unica difesa è che il gesto sia esplicito, e leggere
 * quello che stampa prima di aggiungere `--scrivi`.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { bookings, coachAthletePaths, profiles, providerProfiles, users } from '@/lib/db/schema';
import { ensurePathForAcceptedBooking, findPath } from '@/lib/core/paths/path-store';

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const coachUserId = Number(argument('coach'));
  const athleteUserId = Number(argument('athlete'));
  const write = process.argv.includes('--scrivi');

  if (!Number.isInteger(coachUserId) || !Number.isInteger(athleteUserId)) {
    console.error(
      'Servono --coach <userId> e --athlete <userId>. Con --scrivi il percorso viene aperto.'
    );
    process.exit(1);
  }

  const [coach] = await db
    .select({ id: users.id, email: users.email, name: profiles.displayName })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, coachUserId))
    .limit(1);
  const [athlete] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, athleteUserId))
    .limit(1);

  if (!coach || !athlete) {
    console.error('Uno dei due identificativi non esiste.');
    process.exit(1);
  }

  // La storia vera della coppia, prima di decidere: è il controllo che nessun
  // vincolo del database può fare al posto di una persona.
  const history = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      scheduledFor: bookings.scheduledFor,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
    .where(
      and(
        eq(bookings.clientId, athleteUserId),
        eq(providerProfiles.userId, coachUserId)
      )
    )
    .orderBy(desc(bookings.scheduledFor));

  const accepted = history.filter(
    (booking) => booking.status === 'accepted' || booking.status === 'completed'
  );

  console.log(`\nCoach   ${coach.name ?? coach.email} (${coach.id})`);
  console.log(`Atleta  ${athlete.name ?? athlete.email} (${athlete.id})`);
  console.log(`\nPrenotazioni fra i due: ${history.length}`);
  for (const booking of history.slice(0, 8)) {
    console.log(
      `  #${booking.id}  ${booking.status.padEnd(10)}  ${
        booking.scheduledFor?.toISOString().slice(0, 10) ?? 'senza orario'
      }`
    );
  }
  console.log(`Di cui accettate o svolte: ${accepted.length}`);

  const existing = await findPath({ coachUserId, athleteUserId });
  if (existing) {
    console.log(
      `\nIl percorso esiste già: #${existing.id}, stato «${existing.status}».`
    );
    if (existing.status === 'closed') {
      console.log(
        `Chiuso da «${existing.closedByRole ?? 'ignoto'}». Va riaperto da chi l'ha chiuso, dall'applicazione — non da qui.`
      );
    }
    process.exit(0);
  }

  if (accepted.length === 0) {
    console.log(
      '\nNessuna prenotazione accettata o svolta fra i due. Aprire un percorso qui significherebbe dichiarare una relazione che il coach non ha mai confermato.'
    );
    process.exit(1);
  }

  const origin = accepted[accepted.length - 1];
  console.log(`\nOrigine proposta: prenotazione #${origin.id}.`);

  if (!write) {
    console.log('\nNiente è stato scritto. Aggiungi --scrivi per aprire il percorso.\n');
    process.exit(0);
  }

  const outcome = await ensurePathForAcceptedBooking({
    coachUserId,
    athleteUserId,
    bookingId: origin.id,
    // L'attivazione del pilot resta attribuita al coach: è la sua relazione, e
    // il registro deve dire lo stesso di un'attivazione ordinaria.
    actorUserId: coachUserId,
  });

  console.log(`\nEsito: ${outcome.kind}`);
  if (outcome.kind === 'created') {
    const [row] = await db
      .select({ id: coachAthletePaths.id })
      .from(coachAthletePaths)
      .where(
        and(
          eq(coachAthletePaths.coachUserId, coachUserId),
          eq(coachAthletePaths.athleteUserId, athleteUserId)
        )
      )
      .limit(1);
    console.log(`Percorso #${row?.id} aperto e tracciato.\n`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
