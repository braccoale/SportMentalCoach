import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { favorites, providerProfiles } from '@/lib/db/schema';

/** Toggles a coach in the user's favourites. Returns the new state. */
export async function toggleFavorite(
  userId: number,
  providerId: number
): Promise<{ favorited: boolean }> {
  // Ignore invalid/non-existent providers defensively.
  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.id, providerId))
    .limit(1);
  if (!provider) return { favorited: false };

  const [existing] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(
      and(eq(favorites.userId, userId), eq(favorites.providerId, providerId))
    )
    .limit(1);

  if (existing) {
    await db.delete(favorites).where(eq(favorites.id, existing.id));
    return { favorited: false };
  }

  await db
    .insert(favorites)
    .values({ userId, providerId, createdBy: userId })
    .onConflictDoNothing();
  return { favorited: true };
}

/** Provider ids the user has favourited (for filling card state). */
export async function getFavoriteProviderIds(
  userId: number
): Promise<Set<number>> {
  const rows = await db
    .select({ providerId: favorites.providerId })
    .from(favorites)
    .where(eq(favorites.userId, userId));
  return new Set(rows.map((r) => r.providerId));
}
