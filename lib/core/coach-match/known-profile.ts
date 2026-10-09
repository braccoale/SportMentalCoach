import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientProfiles } from '@/lib/db/schema';

export type KnownAthleteProfile = { sport: string | null; level: string | null };

/** Sport e livello già dichiarati dall'atleta: il wizard non li richiede di nuovo. */
export async function getKnownAthleteProfile(userId: number): Promise<KnownAthleteProfile | null> {
  const [profile] = await db
    .select({ category: clientProfiles.category, level: clientProfiles.level })
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, userId))
    .limit(1);
  return profile ? { sport: profile.category, level: profile.level } : null;
}
