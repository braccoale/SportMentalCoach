'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  updateProviderProfileFields,
  submitProviderForReview,
} from '@/lib/core/profiles';
import { getCoachOnboarding } from '@/lib/core/onboarding';
import type { ActionState } from '@/lib/auth/middleware';

const profileSchema = z.object({
  headline: z.string().max(160),
  description: z.string().max(4000),
});

export async function updateProfileAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');

  const headline = ((formData.get('headline') as string) ?? '').trim();
  const description = ((formData.get('description') as string) ?? '').trim();
  const categories = formData.getAll('categories').map(String);
  const specialties = formData.getAll('specialties').map(String);

  const parsed = profileSchema.safeParse({ headline, description });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  await updateProviderProfileFields(user.id, {
    headline: headline || null,
    description: description || null,
    categories,
    specialties,
  });

  revalidatePath('/dashboard/coach');
  revalidatePath('/coaches');

  return { success: 'Profilo aggiornato.' };
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
