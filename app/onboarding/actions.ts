'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { requireRole } from '@/lib/core/auth';
import {
  getClientProfile,
  updateClientProfile,
  syncDisplayName,
} from '@/lib/core/profiles';
import {
  saveOnboardingStep,
  completeOnboarding,
} from '@/lib/core/onboarding';

export type AthleteOnboardingInput = {
  name?: string;
  lastName?: string;
  city?: string | null;
  category?: string | null;
  level?: string | null;
  /** Selected goal keys, persisted joined into the existing `goals` text field. */
  goals?: string[];
};

/** Updates the account name (users + public display name) when provided. */
async function persistName(
  userId: number,
  name?: string,
  lastName?: string
): Promise<void> {
  const trimmedName = name?.trim();
  const trimmedLast = lastName?.trim();
  if (!trimmedName && !trimmedLast) return;
  await db
    .update(users)
    .set({
      ...(trimmedName ? { name: trimmedName } : {}),
      ...(trimmedLast ? { lastName: trimmedLast } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  await syncDisplayName(userId, `${trimmedName ?? ''} ${trimmedLast ?? ''}`.trim());
}

/** Persists the athlete's wizard fields so far and records the reached step. */
async function persistFields(
  userId: number,
  input: AthleteOnboardingInput
): Promise<void> {
  await persistName(userId, input.name, input.lastName);
  const current = await getClientProfile(userId);
  await updateClientProfile(userId, {
    category: input.category ?? current.category,
    level: input.level ?? current.level,
    goals: input.goals ? input.goals.join(',') : current.goals,
    city: input.city ?? current.city,
    // Birth date is set at signup and must not be changed through the wizard.
    birthDate: current.birthDate,
  });
}

/** Progressive save on "Continua" — never completes onboarding. */
export async function saveAthleteStep(
  input: AthleteOnboardingInput & { step: number }
): Promise<{ ok: true }> {
  const user = await requireRole('athlete');
  await persistFields(user.id, input);
  await saveOnboardingStep(user.id, input.step);
  return { ok: true };
}

/**
 * Final step: persist everything, mark onboarding complete, then leave the
 * wizard. Only name + surname + birth date are truly required (birth date is
 * already present from signup), so this always succeeds for a valid athlete.
 */
export async function completeAthleteOnboarding(
  input: AthleteOnboardingInput
): Promise<never> {
  const user = await requireRole('athlete');
  await persistFields(user.id, input);
  await completeOnboarding(user.id);
  redirect('/coaches');
}
