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
  getProviderProfileByUser,
  updateProviderProfileFields,
  submitProviderForReview,
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

// --- Coach wizard ----------------------------------------------------------

export type CoachOnboardingInput = {
  name?: string;
  lastName?: string;
  headline?: string | null;
  description?: string | null;
  yearsExperience?: number | null;
  languages?: string[];
  categories?: string[];
  specialties?: string[];
  athleteLevels?: string[];
};

/**
 * Merges the wizard fields into the coach's provider profile without clearing
 * the ones this call didn't touch (progressive save). Never changes the review
 * status — publication stays a separate, explicit action.
 */
async function persistCoachFields(
  userId: number,
  input: CoachOnboardingInput
): Promise<void> {
  await persistName(userId, input.name, input.lastName);
  const p = await getProviderProfileByUser(userId);
  await updateProviderProfileFields(userId, {
    headline: input.headline ?? p?.headline ?? null,
    description: input.description ?? p?.description ?? null,
    categories: input.categories ?? p?.categories ?? [],
    specialties: input.specialties ?? p?.specialties ?? [],
    videoUrl: p?.videoUrl ?? null,
    coachSince: p?.coachSince ?? null,
    yearsExperience: input.yearsExperience ?? p?.yearsExperience ?? null,
    languages: input.languages ?? p?.languages ?? [],
    certifications: p?.certifications ?? [],
    athleteLevels: input.athleteLevels ?? p?.athleteLevels ?? [],
  });
}

export async function saveCoachStep(
  input: CoachOnboardingInput & { step: number }
): Promise<{ ok: true }> {
  const user = await requireRole('coach');
  await persistCoachFields(user.id, input);
  await saveOnboardingStep(user.id, input.step);
  return { ok: true };
}

/**
 * Completes the coach wizard (dashboard access needs only name + surname).
 * `submitForReview` optionally sends the profile to the admin queue — but only
 * the existing server gate decides eligibility; the wizard never auto-publishes.
 */
export async function completeCoachOnboarding(
  input: CoachOnboardingInput & { submitForReview?: boolean }
): Promise<never> {
  const user = await requireRole('coach');
  await persistCoachFields(user.id, input);
  if (input.submitForReview) {
    await submitProviderForReview(user.id);
  }
  await completeOnboarding(user.id);
  redirect('/dashboard/coach');
}
