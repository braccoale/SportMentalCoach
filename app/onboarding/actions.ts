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
  getCoachOnboarding,
} from '@/lib/core/onboarding';
import { revalidatePath } from 'next/cache';
import { getAvatarUrl } from '@/lib/core/profiles';
import { createCoachService, getCoachServices, updateCoachService } from '@/lib/core/services';
import { addAvailabilitySlot, getCoachAvailability } from '@/lib/core/availability';
import { slotsToAdd } from '@/lib/core/onboarding/coach-wizard';
import {
  COMPLETENESS_LEVEL_LABEL,
  computeProfileCompleteness,
} from '@/lib/core/coach-profile/completeness';

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
  /** «Coach dal» (YYYY-MM-DD), calcolato dagli anni di esperienza dichiarati. */
  coachSince?: string | null;
  certifications?: string[];
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
    coachSince: input.coachSince !== undefined ? input.coachSince : p?.coachSince ?? null,
    yearsExperience: input.yearsExperience ?? p?.yearsExperience ?? null,
    languages: input.languages ?? p?.languages ?? [],
    certifications: input.certifications ?? p?.certifications ?? [],
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
 * `submitForReview` optionally sends the profile to the admin queue, ma solo se
 * il server lo consente: profilo, foto, sport e specializzazioni, servizio. Il
 * pulsante nel browser non basta, e il wizard non pubblica mai da solo.
 */
export async function completeCoachOnboarding(
  input: CoachOnboardingInput & { submitForReview?: boolean }
): Promise<{ ok: false; error: string } | never> {
  const user = await requireRole('coach');
  await persistCoachFields(user.id, input);
  if (input.submitForReview) {
    const onboarding = await getCoachOnboarding(user.id);
    if (!onboarding?.canSubmit) {
      const missing = (onboarding?.steps ?? [])
        .filter((s) => s.key !== 'submit' && !s.done)
        .map((s) => s.label.toLowerCase());
      return {
        ok: false,
        error: missing.length
          ? `Per inviare il profilo manca: ${missing.join(', ')}.`
          : 'Il profilo non si può inviare in questo momento.',
      };
    }
    await submitProviderForReview(user.id);
  }
  await completeOnboarding(user.id);
  redirect('/dashboard/coach');
}

/** Applica i modelli di orario scelti, saltando le fasce che il coach ha già. */
export async function applyAvailabilityPresets(
  presetKeys: string[]
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const user = await requireRole('coach');
  const existing = await getCoachAvailability(user.id);
  const toAdd = slotsToAdd(
    existing.map((s) => ({ weekday: s.weekday, startMinute: s.startMinute, endMinute: s.endMinute })),
    presetKeys.filter((k) => typeof k === 'string').slice(0, 5)
  );
  let added = 0;
  for (const slot of toAdd) {
    const result = await addAvailabilitySlot(user.id, slot);
    if (!result.ok) return { ok: false, error: result.error };
    added += 1;
  }
  revalidatePath('/dashboard/coach');
  revalidatePath('/coaches');
  return { ok: true, added };
}

export type WizardService = { id: number; title: string; durationMin: number; price: number | null };

/**
 * Crea o aggiorna il servizio principale dal wizard. Con `id` modifica quello
 * del coach (e ne conserva la descrizione: la modifica generica la azzererebbe);
 * senza, ne crea uno. Stesse regole della pagina dei servizi.
 */
export async function saveWizardService(input: {
  id?: number | null;
  title: string;
  durationMin: number;
  priceEuro: number | null;
}): Promise<{ ok: true; service: WizardService } | { ok: false; error: string }> {
  const user = await requireRole('coach');
  const title = String(input.title ?? '').trim();
  if (!title) return { ok: false, error: 'Dai un nome al servizio.' };
  if (title.length > 160) return { ok: false, error: 'Il nome è troppo lungo.' };
  const durationMin = Math.trunc(Number(input.durationMin));
  if (!Number.isFinite(durationMin) || durationMin < 1 || durationMin > 1440) {
    return { ok: false, error: 'Inserisci una durata valida in minuti.' };
  }
  let price: number | null = null;
  if (input.priceEuro != null) {
    const euros = Number(input.priceEuro);
    if (!Number.isFinite(euros) || euros < 0 || euros > 1_000_000) {
      return { ok: false, error: 'Il prezzo non è valido.' };
    }
    price = Math.round(euros * 100);
  }

  let id: number;
  if (input.id) {
    const current = (await getCoachServices(user.id)).find((s) => s.id === input.id && !s.isIntro);
    if (!current) return { ok: false, error: 'Servizio non trovato.' };
    const result = await updateCoachService(user.id, current.id, {
      title,
      durationMin,
      price,
      description: current.description,
    });
    if (!result.ok) return { ok: false, error: result.error };
    id = current.id;
  } else {
    const result = await createCoachService(user.id, { title, durationMin, price });
    if (!result.ok) return { ok: false, error: result.error };
    id = result.id;
  }
  revalidatePath('/dashboard/coach/services');
  revalidatePath('/dashboard/coach');
  revalidatePath('/coaches');
  return { ok: true, service: { id, title, durationMin, price } };
}

export type CoachWizardSummary = {
  name: string;
  headline: string | null;
  avatarUrl: string | null;
  score: number;
  levelLabel: string;
  /** Cosa manca per poter inviare il profilo (vuoto = si può inviare). */
  blockers: string[];
  canSubmit: boolean;
  /** I passi più utili ancora da fare, per il punteggio (non bloccano l'invio). */
  suggestions: { key: string; label: string; hint: string }[];
};

/** Il riepilogo dell'ultimo passo: com'è il profilo adesso e cosa serve per inviarlo. */
export async function getCoachWizardSummary(): Promise<CoachWizardSummary> {
  const user = await requireRole('coach');
  const [provider, services, availability, avatarUrl, onboarding] = await Promise.all([
    getProviderProfileByUser(user.id),
    getCoachServices(user.id),
    getCoachAvailability(user.id),
    getAvatarUrl(user.id),
    getCoachOnboarding(user.id),
  ]);
  const active = services.filter((s) => s.isActive && (s.durationMin ?? 0) > 0);
  const completeness = computeProfileCompleteness({
    hasPhoto: !!avatarUrl,
    headline: provider?.headline ?? null,
    description: provider?.description ?? null,
    categories: provider?.categories ?? null,
    specialties: provider?.specialties ?? null,
    athleteLevels: provider?.athleteLevels ?? null,
    languages: provider?.languages ?? null,
    coachSince: provider?.coachSince ?? null,
    yearsExperience: provider?.yearsExperience ?? null,
    certifications: provider?.certifications ?? null,
    hasVideo: !!provider?.videoUrl,
    hasService: active.length > 0,
    hasPricedService: active.some((s) => (s.price ?? 0) > 0),
    hasAvailability: availability.length > 0,
  });
  return {
    name: [user.name, user.lastName].filter(Boolean).join(' '),
    headline: provider?.headline ?? null,
    avatarUrl,
    score: completeness.score,
    levelLabel: COMPLETENESS_LEVEL_LABEL[completeness.level],
    blockers: (onboarding?.steps ?? []).filter((s) => s.key !== 'submit' && !s.done).map((s) => s.label),
    canSubmit: !!onboarding?.canSubmit,
    suggestions: completeness.nextSteps.map((i) => ({ key: i.key, label: i.label, hint: i.hint })),
  };
}
