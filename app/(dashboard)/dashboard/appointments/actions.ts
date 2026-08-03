'use server';

import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/lib/auth/middleware';
import { parseRomeLocalDateTime } from '@/lib/core/availability';
import { rescheduleBooking } from '@/lib/core/bookings';
import { getUser } from '@/lib/db/queries';

export async function rescheduleBookingAction(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getUser();
  if (!user) return { error: 'Accedi per modificare la prenotazione.' };

  const bookingId = Number(formData.get('bookingId'));
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return { error: 'Prenotazione non valida.' };
  }

  const scheduledForRaw = String(formData.get('scheduledFor') ?? '').trim();
  const scheduledFor = parseRomeLocalDateTime(scheduledForRaw);
  if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) {
    return { error: 'Seleziona una data e un orario validi.' };
  }

  const result = await rescheduleBooking({
    bookingId,
    userId: user.id,
    scheduledFor,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath('/dashboard/athlete');
  revalidatePath('/dashboard/athlete/calendar');
  revalidatePath('/dashboard/coach');
  revalidatePath('/dashboard/coach/calendar');
  revalidatePath(`/dashboard/appointments/${bookingId}`);
  return { success: 'Appuntamento modificato.' };
}
