import 'server-only';
import { getBookingChatContext } from '@/lib/core/messages';
import { isVideoConfigured } from '@/lib/core/flags';
import { mintAccessToken } from './token';

export type RoomTokenResult =
  | { ok: false; reason: 'unauthorized' }
  | { ok: false; reason: 'not_configured'; backHref: string; otherName: string }
  | {
      ok: true;
      token: string;
      url: string;
      room: string;
      backHref: string;
      otherName: string;
    };

/**
 * Mints a LiveKit room token for a booking, but only for the booking's
 * participants and only when the booking is `accepted`. Returns
 * `unauthorized` otherwise (caller should 404), or `not_configured` when the
 * LiveKit env vars are absent (caller should show a setup message).
 */
export async function createRoomToken(
  bookingId: number,
  userId: number
): Promise<RoomTokenResult> {
  const ctx = await getBookingChatContext(bookingId, userId);
  if (!ctx || ctx.status !== 'accepted') {
    return { ok: false, reason: 'unauthorized' };
  }

  const isClient = userId === ctx.clientId;
  const backHref = isClient ? '/dashboard/athlete' : '/dashboard/coach';
  const otherName = isClient
    ? ctx.coachName ?? 'Coach'
    : ctx.clientName ?? ctx.clientEmail;

  if (!isVideoConfigured()) {
    return { ok: false, reason: 'not_configured', backHref, otherName };
  }

  const room = `booking-${bookingId}`;
  const token = await mintAccessToken({
    apiKey: process.env.LIVEKIT_API_KEY!,
    apiSecret: process.env.LIVEKIT_API_SECRET!,
    room,
    identity: `user-${userId}`,
    name: isClient ? ctx.clientName ?? ctx.clientEmail : ctx.coachName ?? 'Coach',
  });

  return {
    ok: true,
    token,
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL!,
    room,
    backHref,
    otherName,
  };
}
