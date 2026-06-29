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
