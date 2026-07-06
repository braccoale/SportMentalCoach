'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { cancelBooking, createBookingRequest } from '@/lib/core/bookings';
import { updateClientProfile } from '@/lib/core/profiles';
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
  revalidatePath('/dashboard/athlete/calendar');
  revalidatePath('/dashboard/coach');
  revalidatePath('/dashboard/coach/calendar');
  return { success: 'Prenotazione annullata.' };
}

/**
 * Quick re-book from the athlete dashboard: create a request for a coach the
 * athlete already knows (validated against the coach slug in
 * `createBookingRequest`, which also checks the service belongs to that coach).
 */
export async function createBookingRequestAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('athlete');

  const slug = String(formData.get('coachSlug') ?? '').trim();
  if (!slug) return { error: 'Seleziona un coach.' };

  const serviceRaw = String(formData.get('serviceId') ?? '').trim();
  const serviceId = serviceRaw ? Number(serviceRaw) : null;
  if (serviceRaw && !Number.isInteger(serviceId)) {
    return { error: 'Servizio non valido.' };
  }

  const note = String(formData.get('note') ?? '').trim() || null;

  const whenRaw = String(formData.get('scheduledFor') ?? '').trim();
  let scheduledFor: Date | null = null;
  if (whenRaw) {
    const d = new Date(whenRaw);
    if (Number.isNaN(d.getTime())) return { error: 'Data/ora non valida.' };
    if (d.getTime() < Date.now()) return { error: 'Scegli una data/ora futura.' };
    scheduledFor = d;
  }

  const result = await createBookingRequest({
    clientUserId: user.id,
    providerSlug: slug,
    serviceId,
    note,
    scheduledFor,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath('/dashboard/athlete');
  revalidatePath('/dashboard/athlete/calendar');
  revalidatePath('/dashboard/coach');
  return { success: 'Richiesta inviata al coach.' };
}

/** Updates the athlete's sport profile (category/level/goals). */
export async function updateAthleteProfileAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('athlete');

  const category = String(formData.get('category') ?? '').trim() || null;
  const level = String(formData.get('level') ?? '').trim() || null;
  const goals = String(formData.get('goals') ?? '').trim() || null;

  if (category && category.length > 60) {
    return { error: 'Sport/categoria troppo lungo (max 60 caratteri).' };
  }
  if (level && level.length > 40) {
    return { error: 'Livello troppo lungo (max 40 caratteri).' };
  }

  await updateClientProfile(user.id, { category, level, goals });

  revalidatePath('/dashboard/athlete/profile');
  revalidatePath('/dashboard/coach');
  return { success: 'Profilo aggiornato.' };
}
