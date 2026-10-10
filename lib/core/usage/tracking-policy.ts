import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientProfiles, userRoles } from '@/lib/db/schema';
import { ageFromBirthDate } from '@/lib/core/guardians/age';
import { isNavigationTrackedFor } from './catalog';

/**
 * Di chi si registra la navigazione. Mai di un amministratore (guarda il sito,
 * non lo usa) e mai di chi è minorenne o di cui non si conosce l'età: per i
 * ragazzi bastano i gesti. Un coach non ha il profilo atleta e conta come adulto
 * (si registra solo da maggiorenne). Il risultato si ricorda dieci minuti.
 */
const trackedMemo = new Map<number, { ok: boolean; expiresAt: number }>();

export async function isNavigationTracked(userId: number, now = Date.now()): Promise<boolean> {
  const cached = trackedMemo.get(userId);
  if (cached && cached.expiresAt > now) return cached.ok;
  const [admin] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(sql`${userRoles.userId} = ${userId} and ${userRoles.roleKey} = 'admin'`)
    .limit(1);
  const [profile] = await db
    .select({ birthDate: clientProfiles.birthDate })
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, userId))
    .limit(1);
  const age = profile ? ageFromBirthDate(profile.birthDate) : null;
  const ok = isNavigationTrackedFor({ isAdmin: Boolean(admin), hasAthleteProfile: Boolean(profile), age });
  trackedMemo.set(userId, { ok, expiresAt: now + 10 * 60_000 });
  return ok;
}

