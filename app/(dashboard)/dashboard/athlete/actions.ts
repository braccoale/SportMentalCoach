'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { cancelBooking, createBookingRequest } from '@/lib/core/bookings';
import { parseSessionDuration } from '@/lib/core/bookings/duration';
import { parseRomeLocalDateTime } from '@/lib/core/availability';
import { updateClientProfile } from '@/lib/core/profiles';
import { inviteGuardian } from '@/lib/core/guardians';
import { LEGAL_CONTACT_EMAIL } from '@/lib/core/legal/processors';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';
import { submitAthleteCommitmentOutcome } from '@/lib/core/ai-session-notes/athlete-commitments';
import { SessionCommitmentError } from '@/lib/core/ai-session-notes/session-commitments';
import type { ActionState } from '@/lib/auth/middleware';

export async function cancelBookingAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('athlete');
  const bookingId = Number(formData.get('bookingId'));
  if (!Number.isInteger(bookingId)) return { error: 'Prenotazione non valida.' };

  const dependencies = createProductionAiSessionNotesDependencies();
  const result = await cancelBooking(
    { bookingId, userId: user.id },
    dependencies.liveKit
  );
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

  const durationMin = parseSessionDuration(formData.get('durationMin'));
  if (durationMin === null) {
    return { error: 'Scegli una durata per la sessione.' };
  }

  const note = String(formData.get('note') ?? '').trim() || null;

  // "Avvia sessione ora": l'orario è quello del server, non uno slot scelto.
  const startingNow = String(formData.get('startNow') ?? '') === '1';

  let scheduledFor: Date | null = null;
  if (startingNow) {
    scheduledFor = new Date();
  } else {
    const whenRaw = String(formData.get('scheduledFor') ?? '').trim();
    if (whenRaw) {
      const d = parseRomeLocalDateTime(whenRaw);
      if (!d || Number.isNaN(d.getTime()))
        return { error: 'Data/ora non valida.' };
      // Small grace so a "now" prefill doesn't fail while the user is submitting.
      if (d.getTime() < Date.now() - 2 * 60 * 1000) {
        return { error: 'Scegli una data/ora futura.' };
      }
      scheduledFor = d;
    }
  }

  const result = await createBookingRequest({
    clientUserId: user.id,
    providerSlug: slug,
    serviceId,
    durationMin,
    note,
    scheduledFor,
    startingNow,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath('/dashboard/athlete');
  revalidatePath('/dashboard/athlete/calendar');
  revalidatePath('/dashboard/coach');
  return {
    success: startingNow
      ? 'Chiamata avviata: stiamo aprendo la stanza.'
      : 'Richiesta inviata al coach.',
    bookingId: result.bookingId,
    startedNow: startingNow,
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

/**
 * L'atleta dichiara l'esito di un impegno concordato in sessione. Può agire
 * solo sugli impegni di cui è owner: la verifica avviene nel dominio, a
 * partire dall'utente autenticato e mai da un id passato dal client.
 */
export async function updateCommitmentOutcomeAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('athlete');
  const commitmentId = Number(formData.get('commitmentId'));
  const status = String(formData.get('status') ?? '');
  if (!Number.isInteger(commitmentId) || commitmentId <= 0) {
    return { error: 'Impegno non valido.' };
  }
  if (status !== 'completed' && status !== 'skipped') {
    return { error: 'Esito non valido.' };
  }

  try {
    await submitAthleteCommitmentOutcome({
      commitmentId,
      actorUserId: user.id,
      status,
      note: String(formData.get('note') ?? ''),
    });
  } catch (error) {
    return {
      error:
        error instanceof SessionCommitmentError
          ? error.message
          : 'Non è stato possibile aggiornare l’impegno.',
    };
  }

  revalidatePath('/dashboard/athlete');
  return {
    success:
      status === 'completed' ? 'Impegno segnato come completato.' : 'Grazie, ne parlerai col coach.',
  };
}
