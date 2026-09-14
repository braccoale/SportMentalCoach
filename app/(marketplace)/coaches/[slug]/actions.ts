'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { hasRole } from '@/lib/core/auth';
import { createBookingRequest } from '@/lib/core/bookings';
import {
  parseSessionDuration,
  type SessionDurationMin,
} from '@/lib/core/bookings/duration';
import { INTRO_SESSION } from '@/lib/core/services/introduction';
import { parseRomeLocalDateTime } from '@/lib/core/availability';
import { openDirectConversation } from '@/lib/core/messages/direct';
import type { ActionState } from '@/lib/auth/middleware';

const requestSchema = z.object({
  slug: z.string().min(1),
  // Assente quando `introductory` è presente: il servizio-intro è risolto
  // dal server, il client non ne conosce (né sceglie) l'id.
  serviceId: z.string().optional(),
  introductory: z.string().optional(),
  note: z.string().max(1000).optional(),
  // datetime-local string, e.g. "2026-07-01T15:30"
  scheduledFor: z.string().optional(),
});

/** Parses a datetime-local string into a future Date, or returns an error. */
function parseScheduledFor(
  value: string | undefined
): { ok: true; value: Date | null } | { ok: false; error: string } {
  if (!value || value.trim() === '') return { ok: true, value: null };
  const date = parseRomeLocalDateTime(value);
  if (!date || Number.isNaN(date.getTime())) {
    return { ok: false, error: 'Data/ora non valida.' };
  }
  // Small grace so a just-now selection isn't rejected mid-submit.
  if (date.getTime() < Date.now() - 2 * 60 * 1000) {
    return { ok: false, error: 'Scegli una data/ora futura.' };
  }
  return { ok: true, value: date };
}

export async function requestBooking(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getUser();
  if (!user) {
    const slug = formData.get('slug') as string | null;
    redirect(`/sign-in?redirect=/coaches/${slug ?? ''}`);
  }

  const isAthlete = await hasRole(user.id, 'athlete');
  if (!isAthlete) {
    return { error: 'Solo gli atleti possono richiedere una sessione.' };
  }

  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const { slug, serviceId, introductory, note, scheduledFor } = parsed.data;
  const isIntroductory = introductory === 'true';

  let sid = 0;
  let durationMin: SessionDurationMin = INTRO_SESSION.durationMin;
  if (!isIntroductory) {
    sid = Number(serviceId);
    if (!Number.isInteger(sid) || sid <= 0) {
      return { error: 'Seleziona un servizio valido.' };
    }
    const parsedDuration = parseSessionDuration(formData.get('durationMin'));
    if (parsedDuration === null) {
      return { error: 'Scegli una durata per la sessione.' };
    }
    durationMin = parsedDuration;
  }
  // Quando introductory è vero, sid e durationMin restano solo segnaposto:
  // createBookingRequest li ignora e risolve da sé il servizio-intro.

  const when = parseScheduledFor(scheduledFor);
  if (!when.ok) {
    return { error: when.error };
  }

  const result = await createBookingRequest({
    clientUserId: user.id,
    providerSlug: slug,
    serviceId: sid,
    durationMin,
    note: note?.trim() || null,
    scheduledFor: when.value,
    introductory: isIntroductory,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  redirect(`/dashboard/appointments/${result.bookingId}?created=1`);
}

/** Opens (or reuses) the direct chat with a coach and redirects the athlete there. */
export async function openCoachChat(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const slug = formData.get('slug') as string | null;
  const user = await getUser();
  if (!user) {
    redirect(`/sign-in?redirect=/coaches/${slug ?? ''}`);
  }
  if (!slug) return { error: 'Coach non trovato.' };

  const result = await openDirectConversation(user.id, slug);
  if (!result.ok) return { error: result.error };

  redirect(`/dashboard/messages/direct/${result.conversationId}`);
}
