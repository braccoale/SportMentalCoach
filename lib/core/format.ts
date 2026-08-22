/** Italian weekday labels, indexed 0=Sunday … 6=Saturday (JS getDay). */
export const WEEKDAY_LABELS = [
  'Domenica',
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
] as const;

/** Formats minutes-from-midnight as `HH:MM`. */
export function formatMinutesOfDay(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * The vertical's fixed display timezone. Bookings are shown in Italian local
 * time regardless of where the server process runs — without this, the same
 * UTC instant renders differently on a Rome-timezone dev machine vs. the
 * UTC-timezone Vercel runtime, silently shifting every scheduled time.
 */
const DISPLAY_TIME_ZONE = 'Europe/Rome';

/** Formats a date as a localized medium date + short time (default it-IT). */
export function formatDateTime(d: Date, locale = 'it-IT'): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(d);
}

/** Formats a date only (no time), localized medium style (default it-IT). */
export function formatDate(d: Date, locale = 'it-IT'): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(d);
}

/** Formats just the time of day, "HH:mm" in Rome local time. */
export function formatTime(d: Date, locale = 'it-IT'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(d);
}

/** Europe/Rome calendar date in the stable form value `YYYY-MM-DD`. */
export function formatRomeDateValue(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  }).formatToParts(d);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Splits a date into the three pieces a "big date" hero display needs — huge
 * day number, short month + year, and time — all in the app's fixed display
 * timezone (Europe/Rome).
 */
export function formatBigDateParts(d: Date): {
  day: string;
  monthYear: string;
  time: string;
  weekday: string;
} {
  const day = new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(d);
  const monthYear = new Intl.DateTimeFormat('it-IT', {
    month: 'short',
    year: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  })
    .format(d)
    .toUpperCase();
  const time = new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(d);
  const weekday = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(d);
  const weekdayLabel = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return { day, monthYear, time, weekday: weekdayLabel };
}

/**
 * Label for a booking's `scheduledFor` date, by status — makes it obvious
 * whether the shown date is a proposal or the actual appointment.
 */
export function scheduledForLabel(status: string): string {
  switch (status) {
    case 'accepted':
      return 'Sessione confermata:';
    case 'completed':
      return 'Sessione svolta:';
    case 'cancelled':
    case 'declined':
    case 'expired':
      return 'Era prevista:';
    default:
      return 'Data proposta:';
  }
}

/**
 * Whole minutes between a session's real start and end. Returns null when
 * either bound is missing or the span is non-positive.
 */
export function getSessionDurationMinutes(
  start: Date | null,
  end: Date | null
): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return null;
  return Math.max(1, Math.round(ms / 60000));
}

/** Formats a minute count as e.g. "52 min" or "1h 05m". */
export function formatMinutes(totalMin: number): string {
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Formats the real duration between a session's start and end as e.g. "52 min"
 * or "1h 05m". Returns null when either bound is missing or the span is
 * non-positive.
 */
export function formatSessionDuration(
  start: Date | null,
  end: Date | null
): string | null {
  const totalMin = getSessionDurationMinutes(start, end);
  return totalMin == null ? null : formatMinutes(totalMin);
}

/** Formats a total minute count as e.g. "45 min" or "128h" (rounded, no minutes past the first hour — this is a cumulative total, not a single span). */
export function formatTotalHours(totalMinutes: number): string {
  if (totalMinutes < 60) return `${Math.round(totalMinutes)} min`;
  return `${Math.round(totalMinutes / 60)}h`;
}

/**
 * Humanizes an email local-part into a presentable name, e.g.
 * "mario.rossi" → "Mario Rossi". Used as a friendlier fallback than showing
 * the raw email when a user hasn't set their display name.
 */
function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  const words = local
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length > 0 ? words.join(' ') : email;
}

/**
 * Resolves the best display name for a person: their real name if set,
 * otherwise a humanized version of their email (never the raw address) —
 * cards look unprofessional showing a bare email where a name is expected.
 */
export function resolveDisplayName(
  name: string | null | undefined,
  email: string
): string {
  return name?.trim() || displayNameFromEmail(email);
}

/** Derives up to two uppercase initials from a name (fallback "?"). */
export function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/**
 * Whole years elapsed since a date (accepts a `YYYY-MM-DD` string or Date).
 * Returns null for empty/invalid input, and never a negative number.
 */
export function yearsSince(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const start = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  const anniversaryNotReached =
    now.getMonth() < start.getMonth() ||
    (now.getMonth() === start.getMonth() && now.getDate() < start.getDate());
  if (anniversaryNotReached) years -= 1;
  return years < 0 ? 0 : years;
}

/** Formats an integer amount of cents into a localized currency string. */
export function formatPrice(
  cents: number | null | undefined,
  currency = 'EUR',
  locale = 'it-IT'
): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export type SessionDurationLabel = {
  /** Il testo da mostrare: «52 min», oppure «60 min previsti». */
  label: string;
  /** La durata viene dalla videochiamata vera, non da quella concordata. */
  measured: boolean;
};

/**
 * Quanto è durata una seduta, o quanto sarebbe dovuta durare.
 *
 * Nasce da una scheda che non mostrava niente: la durata compariva solo con lo
 * stato `completed`, e una sessione trascorsa ma non ancora chiusa restava
 * senza. Eppure la durata concordata è nota fin dalla prenotazione — non
 * dipende dal fatto che la chiamata sia partita, che sia stata registrata o
 * che il riepilogo sia stato approvato.
 *
 * **La parola «previsti» non è ornamentale.** Senza, un «60 min» su una
 * seduta che non si è mai svolta si legge come un fatto, e non lo è. Le due
 * durate rispondono a due domande diverse e la scheda deve dire quale sta
 * rispondendo.
 */
export function describeSessionDuration(params: {
  sessionStartedAt: Date | null;
  sessionEndedAt: Date | null;
  /** La durata concordata alla prenotazione. */
  durationMin: number | null;
}): SessionDurationLabel | null {
  const measured = getSessionDurationMinutes(
    params.sessionStartedAt,
    params.sessionEndedAt
  );
  if (measured !== null) {
    return { label: formatMinutes(measured), measured: true };
  }

  if (params.durationMin != null && params.durationMin > 0) {
    return {
      label: `${formatMinutes(params.durationMin)} previsti`,
      measured: false,
    };
  }

  return null;
}
