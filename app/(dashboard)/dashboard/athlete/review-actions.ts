'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { createReview } from '@/lib/core/reviews';
import type { ActionState } from '@/lib/auth/middleware';

export async function createReviewAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('athlete');

  const bookingId = Number(formData.get('bookingId'));
  const rating = Number(formData.get('rating'));
  const body = ((formData.get('body') as string) ?? '').trim();
  if (!Number.isInteger(bookingId)) {
    return { error: 'Prenotazione non valida.' };
  }

  const result = await createReview({
    bookingId,
    authorUserId: user.id,
    rating,
    body,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath('/dashboard/athlete');
  return { success: 'Grazie per la recensione!' };
}
