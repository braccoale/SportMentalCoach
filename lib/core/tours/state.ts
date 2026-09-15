import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { userProductTours } from '@/lib/db/schema';
import type { TourKey } from './catalog';

/** Se l'utente ha già una riga per questo tour — visto, saltato o
 * completato non fa differenza: in ogni caso non si ripresenta. */
export async function hasSeenTour(
  userId: number,
  tourKey: TourKey
): Promise<boolean> {
  const [row] = await db
    .select({ id: userProductTours.id })
    .from(userProductTours)
    .where(
      and(
        eq(userProductTours.userId, userId),
        eq(userProductTours.tourKey, tourKey)
      )
    )
    .limit(1);
  return !!row;
}

/** Upsert su (userId, tourKey): scritta una sola volta per tour, alla
 * chiusura (avanti fino in fondo, o "Salta"). */
export async function markTourSeen(
  userId: number,
  tourKey: TourKey,
  status: 'seen' | 'skipped' | 'completed'
): Promise<void> {
  const now = new Date();
  await db
    .insert(userProductTours)
    .values({
      userId,
      tourKey,
      status,
      completedAt: status === 'completed' ? now : null,
      createdBy: userId,
      updatedBy: userId,
    })
    .onConflictDoUpdate({
      target: [userProductTours.userId, userProductTours.tourKey],
      set: {
        status,
        completedAt: status === 'completed' ? now : null,
        updatedAt: now,
        updatedBy: userId,
      },
    });
}
