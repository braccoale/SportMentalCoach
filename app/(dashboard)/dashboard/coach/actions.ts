'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  decideBooking,
  completeBooking,
  cancelBooking,
} from '@/lib/core/bookings';
import type { ActionState } from '@/lib/auth/middleware';

function revalidateBookings() {
  revalidatePath('/dashboard/coach');
  revalidatePath('/dashboard/athlete');
}

async function decide(
  formData: FormData,
  decision: 'accepted' | 'declined'
): Promise<ActionState> {
  const user = await requireRole('coach');
  const bookingId = Number(formData.get('bookingId'));
  if (!Number.isInteger(bookingId)) {
    return { error: 'Richiesta non valida.' };
  }

  const result = await decideBooking({
    bookingId,
    coachUserId: user.id,
    decision,
  });
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath('/dashboard/coach');
  return {
    success:
      decision === 'accepted' ? 'Richiesta accettata.' : 'Richiesta rifiutata.',
  };
}

export async function acceptBookingAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  return decide(formData, 'accepted');
}

export async function declineBookingAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  return decide(formData, 'declined');
}

export async function completeBookingAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');
  const bookingId = Number(formData.get('bookingId'));
  if (!Number.isInteger(bookingId)) return { error: 'Richiesta non valida.' };

  const result = await completeBooking({ bookingId, coachUserId: user.id });
  if (!result.ok) return { error: result.error };

  revalidateBookings();
  return { success: 'Sessione completata.' };
}

export async function cancelBookingAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');
  const bookingId = Number(formData.get('bookingId'));
  if (!Number.isInteger(bookingId)) return { error: 'Richiesta non valida.' };

  const result = await cancelBooking({ bookingId, userId: user.id });
  if (!result.ok) return { error: result.error };

  revalidateBookings();
  return { success: 'Prenotazione annullata.' };
}
