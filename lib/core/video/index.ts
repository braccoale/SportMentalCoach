import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { bookings } from '@/lib/db/schema';
import { getBookingChatContext } from '@/lib/core/messages';
import { isVideoConfigured } from '@/lib/core/flags';
import { isSessionJoinable } from '@/lib/core/sessions';
import { mintAccessToken } from './token';

/**
 * Heartbeat from a connected call participant: stamps the session's real start
 * once (first ping) and advances its end to now on every ping. The last ping
 * before both participants disconnect approximates the true end — robust to
 * abrupt tab closes. Only participants of an `accepted` booking are accepted.
 */
export async function recordSessionHeartbeat(
  bookingId: number,
  userId: number
): Promise<boolean> {
  const ctx = await getBookingChatContext(bookingId, userId);
  if (!ctx || ctx.status !== 'accepted') return false;

  const now = new Date();
  await db
    .update(bookings)
    .set({
      sessionStartedAt: sql`coalesce(${bookings.sessionStartedAt}, ${now})`,
      sessionEndedAt: now,
      updatedAt: now,
    })
    .where(eq(bookings.id, bookingId));
  return true;
}

export type RoomTokenResult =
  | { ok: false; reason: 'unauthorized' }
  | { ok: false; reason: 'past'; backHref: string; otherName: string }
  | { ok: false; reason: 'not_configured'; backHref: string; otherName: string }
  | {
      ok: true;
      token: string;
      url: string;
      room: string;
      backHref: string;
      otherName: string;
      /** True when the current viewer is the coach (owns the "complete" action). */
      viewerIsCoach: boolean;
      /** The other participant's user id (broadcast target for the popup). */
      counterpartUserId: number;
      /** The current viewer's display name (shown in the peer's popup as caller). */
      viewerName: string;
      /** Display info carried in the incoming-call popup. */
      serviceTitle: string | null;
      scheduledFor: string | null;
    };

/**
 * Mints a LiveKit room token for a booking, but only for the booking's
 * participants, only when the booking is `accepted`, and only while the session
 * is not in the past. Returns `unauthorized` otherwise (caller should 404),
 * `past` when the scheduled session time has elapsed, or `not_configured` when
 * the LiveKit env vars are absent (caller should show a setup message).
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

  // Cannot start/join a call for a session in the past.
  if (!isSessionJoinable(ctx.scheduledFor)) {
    return { ok: false, reason: 'past', backHref, otherName };
  }

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
    viewerIsCoach: !isClient,
    counterpartUserId: isClient ? ctx.coachUserId : ctx.clientId,
    viewerName: isClient
      ? ctx.clientName ?? ctx.clientEmail
      : ctx.coachName ?? 'Coach',
    serviceTitle: ctx.serviceTitle,
    scheduledFor: ctx.scheduledFor ? ctx.scheduledFor.toISOString() : null,
  };
}
