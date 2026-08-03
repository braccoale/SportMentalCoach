import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { bookings } from '@/lib/db/schema';
import { getBookingChatContext } from '@/lib/core/messages';
import { isVideoConfigured } from '@/lib/core/flags';
import {
  SESSION_JOIN_GRACE_MINUTES,
  isSessionJoinable,
  canJoinVideoNow,
} from '@/lib/core/sessions';
import { mintAccessToken } from './token';
import {
  signGuestInviteToken,
  verifyGuestInviteToken,
} from './guest-invite-token';
import { hasActiveAiNotesSessionForBooking } from '@/lib/core/ai-session-notes/recording';

function guestInviteSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET is missing or too short.');
  }
  return secret;
}

async function createPreflightToken(): Promise<string> {
  const checkId = crypto.randomUUID();
  return mintAccessToken({
    apiKey: process.env.LIVEKIT_API_KEY!,
    apiSecret: process.env.LIVEKIT_API_SECRET!,
    room: `preflight-${checkId}`,
    identity: `preflight-${checkId}`,
    ttl: '10m',
    canPublish: false,
    canSubscribe: false,
  });
}

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
      // La data va passata come stringa con cast esplicito: dentro un
      // frammento SQL grezzo Drizzle non conosce il tipo della colonna e
      // consegna al driver un oggetto Date, che postgres.js non sa
      // serializzare (ERR_INVALID_ARG_TYPE) — il heartbeat rispondeva 500 a
      // ogni chiamata e la durata reale della sessione non veniva mai scritta.
      sessionStartedAt: sql`coalesce(${bookings.sessionStartedAt}, ${now.toISOString()}::timestamp)`,
      sessionEndedAt: now,
      updatedAt: now,
    })
    .where(eq(bookings.id, bookingId));
  return true;
}

export type RoomTokenResult =
  | { ok: false; reason: 'unauthorized' }
  | { ok: false; reason: 'past'; backHref: string; otherName: string }
  | {
      ok: false;
      reason: 'too_early';
      backHref: string;
      otherName: string;
      scheduledFor: string;
    }
  | { ok: false; reason: 'not_configured'; backHref: string; otherName: string }
  | {
      ok: true;
      token: string;
      preflightToken: string;
      url: string;
      room: string;
      backHref: string;
      otherName: string;
      /** True when the current viewer is the coach (owns the "complete" action). */
      viewerIsCoach: boolean;
      /** Stable LiveKit identity used to recognise the coach in the lobby. */
      coachIdentity: string;
      /** The other participant's user id (broadcast target for the popup). */
      counterpartUserId: number;
      /** The current viewer's display name (shown in the peer's popup as caller). */
      viewerName: string;
      /** Display info carried in the incoming-call popup. */
      serviceTitle: string | null;
      scheduledFor: string | null;
    };

export type GuestInviteTokenResult =
  | { ok: false; reason: 'unauthorized' | 'closed' | 'past' | 'not_configured' }
  | { ok: true; token: string; expiresAt: Date };

/**
 * Creates a signed app invitation for either authenticated participant.
 * The invitation is booking-scoped and remains subject to fresh booking/time
 * checks when the guest opens it; it is not a reusable LiveKit room token.
 */
export async function createGuestInviteToken(
  bookingId: number,
  userId: number
): Promise<GuestInviteTokenResult> {
  const ctx = await getBookingChatContext(bookingId, userId);
  if (!ctx) return { ok: false, reason: 'unauthorized' };
  if (ctx.status !== 'accepted') return { ok: false, reason: 'closed' };
  if (!isSessionJoinable(ctx.scheduledFor)) {
    return { ok: false, reason: 'past' };
  }
  if (!isVideoConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }

  const now = Date.now();
  const expiresAt = ctx.scheduledFor
    ? new Date(
        Math.max(
          ctx.scheduledFor.getTime() +
            SESSION_JOIN_GRACE_MINUTES * 60_000,
          now + 15 * 60_000
        )
      )
    : new Date(now + 24 * 60 * 60_000);
  const token = await signGuestInviteToken(
    {
      bookingId,
      inviterUserId: userId,
      inviteId: crypto.randomUUID(),
      expiresAt,
    },
    guestInviteSecret()
  );
  return { ok: true, token, expiresAt };
}

export type GuestRoomTokenResult =
  | {
      ok: false;
      reason:
        | 'invalid'
        | 'closed'
        | 'past'
        | 'not_configured'
        | 'ai_notes_active';
    }
  | { ok: false; reason: 'too_early'; scheduledFor: string }
  | {
      ok: true;
      token: string;
      preflightToken: string;
      url: string;
      bookingId: number;
      scheduledFor: string | null;
      coachIdentity: string;
    };

/**
 * Exchanges a signed app invitation for a short-lived LiveKit guest token.
 * Status, original inviter participation and the call window are rechecked on
 * every page load, so cancelled/expired bookings invalidate shared links.
 */
export async function createGuestRoomToken(
  inviteToken: string
): Promise<GuestRoomTokenResult> {
  const invite = await verifyGuestInviteToken(
    inviteToken,
    guestInviteSecret()
  );
  if (!invite) return { ok: false, reason: 'invalid' };

  const ctx = await getBookingChatContext(
    invite.bookingId,
    invite.inviterUserId
  );
  if (!ctx) return { ok: false, reason: 'invalid' };
  if (ctx.status !== 'accepted') return { ok: false, reason: 'closed' };
  if (!isSessionJoinable(ctx.scheduledFor)) {
    return { ok: false, reason: 'past' };
  }
  if (!canJoinVideoNow(ctx.scheduledFor)) {
    return {
      ok: false,
      reason: 'too_early',
      scheduledFor: ctx.scheduledFor!.toISOString(),
    };
  }
  if (!isVideoConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }
  if (await hasActiveAiNotesSessionForBooking(invite.bookingId)) {
    return { ok: false, reason: 'ai_notes_active' };
  }

  const token = await mintAccessToken({
    apiKey: process.env.LIVEKIT_API_KEY!,
    apiSecret: process.env.LIVEKIT_API_SECRET!,
    room: `booking-${invite.bookingId}`,
    identity: `guest-${crypto.randomUUID()}`,
    name: 'Ospite',
  });
  return {
    ok: true,
    token,
    preflightToken: await createPreflightToken(),
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL!,
    bookingId: invite.bookingId,
    scheduledFor: ctx.scheduledFor?.toISOString() ?? null,
    coachIdentity: `user-${ctx.coachUserId}`,
  };
}

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

  // Nor before the join window opens (a few minutes ahead of the scheduled start).
  if (!canJoinVideoNow(ctx.scheduledFor)) {
    return {
      ok: false,
      reason: 'too_early',
      backHref,
      otherName,
      scheduledFor: ctx.scheduledFor!.toISOString(),
    };
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
    preflightToken: await createPreflightToken(),
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL!,
    room,
    backHref,
    otherName,
    viewerIsCoach: !isClient,
    coachIdentity: `user-${ctx.coachUserId}`,
    counterpartUserId: isClient ? ctx.coachUserId : ctx.clientId,
    viewerName: isClient
      ? ctx.clientName ?? ctx.clientEmail
      : ctx.coachName ?? 'Coach',
    serviceTitle: ctx.serviceTitle,
    scheduledFor: ctx.scheduledFor ? ctx.scheduledFor.toISOString() : null,
  };
}
