const GOOGLE_CALENDAR_TEMPLATE_URL =
  'https://calendar.google.com/calendar/render';

export type GoogleCalendarEventInput = {
  title: string;
  startAt: string | Date;
  endAt?: string | Date | null;
  description?: string;
  location?: string;
  timezone?: string;
};

function asValidDate(value: string | Date, field: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} non valida.`);
  }
  return date;
}

/** Formats an absolute instant for Google Calendar, e.g. 20260728T153000Z. */
export function formatGoogleCalendarUtcDate(value: string | Date): string {
  return asValidDate(value, 'Data').toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Builds Google's documented pre-filled event URL without accessing the DOM.
 * Dates are always absolute UTC instants; `ctz` only controls Google's display
 * timezone and never changes the represented start/end instants.
 */
export function buildGoogleCalendarUrl(
  event: GoogleCalendarEventInput
): string {
  const start = asValidDate(event.startAt, 'Data di inizio');
  if (event.endAt == null) {
    throw new Error('Data di fine mancante.');
  }
  const end = asValidDate(event.endAt, 'Data di fine');
  if (end.getTime() <= start.getTime()) {
    throw new Error('La data di fine deve essere successiva alla data di inizio.');
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title.trim() || 'Sessione KaiPai',
    dates: `${formatGoogleCalendarUtcDate(start)}/${formatGoogleCalendarUtcDate(end)}`,
  });

  const optional = {
    details: event.description,
    location: event.location,
    ctz: event.timezone,
  };
  for (const [key, value] of Object.entries(optional)) {
    const clean = value?.trim();
    if (clean) params.set(key, clean);
  }

  return `${GOOGLE_CALENDAR_TEMPLATE_URL}?${params.toString()}`;
}

