/**
 * Shared session-timing rules. Plain module (NOT `server-only`) so both server
 * code (booking lifecycle, token minting) and client components (calendar) use
 * the exact same definitions of "expired request" and "joinable session".
 */

/** How long a coach has to answer a request before it auto-declines. */
export const REQUEST_RESPONSE_WINDOW_HOURS = 48;

/**
 * Grace period after a session's scheduled start during which the call can
 * still be joined. Beyond this the session is considered past. Sessions with no
 * fixed time are always joinable.
 */
export const SESSION_JOIN_GRACE_MINUTES = 120;

/**
 * A pending (`requested`) booking is stale when the coach never answered in
 * time: either the requested session time has already passed, or the response
 * window elapsed since it was requested.
 */
export function isRequestExpired(
  requestedAt: Date,
  scheduledFor: Date | null,
  now: Date = new Date()
): boolean {
  if (scheduledFor && scheduledFor.getTime() < now.getTime()) return true;
  const deadline =
    requestedAt.getTime() + REQUEST_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000;
  return deadline < now.getTime();
}

/**
 * Whether a video call for a session may be started/joined now. A session with
 * no fixed time is always joinable; a scheduled session stays joinable until
 * its start plus the grace period, after which it is in the past.
 */
export function isSessionJoinable(
  scheduledFor: Date | null,
  now: Date = new Date()
): boolean {
  if (!scheduledFor) return true;
  const end =
    scheduledFor.getTime() + SESSION_JOIN_GRACE_MINUTES * 60 * 1000;
  return end >= now.getTime();
}
