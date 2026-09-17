import 'server-only';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { providerProfiles, users } from '@/lib/db/schema';
import { assertAdmin } from '@/lib/core/features';

export type CoachOption = { userId: number; displayName: string; email: string };

function displayName(row: {
  name: string | null;
  lastName: string | null;
  email: string;
}): string {
  return [row.name, row.lastName].filter(Boolean).join(' ') || row.email;
}

/** Ogni coach con profilo approvato — candidati a docente o a partecipante. */
export async function listApprovedCoaches(actorUserId: number): Promise<CoachOption[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      lastName: users.lastName,
    })
    .from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(
      and(
        eq(providerProfiles.status, 'approved'),
        isNull(users.deletedAt),
        eq(users.isDemo, false)
      )
    )
    .orderBy(asc(users.email));
  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    displayName: displayName(row),
  }));
}

/**
 * Vero solo per un coach reale: profilo approvato, non cancellato, non
 * demo. Usata per validare sul server un id ricevuto da un form — un campo
 * nascosto non è una fonte attendibile di idoneità.
 */
export async function isEligibleCoach(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(
      and(
        eq(providerProfiles.userId, userId),
        eq(providerProfiles.status, 'approved'),
        isNull(users.deletedAt),
        eq(users.isDemo, false)
      )
    )
    .limit(1);
  return Boolean(row);
}
