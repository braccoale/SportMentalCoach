'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  updateProviderProfileFields,
  submitProviderForReview,
  setProviderVideoUrl,
} from '@/lib/core/profiles';
import { getCoachOnboarding } from '@/lib/core/onboarding';
import { getActiveSports, getActiveSpecialties } from '@/lib/core/taxonomies';
import { getVerticalConfig } from '@/lib/core/config';
import type { ActionState } from '@/lib/auth/middleware';

const profileSchema = z.object({
  headline: z.string().max(160),
  description: z.string().max(4000),
});

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Splits a free-text list, trims, drops empties, dedupes and caps. */
function parseList(
  raw: string,
  separator: string | RegExp,
  maxItems: number,
  maxLen: number
): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(separator)) {
    const v = part.trim().slice(0, maxLen);
    if (v && !seen.has(v)) seen.add(v);
    if (seen.size >= maxItems) break;
  }
  return [...seen];
}

export async function updateProfileAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');

  const headline = ((formData.get('headline') as string) ?? '').trim();
  const description = ((formData.get('description') as string) ?? '').trim();

  // Whitelist against the DB master data (active keys only).
  const [activeSports, activeSpecialties] = await Promise.all([
    getActiveSports(),
    getActiveSpecialties(),
  ]);
  const sportKeys = new Set(activeSports.map((s) => s.key));
  const specialtyKeys = new Set(activeSpecialties.map((s) => s.key));
  const categories = formData
    .getAll('categories')
    .map(String)
    .filter((k) => sportKeys.has(k));
  const specialties = formData
    .getAll('specialties')
    .map(String)
    .filter((k) => specialtyKeys.has(k));

  const parsed = profileSchema.safeParse({ headline, description });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  // --- trust fields ---
  // "Coach since" date; years of experience are derived from it downstream.
  const coachSinceRaw = ((formData.get('coachSince') as string) ?? '').trim();
  let coachSince: string | null = null;
  if (coachSinceRaw !== '') {
    const d = new Date(coachSinceRaw);
    if (Number.isNaN(d.getTime())) {
      return { error: 'Data “Coach dal” non valida.' };
    }
    if (d.getTime() > Date.now()) {
      return { error: 'La data “Coach dal” non può essere nel futuro.' };
    }
    coachSince = coachSinceRaw;
  }

  const languages = parseList(
    (formData.get('languages') as string) ?? '',
    ',',
    12,
    40
  );
  const certifications = parseList(
    (formData.get('certifications') as string) ?? '',
    /\r?\n/,
    15,
    120
  );

  const allowedLevels = new Set(
    (getVerticalConfig().taxonomies.levels ?? []).map((l) => l.key)
  );
  const athleteLevels = formData
    .getAll('athleteLevels')
    .map(String)
    .filter((k) => allowedLevels.has(k));

  await updateProviderProfileFields(user.id, {
    headline: headline || null,
    description: description || null,
    categories,
    specialties,
    coachSince,
    languages,
    certifications,
    athleteLevels,
  });

  revalidatePath('/dashboard/coach/profile');
  revalidatePath('/coaches');

  return { success: 'Profilo aggiornato.' };
}

const MAX_VIDEO_URL_LENGTH = 2000;

/** Accepts http(s) URLs, or locally uploaded files under /uploads/. */
function isValidVideoUrl(value: string): boolean {
  if (value.length > MAX_VIDEO_URL_LENGTH) return false;
  if (value.startsWith('/uploads/')) return true;
  return isHttpUrl(value);
}

/** Saves (or clears) the coach's presentation video URL. */
export async function updateVideoAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');

  const raw = ((formData.get('videoUrl') as string) ?? '').trim();
  if (raw !== '' && !isValidVideoUrl(raw)) {
    return { error: 'URL video non valido.' };
  }

  await setProviderVideoUrl(user.id, raw === '' ? null : raw);

  revalidatePath('/dashboard/coach/profile');
  revalidatePath('/coaches');

  return { success: raw === '' ? 'Video rimosso.' : 'Video aggiornato.' };
}

export async function submitForReviewAction(_formData: FormData) {
  const user = await requireRole('coach');
  // Do not allow submitting an incomplete profile (defense in depth — the UI
  // also only enables the button when onboarding steps 1–3 are complete).
  const onboarding = await getCoachOnboarding(user.id);
  if (onboarding?.canSubmit) {
    await submitProviderForReview(user.id);
    revalidatePath('/dashboard/coach');
    revalidatePath('/coaches');
  }
}
