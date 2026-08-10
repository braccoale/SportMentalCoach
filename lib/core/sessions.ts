/**
 * Shared session-timing rules. Plain module (NOT `server-only`) so both server
 * code (booking lifecycle, token minting) and client components (calendar) use
 * the exact same definitions of "expired request" and "joinable session".
 */

/** How long a coach has to answer a request before it auto-declines. */
export const REQUEST_RESPONSE_WINDOW_HOURS = 48;

/**
 * Tolleranza dopo l'orario proposto, prima che la richiesta sia dichiarata
 * scaduta.
 *
 * Senza, una richiesta per fra dieci minuti moriva all'istante in cui quel
 * momento arrivava: l'atleta leggeva "richiesta scaduta" mentre il coach
 * stava ancora guardando la notifica. E non era nemmeno coerente col resto —
 * la stanza della chiamata resta aperta per tutta la durata della sessione,
 * quindi un coach che accetta con qualche minuto di ritardo puo' ancora
 * tenerla davvero.
 */
export const REQUEST_EXPIRY_GRACE_MINUTES = 10;

/**
 * Quanto dura una sessione quando non lo dice nessuno: prenotazioni vecchie,
 * senza servizio, o create prima che la durata fosse una scelta esplicita.
 */
export const FALLBACK_SESSION_DURATION_MIN = 40;

/**
 * Per quanto una sessione resta raggiungibile dopo l'orario di inizio: per la
 * sua durata, e basta.
 *
 * Prima era una finestra fissa di due ore uguale per tutte, il che rendeva una
 * sessione da 40 minuti ancora "in corso" un'ora e venti dopo la fine. Legarla
 * alla durata concordata è ciò che rende vera la parola "scaduta": passati i
 * suoi minuti la sessione appartiene al passato e il link non apre più nulla.
 */
export function sessionEndsAt(
  scheduledFor: Date,
  durationMin: number | null | undefined
): Date {
  const minutes =
    durationMin && durationMin > 0 ? durationMin : FALLBACK_SESSION_DURATION_MIN;
  return new Date(scheduledFor.getTime() + minutes * 60_000);
}

/**
 * How long before a session's scheduled start the video call can be entered.
 * Keeps the room closed while people are still just "requested"/"accepted"
 * and browsing — the call is only for the actual appointment window.
 */
export const VIDEO_JOIN_LEAD_MINUTES = 5;

/**
 * A pending (`requested`) booking is stale when the coach never answered in
 * time: either the requested session time has passed (piu' la tolleranza di
 * `REQUEST_EXPIRY_GRACE_MINUTES`), or the response window elapsed since it was
 * requested.
 */
export function isRequestExpired(
  requestedAt: Date,
  scheduledFor: Date | null,
  now: Date = new Date()
): boolean {
  if (scheduledFor) {
    const graceEnd =
      scheduledFor.getTime() + REQUEST_EXPIRY_GRACE_MINUTES * 60_000;
    if (graceEnd < now.getTime()) return true;
  }
  const deadline =
    requestedAt.getTime() + REQUEST_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000;
  return deadline < now.getTime();
}

/**
 * Whether a video call for a session may be started/joined now. A session with
 * no fixed time is always joinable; a scheduled session stays joinable until
 * its start plus its own duration, after which it is in the past.
 */
export function isSessionJoinable(
  scheduledFor: Date | null,
  durationMin: number | null | undefined,
  now: Date = new Date()
): boolean {
  if (!scheduledFor) return true;
  return sessionEndsAt(scheduledFor, durationMin).getTime() >= now.getTime();
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
  durationMin: number | null | undefined,
  now: Date = new Date()
): boolean {
  if (!scheduledFor) return true;
  if (!isSessionJoinable(scheduledFor, durationMin, now)) return false;
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
  durationMin: number | null | undefined,
  now: Date = new Date()
): Date | null {
  if (!scheduledFor) return null;

  const earliestJoin =
    scheduledFor.getTime() - VIDEO_JOIN_LEAD_MINUTES * 60 * 1000;
  if (now.getTime() < earliestJoin) return new Date(earliestJoin);

  const latestJoin = sessionEndsAt(scheduledFor, durationMin).getTime();
  if (now.getTime() <= latestJoin) return new Date(latestJoin + 1);

  return null;
}
