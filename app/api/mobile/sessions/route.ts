import { and, asc, eq, gte, or, sql } from 'drizzle-orm';
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
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .innerJoin(users, eq(bookings.clientId, users.id))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        eq(bookings.status, 'accepted'),
        or(
          eq(bookings.clientId, user.id),
          eq(providerProfiles.userId, user.id)
        ),
        // Le richieste senza orario non compaiono: non c'è una chiamata da
        // raggiungere, e in un elenco di «prossime» sarebbero rumore.
        gte(bookings.scheduledFor, since)
      )
    )
    .orderBy(asc(bookings.scheduledFor))
    .limit(20);

  const sessions = rows.map((row) => {
    const viewerIsCoach = row.coachUserId === user.id;
    return {
      bookingId: row.bookingId,
      scheduledFor: row.scheduledFor?.toISOString() ?? null,
      durationMin: Number(row.durationMin),
      title: row.serviceTitle ?? 'Sessione di mental coaching',
      viewerIsCoach,
      otherName: viewerIsCoach
        ? row.clientName ?? row.clientEmail
        : row.coachName ?? 'Coach',
    };
  });

  return Response.json({ sessions });
}
