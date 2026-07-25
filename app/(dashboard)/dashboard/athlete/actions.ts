'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { cancelBooking, createBookingRequest } from '@/lib/core/bookings';
import { parseRomeLocalDateTime } from '@/lib/core/availability';
import { updateClientProfile } from '@/lib/core/profiles';
import { inviteGuardian } from '@/lib/core/guardians';
import { LEGAL_CONTACT_EMAIL } from '@/lib/core/legal/processors';
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
  revalidatePath(`/dashboard/appointments/${bookingId}`);
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
  const serviceId = Number(serviceRaw);
  if (!serviceRaw || !Number.isInteger(serviceId) || serviceId <= 0) {
    return { error: 'Seleziona un servizio valido.' };
  }

  const note = String(formData.get('note') ?? '').trim() || null;

  const whenRaw = String(formData.get('scheduledFor') ?? '').trim();
  let scheduledFor: Date | null = null;
  if (whenRaw) {
    const d = parseRomeLocalDateTime(whenRaw);
    if (!d || Number.isNaN(d.getTime())) return { error: 'Data/ora non valida.' };
    // Small grace so a "now" prefill doesn't fail while the user is submitting.
    if (d.getTime() < Date.now() - 2 * 60 * 1000) {
      return { error: 'Scegli una data/ora futura.' };
    }
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
  return {
    success: 'Richiesta inviata al coach.',
    bookingId: result.bookingId,
  };
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
  const city = String(formData.get('city') ?? '').trim() || null;
  const birthDate = String(formData.get('birthDate') ?? '').trim() || null;

  if (category && category.length > 60) {
    return { error: 'Sport/categoria troppo lungo (max 60 caratteri).' };
  }
  if (level && level.length > 40) {
    return { error: 'Livello troppo lungo (max 40 caratteri).' };
  }
  if (city && city.length > 120) {
    return { error: 'Città troppo lunga (max 120 caratteri).' };
  }
  if (birthDate) {
    const d = new Date(birthDate);
    if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) {
      return { error: 'Data di nascita non valida.' };
    }
  }

  await updateClientProfile(user.id, { category, level, goals, city, birthDate });

  revalidatePath('/dashboard/athlete/profile');
  revalidatePath('/dashboard/coach');
  return { success: 'Profilo aggiornato.' };
}

/**
 * Invites (or re-invites) the athlete's parent/guardian to authorise the path.
 * Only reachable for the athlete themselves — `requireRole` resolves the user,
 * so a minor can never trigger an invitation on someone else's behalf.
 */
export async function inviteGuardianAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('athlete');

  const result = await inviteGuardian({
    athleteUserId: user.id,
    guardianName: String(formData.get('guardianName') ?? ''),
    guardianEmail: String(formData.get('guardianEmail') ?? ''),
    relationship: String(formData.get('relationship') ?? '') || null,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath('/dashboard/athlete');
  return {
    success: result.alreadyConfirmed
      ? `Il tuo percorso è già autorizzato, quindi non abbiamo inviato nulla. Per cambiare il genitore o tutore di riferimento scrivi a ${LEGAL_CONTACT_EMAIL}.`
      : 'Richiesta inviata. Appena il tuo genitore o tutore conferma, potrai prenotare.',
  };
}
