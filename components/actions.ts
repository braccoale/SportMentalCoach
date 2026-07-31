'use server';

import { AccessToken } from 'livekit-server-sdk';
import { requireRole } from '@/lib/core/auth';
import { getBookingById } from '@/lib/core/bookings';
import { isVideoConfigured } from '@/lib/core/flags';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

type GuestLinkResult = {
  ok: true;
  url: string;
};

type ErrorResult = {
  ok: false;
  error: string;
};

/**
 * Genera un link d'invito per un ospite a una sessione video.
 * Solo il coach della sessione può generare questo link.
 */
export async function createGuestInviteLink(
  bookingId: number
): Promise<GuestLinkResult | ErrorResult> {
  if (!isVideoConfigured()) {
    return { ok: false, error: 'La funzione video non è configurata.' };
  }

  const user = await requireRole('coach');
  const booking = await getBookingById(bookingId);

  if (!booking || booking.providerId !== user.id) {
    return { ok: false, error: 'Sessione non trovata o non autorizzata.' };
  }

  const roomName = `booking-${bookingId}`;
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: `guest-${crypto.randomUUID()}`,
    ttl: '2h', // Il link scade dopo 2 ore
  });
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true });

  const url = new URL('/video/join', process.env.BASE_URL);
  url.searchParams.set('token', at.toJwt());

  return { ok: true, url: url.toString() };
}