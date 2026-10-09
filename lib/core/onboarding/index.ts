import 'server-only';
import { and, count, eq, gt, lte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { profiles, providerProfiles, services } from '@/lib/db/schema';
import { MAX_SERVICE_DURATION_MIN } from '@/lib/core/services/validation';
import { computeCoachOnboarding, type CoachOnboarding } from './compute';

export * from './state';
export * from './compute';

/**
 * Derives the coach's onboarding progress from existing data — no extra
 * columns. Step completion:
 *  1. profile     → headline + description present
 *  2. taxonomies  → at least one sport and one specialty
 *  3. services    → at least one active service with a valid duration
 *  4. submit      → status is no longer `draft` (submitted for review)
 */
export async function getCoachOnboarding(
  userId: number
): Promise<CoachOnboarding | null> {
  const [provider] = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, userId))
    .limit(1);
  if (!provider) return null;

  const [{ value: serviceCount }] = await db
    .select({ value: count() })
    .from(services)
    .where(
      and(
        eq(services.providerId, provider.id),
        eq(services.isActive, true),
        gt(services.durationMin, 0),
        lte(services.durationMin, MAX_SERVICE_DURATION_MIN)
      )
    );

  const [photo] = await db
    .select({ avatarUrl: profiles.avatarUrl })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  return computeCoachOnboarding(provider, serviceCount, !!photo?.avatarUrl);
}

