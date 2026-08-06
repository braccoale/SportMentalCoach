'use server';

import { getUser } from '@/lib/db/queries';
import { getAppBaseUrl } from '@/lib/core/app-url';
import { createGuestInviteToken } from '@/lib/core/video';
import { getBookingChatContext } from '@/lib/core/messages';
import { canParticipateInSessions } from '@/lib/core/guardians';
import { isSessionJoinable } from '@/lib/core/sessions';

type GuestLinkResult =
  | { ok: true; url: string; expiresAt: string }
  | { ok: false; error: string };

type AthleteCallLinkResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const ERROR_BY_REASON = {
  unauthorized: 'Sessione non trovata o non autorizzata.',
  closed: 'Puoi invitare un ospite solo a una sessione confermata.',
  past: 'Questa sessione è già trascorsa.',
  not_configured: 'La funzione video non è configurata.',
  guardian_required:
    'La sessione è bloccata: manca un’autorizzazione valida del tutore.',
} as const;

/**
 * Generates a signed guest invitation for either booking participant.
 * The shared URL never contains a LiveKit credential; the guest exchanges it
 * for a short-lived room token only when the call window is open.
 */
export async function createGuestInviteLink(
  bookingId: number
): Promise<GuestLinkResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Accedi per condividere la chiamata.' };
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return { ok: false, error: 'Sessione non valida.' };
  }

  const baseUrl = getAppBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      error: 'Indirizzo pubblico di KaiPai non configurato.',
    };
  }

  const result = await createGuestInviteToken(bookingId, user.id);
  if (!result.ok) {
    return { ok: false, error: ERROR_BY_REASON[result.reason] };
  }

  const url = new URL('/video/join', baseUrl);
  url.searchParams.set('invite', result.token);
  return {
    ok: true,
    url: url.toString(),
    expiresAt: result.expiresAt.toISOString(),
  };
}

/**
 * Builds the athlete's ordinary, authenticated room URL for a coach to send
 * again when a connection drops. Unlike a guest invite, this URL contains no
 * bearer credential: the athlete still has to authenticate and pass the
 * server-side participant, time-window and guardian checks.
 */
export async function createAthleteCallLink(
  bookingId: number
): Promise<AthleteCallLinkResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Accedi per inviare il link.' };
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return { ok: false, error: 'Sessione non valida.' };
  }

  const context = await getBookingChatContext(bookingId, user.id);
  // The athlete must never be able to generate a link presented as coming
  // from their coach, even though the destination itself is authenticated.
  if (!context || context.coachUserId !== user.id) {
    return { ok: false, error: 'Non sei autorizzato a inviare questo link.' };
  }
  if (context.status !== 'accepted') {
    return { ok: false, error: 'La sessione non è più disponibile.' };
  }
  if (!(await canParticipateInSessions(context.clientId)).ok) {
    return {
      ok: false,
      error: 'La sessione è bloccata: manca un’autorizzazione valida del tutore.',
    };
  }
  if (!isSessionJoinable(context.scheduledFor, context.durationMin)) {
    return { ok: false, error: 'La finestra della videochiamata è terminata.' };
  }

  const baseUrl = getAppBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      error: 'Indirizzo pubblico di KaiPai non configurato.',
    };
  }

  return {
    ok: true,
    url: new URL(`/dashboard/video/${bookingId}`, baseUrl).toString(),
  };
}
