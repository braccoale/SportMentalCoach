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
 * How long before a session's scheduled start the video call can be entered.
 * Keeps the room closed while people are still just "requested"/"accepted"
 * and browsing — the call is only for the actual appointment window.
 */
export const VIDEO_JOIN_LEAD_MINUTES = 5;

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

/**
 * Whether the *video call* specifically can be entered now: not before
 * `VIDEO_JOIN_LEAD_MINUTES` ahead of the scheduled start, and not past the
 * usual joinable window. A session with no fixed time has no lead
 * restriction — it's always joinable, same as `isSessionJoinable`. Chat and
 * cancellation are unaffected by this; they use `isSessionJoinable` alone.
 */
export function canJoinVideoNow(
  scheduledFor: Date | null,
  now: Date = new Date()
): boolean {
  if (!scheduledFor) return true;
  if (!isSessionJoinable(scheduledFor, now)) return false;
  const earliestJoin =
    scheduledFor.getTime() - VIDEO_JOIN_LEAD_MINUTES * 60 * 1000;
  return now.getTime() >= earliestJoin;
}

/**
 * Returns the next instant at which `canJoinVideoNow` may change for a
 * scheduled session. Client controls use this to update exactly when the
 * five-minute lead window opens (and when the grace window closes) without
 * polling or requiring a page refresh.
 */
export function nextVideoJoinAvailabilityChange(
  scheduledFor: Date | null,
  now: Date = new Date()
): Date | null {
  if (!scheduledFor) return null;

  const earliestJoin =
    scheduledFor.getTime() - VIDEO_JOIN_LEAD_MINUTES * 60 * 1000;
  if (now.getTime() < earliestJoin) return new Date(earliestJoin);

  const latestJoin =
    scheduledFor.getTime() + SESSION_JOIN_GRACE_MINUTES * 60 * 1000;
  if (now.getTime() <= latestJoin) return new Date(latestJoin + 1);

  return null;
}
