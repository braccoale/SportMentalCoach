'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { replyToReview } from '@/lib/core/reviews';
import type { ActionState } from '@/lib/auth/middleware';

export async function replyToReviewAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');
  const reviewId = Number(formData.get('reviewId'));
  const reply = ((formData.get('reply') as string) ?? '').trim();
  if (!Number.isInteger(reviewId)) {
    return { error: 'Recensione non valida.' };
  }

  const result = await replyToReview({
    reviewId,
    coachUserId: user.id,
    reply,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath('/dashboard/coach');
  revalidatePath('/coaches'); // the reply is public on the profile
  return { success: 'Risposta pubblicata.' };
}
