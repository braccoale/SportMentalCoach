import 'server-only';
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { bookings, services } from '@/lib/db/schema';
import { INTRO_SESSION } from './introduction';

/** The unique partial index makes simultaneous first requests share one service. */
export async function ensureIntroService(providerId: number, userId: number): Promise<number> {
  await db.insert(services).values({
    providerId, ...INTRO_SESSION, isIntro: true, isActive: true, createdBy: userId,
  }).onConflictDoNothing();
  const [service] = await db.select({ id: services.id }).from(services)
    .where(and(eq(services.providerId, providerId), eq(services.isIntro, true))).limit(1);
  if (!service) throw new Error('Sessione conoscitiva non disponibile.');
  return service.id;
}

/**
 * Whether this athlete has already spent (or has in flight) their one free
 * intro session with this coach — the reason a new request is refused.
 *
 * The intro service is one row per coach (`services_provider_intro_unique`),
 * shared by every athlete who books with them; what limits an athlete to one
 * use each is this check, run against their own bookings for that row.
 * `requested`/`accepted` block too, not only `completed`: otherwise an
 * athlete could hold several free intro requests open with the same coach
 * at once before any of them resolves. A late cancellation blocks like a
 * completed session, matching the rest of the booking rules — cancelling
 * close to the start still consumes it.
 */
export async function hasUsedIntroSession(
  providerId: number,
  athleteUserId: number
): Promise<boolean> {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(
      and(
        eq(bookings.providerId, providerId),
        eq(bookings.clientId, athleteUserId),
        eq(services.isIntro, true),
        or(
          inArray(bookings.status, ['requested', 'accepted', 'completed']),
          and(eq(bookings.status, 'cancelled'), eq(bookings.lateCancellation, true))
        )
      )
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Same rule as `hasUsedIntroSession`, batched over every coach shown on the
 * marketplace listing: one query instead of one per card.
 */
export async function usedIntroSessionProviderIds(
  athleteUserId: number,
  providerIds: number[]
): Promise<Set<number>> {
  if (providerIds.length === 0) return new Set();
  const rows = await db
    .select({ providerId: bookings.providerId })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(
      and(
        inArray(bookings.providerId, providerIds),
        eq(bookings.clientId, athleteUserId),
        eq(services.isIntro, true),
        or(
          inArray(bookings.status, ['requested', 'accepted', 'completed']),
          and(eq(bookings.status, 'cancelled'), eq(bookings.lateCancellation, true))
        )
      )
    );
  return new Set(rows.map((r) => r.providerId));
}
