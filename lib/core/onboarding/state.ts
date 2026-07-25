import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  userOnboarding,
  type OnboardingStatus,
} from '@/lib/db/schema';

export { onboardingRedirectFor } from './routing';

/**
 * Server-owned onboarding state (see `user_onboarding`). All writes go through
 * here; the client can never set these values directly. `status` is the single
 * source of truth used by the central post-auth router.
 */

export type OnboardingState = {
  status: OnboardingStatus;
  step: number;
  completedAt: Date | null;
};

/** Creates the onboarding row for a new user (no-op if it already exists). */
export async function ensureOnboarding(
  userId: number,
  status: OnboardingStatus,
  exec: DbOrTx = db
): Promise<void> {
  await exec
    .insert(userOnboarding)
    .values({ userId, status, createdBy: userId })
    .onConflictDoNothing({ target: userOnboarding.userId });
}

export async function getOnboardingState(
  userId: number
): Promise<OnboardingState | null> {
  const [row] = await db
    .select({
      status: userOnboarding.status,
      step: userOnboarding.step,
      completedAt: userOnboarding.completedAt,
    })
    .from(userOnboarding)
    .where(eq(userOnboarding.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    status: row.status as OnboardingStatus,
    step: row.step,
    completedAt: row.completedAt,
  };
}

/** Persists the furthest step reached (monotonic — never moves backwards). */
export async function saveOnboardingStep(
  userId: number,
  step: number
): Promise<void> {
  await db
    .update(userOnboarding)
    .set({
      step: sql`greatest(${userOnboarding.step}, ${step})`,
      status: sql`case when ${userOnboarding.status} = 'not_started' then 'in_progress' else ${userOnboarding.status} end`,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(userOnboarding.userId, userId));
}

export async function completeOnboarding(userId: number): Promise<void> {
  await db
    .update(userOnboarding)
    .set({
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(userOnboarding.userId, userId));
}
