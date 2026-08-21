import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { profiles } from '@/lib/db/schema';
import type { Locale } from '@/lib/i18n/locales';

/** Reads the persisted UI locale from the user's common profile. */
export async function getProfileLocale(userId: number): Promise<string | null> {
  const [row] = await db
    .select({ locale: profiles.locale })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return row?.locale ?? null;
}

/**
 * Atomically creates or updates the authenticated user's locale preference.
 * Authorization belongs to the calling server action; this helper never
 * accepts an arbitrary target from browser input.
 */
export async function setProfileLocale(
  userId: number,
  locale: Locale
): Promise<void> {
  await db
    .insert(profiles)
    .values({
      userId,
      locale,
      createdBy: userId,
      updatedBy: userId,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { locale, updatedAt: new Date(), updatedBy: userId },
    });
}
