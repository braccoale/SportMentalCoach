'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  decideBooking,
  completeBooking,
  cancelBooking,
  createCoachBookingRequest,
} from '@/lib/core/bookings';
import { parseRomeLocalDateTime } from '@/lib/core/availability';
import type { ActionState } from '@/lib/auth/middleware';

function revalidateBookings() {
  revalidatePath('/dashboard/coach');
  revalidatePath('/dashboard/coach/calendar');
  revalidatePath('/dashboard/athlete');
  revalidatePath('/dashboard/athlete/calendar');
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

/**
 * Coach-side "Nuovo appuntamento": creates an already-accepted session for an
 * athlete the coach has already worked with (validated against the client id
 * in `createCoachBookingRequest`, which also checks the service ownership).
 */
export async function createCoachBookingAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');

  // `Number('')` and `Number(null)` are both 0, so an integer check alone would
  // let a missing field through and surface as a confusing downstream error.
  const clientUserId = Number(formData.get('clientUserId'));
  if (!Number.isInteger(clientUserId) || clientUserId <= 0) {
    return { error: 'Seleziona un atleta.' };
  }

  const serviceRaw = String(formData.get('serviceId') ?? '').trim();
  const serviceId = serviceRaw ? Number(serviceRaw) : null;
  if (serviceRaw && (!Number.isInteger(serviceId) || serviceId! <= 0)) {
    return { error: 'Servizio non valido.' };
  }

  const note = String(formData.get('note') ?? '').trim() || null;

  const whenRaw = String(formData.get('scheduledFor') ?? '').trim();
  let scheduledFor: Date | null = null;
  if (whenRaw) {
    const d = parseRomeLocalDateTime(whenRaw);
    if (!d || Number.isNaN(d.getTime())) return { error: 'Data/ora non valida.' };
    if (d.getTime() < Date.now() - 2 * 60 * 1000) {
      return { error: 'Scegli una data/ora futura.' };
    }
    scheduledFor = d;
  }

  const result = await createCoachBookingRequest({
    coachUserId: user.id,
    clientUserId,
    serviceId,
    note,
    scheduledFor,
  });
  if (!result.ok) return { error: result.error };

  revalidateBookings();
  return {
    success: 'Sessione creata e atleta avvisato.',
    bookingId: result.bookingId,
  };
}
