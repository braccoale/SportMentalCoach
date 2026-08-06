'use server';

import { getUser } from '@/lib/db/queries';
import { getAppBaseUrl } from '@/lib/core/app-url';
import { createGuestInviteToken } from '@/lib/core/video';

type GuestLinkResult =
  | { ok: true; url: string; expiresAt: string }
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
