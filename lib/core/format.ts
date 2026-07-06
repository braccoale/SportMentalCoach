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

/** Formats a date as a localized medium date + short time (default it-IT). */
export function formatDateTime(d: Date, locale = 'it-IT'): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/** Formats a date only (no time), localized medium style (default it-IT). */
export function formatDate(d: Date, locale = 'it-IT'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
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
 * Formats the real duration between a session's start and end as e.g. "52 min"
 * or "1h 05m". Returns null when either bound is missing or the span is
 * non-positive.
 */
export function formatSessionDuration(
  start: Date | null,
  end: Date | null
): string | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return null;
  const totalMin = Math.max(1, Math.round(ms / 60000));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
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
