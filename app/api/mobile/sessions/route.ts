import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { getApiUser } from '@/lib/auth/api-user';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  profiles,
  providerProfiles,
  services,
  users,
} from '@/lib/db/schema';
import { FALLBACK_SESSION_DURATION_MIN } from '@/lib/core/sessions';

/**
 * Le sessioni che l'app deve mostrare: poche, imminenti, con dentro solo ciò
 * che serve per entrare in chiamata.
 *
 * Non è la dashboard in miniatura. L'app esiste per una cosa sola — essere in
 * chiamata dal telefono — e questa lista è il minimo per arrivarci: chi,
 * quando, e l'identificativo con cui chiedere il token. Storico, chat,
 * riepiloghi e prenotazioni restano sul web, dove c'è lo spazio per leggerli.
 */
export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Finestra generosa all'indietro: una sessione iniziata poco fa deve
  // restare raggiungibile, altrimenti chi arriva in ritardo non la trova più.
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
  // Quanto passato si porta dietro l'app. Non è lo storico completo — quello
  // sta sul web con i riepiloghi — ma «le ultime settimane», che è ciò che
  // serve per ricordarsi quando si è parlato l'ultima volta.
  const horizon = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      bookingId: bookings.id,
      scheduledFor: bookings.scheduledFor,
      durationMin: sql<number>`coalesce(${bookings.durationMin}, ${services.durationMin}, ${FALLBACK_SESSION_DURATION_MIN})`,
      serviceTitle: services.title,
      clientId: bookings.clientId,
      coachUserId: providerProfiles.userId,
      coachName: profiles.displayName,
      clientName: sql<
        string | null
      >`nullif(trim(concat(${users.name}, ' ', coalesce(${users.lastName}, ''))), '')`,
      clientEmail: users.email,
      status: bookings.status,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .innerJoin(users, eq(bookings.clientId, users.id))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        /*
         * Non solo `accepted`.
         *
         * Prima qui passavano soltanto le sessioni gia' confermate, e una
         * richiesta appena inviata dal web semplicemente non esisteva per
         * l'app: si guardava un elenco vuoto senza alcun indizio del perche'.
         * Una richiesta in attesa e' esattamente la cosa che si vuole
         * controllare dal telefono.
         */
        inArray(bookings.status, ['accepted', 'pending', 'completed']),
        or(
          eq(bookings.clientId, user.id),
          eq(providerProfiles.userId, user.id)
        ),
        // Le richieste senza orario non compaiono: non c'è una chiamata da
        // raggiungere, e in un elenco di «prossime» sarebbero rumore.
        gte(bookings.scheduledFor, horizon)
      )
    )
    .orderBy(desc(bookings.scheduledFor))
    .limit(60);

  const all = rows.map((row) => {
    const viewerIsCoach = row.coachUserId === user.id;
    return {
      bookingId: row.bookingId,
      scheduledFor: row.scheduledFor?.toISOString() ?? null,
      durationMin: Number(row.durationMin),
      title: row.serviceTitle ?? 'Sessione di mental coaching',
      status: row.status,
      viewerIsCoach,
      otherName: viewerIsCoach
        ? row.clientName ?? row.clientEmail
        : row.coachName ?? 'Coach',
    };
  });

  /*
   * Il confine fra «prossime» e «passate» è l'inizio della sessione, con la
   * stessa tolleranza di prima: una sessione cominciata venti minuti fa è
   * ancora una a cui si sta andando, non un ricordo.
   */
  const isUpcoming = (iso: string | null) =>
    iso !== null && new Date(iso).getTime() >= since.getTime();

  return Response.json({
    // Le prossime in ordine di arrivo: la più imminente per prima.
    sessions: all
      .filter((s) => isUpcoming(s.scheduledFor) && s.status !== 'completed')
      .sort((a, b) =>
        (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? '')
      ),
    // Le passate al contrario: la più recente per prima, che è quella che si
    // cerca quando si guarda indietro.
    past: all.filter((s) => !isUpcoming(s.scheduledFor) || s.status === 'completed'),
  });
}
