'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { cancelBooking } from '@/lib/core/bookings';
import type { ActionState } from '@/lib/auth/middleware';

export async function cancelBookingAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('athlete');
  const bookingId = Number(formData.get('bookingId'));
  if (!Number.isInteger(bookingId)) return { error: 'Prenotazione non valida.' };

  const result = await cancelBooking({ bookingId, userId: user.id });
  if (!result.ok) return { error: result.error };

  revalidatePath('/dashboard/athlete');
  revalidatePath('/dashboard/coach');
  return { success: 'Prenotazione annullata.' };
}
