import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { services, providerProfiles, type Service } from '@/lib/db/schema';
import type { Result } from '@/lib/core/result';

async function resolveProviderId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, userId))
    .limit(1);
  return row?.id ?? null;
}

export type ServiceInput = {
  title: string;
  description?: string | null;
  durationMin?: number | null;
  price?: number | null; // cents
};

/** Active + inactive services owned by a coach (by user id). */
export async function getCoachServices(userId: number): Promise<Service[]> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return [];
  return db
    .select()
    .from(services)
    .where(eq(services.providerId, providerId))
    .orderBy(asc(services.id));
}

export async function createCoachService(
  userId: number,
  input: ServiceInput
): Promise<Result<{ id: number }>> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };
  if (!input.title?.trim()) return { ok: false, error: 'Il titolo è obbligatorio.' };

  const [created] = await db
    .insert(services)
    .values({
      providerId,
      title: input.title.trim(),
      description: input.description ?? null,
      durationMin: input.durationMin ?? null,
      price: input.price ?? null,
    })
    .returning({ id: services.id });

  return { ok: true, id: created.id };
}

export async function updateCoachService(
  userId: number,
  serviceId: number,
  input: ServiceInput
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };
  if (!input.title?.trim()) return { ok: false, error: 'Il titolo è obbligatorio.' };

  const [updated] = await db
    .update(services)
    .set({
      title: input.title.trim(),
      description: input.description ?? null,
      durationMin: input.durationMin ?? null,
      price: input.price ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(services.id, serviceId), eq(services.providerId, providerId)))
    .returning({ id: services.id });

  if (!updated) return { ok: false, error: 'Servizio non trovato.' };
  return { ok: true };
}

export async function deleteCoachService(
  userId: number,
  serviceId: number
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  const [deleted] = await db
    .delete(services)
    .where(and(eq(services.id, serviceId), eq(services.providerId, providerId)))
    .returning({ id: services.id });

  if (!deleted) return { ok: false, error: 'Servizio non trovato.' };
  return { ok: true };
}
