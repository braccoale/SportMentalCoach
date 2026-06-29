import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  coachAvailability,
  providerProfiles,
  type CoachAvailability,
} from '@/lib/db/schema';
import type { Result } from '@/lib/core/result';

export type AvailabilitySlot = Pick<
  CoachAvailability,
  'id' | 'weekday' | 'startMinute' | 'endMinute'
>;

const slotColumns = {
  id: coachAvailability.id,
  weekday: coachAvailability.weekday,
  startMinute: coachAvailability.startMinute,
  endMinute: coachAvailability.endMinute,
};

async function resolveProviderId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, userId))
    .limit(1);
  return row?.id ?? null;
}

/** A coach's weekly availability (by user id), ordered weekday → start. */
export async function getCoachAvailability(
  userId: number
): Promise<AvailabilitySlot[]> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return [];
  return db
    .select(slotColumns)
    .from(coachAvailability)
    .where(eq(coachAvailability.providerId, providerId))
    .orderBy(asc(coachAvailability.weekday), asc(coachAvailability.startMinute));
}

/** Public availability for an approved coach by slug (empty if not approved). */
export async function getApprovedCoachAvailabilityBySlug(
  slug: string
): Promise<AvailabilitySlot[]> {
  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(
      and(eq(providerProfiles.slug, slug), eq(providerProfiles.status, 'approved'))
    )
    .limit(1);
  if (!provider) return [];
  return db
    .select(slotColumns)
    .from(coachAvailability)
    .where(eq(coachAvailability.providerId, provider.id))
    .orderBy(asc(coachAvailability.weekday), asc(coachAvailability.startMinute));
}

export type AvailabilityInput = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

/** Adds a weekly slot for the coach. Ownership + range validated. */
export async function addAvailabilitySlot(
  userId: number,
  input: AvailabilityInput
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  const { weekday, startMinute, endMinute } = input;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { ok: false, error: 'Giorno non valido.' };
  }
  if (
    ![startMinute, endMinute].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 1440
    )
  ) {
    return { ok: false, error: 'Orario non valido.' };
  }
  if (endMinute <= startMinute) {
    return { ok: false, error: 'L’orario di fine deve essere dopo l’inizio.' };
  }

  const [created] = await db
    .insert(coachAvailability)
    .values({ providerId, weekday, startMinute, endMinute })
    .onConflictDoNothing()
    .returning({ id: coachAvailability.id });

  if (!created) {
    return {
      ok: false,
      error: 'Esiste già una fascia con questo orario di inizio in quel giorno.',
    };
  }
  return { ok: true };
}

/** Deletes one of the coach's own slots. */
export async function deleteAvailabilitySlot(
  userId: number,
  slotId: number
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  const [deleted] = await db
    .delete(coachAvailability)
    .where(
      and(
        eq(coachAvailability.id, slotId),
        eq(coachAvailability.providerId, providerId)
      )
    )
    .returning({ id: coachAvailability.id });

  if (!deleted) return { ok: false, error: 'Fascia non trovata.' };
  return { ok: true };
}
