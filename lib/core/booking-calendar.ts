import {
  buildGoogleCalendarUrl,
  type GoogleCalendarEventInput,
} from '@/lib/core/google-calendar';

export const BOOKING_TIME_ZONE = 'Europe/Rome';

export type BookingCalendarSource = {
  id: number;
  status: string;
  scheduledFor: Date | string | null;
  durationMin: number | null;
  coachName?: string | null;
  athleteName?: string | null;
  viewerRole: 'athlete' | 'coach';
  appBaseUrl: string | null;
  canView: boolean;
  isOnline?: boolean;
};

export type BookingCalendarEvent = {
  input: GoogleCalendarEventInput;
  url: string;
  startAt: Date;
  endAt: Date;
  detailUrl: string;
  videoUrl: string | null;
};

function cleanName(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean || null;
}

function absoluteAppUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ''), base).toString();
}

function formatDescriptionDate(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'long',
    timeZone: BOOKING_TIME_ZONE,
  }).format(date);
}

function formatDescriptionTime(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: BOOKING_TIME_ZONE,
  }).format(date);
}

/**
 * Converts an already-authorized booking projection into the minimal event
 * exposed to Google. Returns null when the CTA must not be shown.
 */
export function buildBookingCalendarEvent(
  booking: BookingCalendarSource,
  now: Date = new Date()
): BookingCalendarEvent | null {
  if (
    !booking.canView ||
    !['requested', 'accepted'].includes(booking.status) ||
    !booking.scheduledFor ||
    !booking.appBaseUrl ||
    !Number.isInteger(booking.id) ||
    booking.id <= 0 ||
    !Number.isInteger(booking.durationMin) ||
    (booking.durationMin ?? 0) <= 0
  ) {
    return null;
  }

  const startAt = new Date(booking.scheduledFor);
  if (Number.isNaN(startAt.getTime())) return null;

  const endAt = new Date(
    startAt.getTime() + (booking.durationMin as number) * 60_000
  );
  if (endAt.getTime() <= now.getTime()) return null;

  const coachName = cleanName(booking.coachName);
  const athleteName = cleanName(booking.athleteName);
  const counterpart =
    booking.viewerRole === 'athlete' ? coachName : athleteName;
  const title = counterpart
    ? `Sessione KaiPai con ${counterpart}`
    : 'Sessione KaiPai';
  const detailUrl = absoluteAppUrl(
    booking.appBaseUrl,
    `/dashboard/appointments/${booking.id}`
  );
  const isOnline = booking.isOnline !== false;
  const videoUrl =
    isOnline && booking.status === 'accepted'
      ? absoluteAppUrl(booking.appBaseUrl, `/dashboard/video/${booking.id}`)
      : null;

  const descriptionLines = [
    'Sessione di mental coaching prenotata tramite KaiPai.',
    '',
    coachName ? `Coach: ${coachName}` : null,
    athleteName ? `Atleta: ${athleteName}` : null,
    `Data: ${formatDescriptionDate(startAt)}`,
    `Orario: ${formatDescriptionTime(startAt)} – ${formatDescriptionTime(endAt)}`,
    '',
    'Apri la sessione su KaiPai:',
    detailUrl,
    videoUrl ? '' : null,
    videoUrl ? 'Link videochiamata:' : null,
    videoUrl,
  ].filter((line): line is string => line != null);

  const input: GoogleCalendarEventInput = {
    title,
    startAt,
    endAt,
    description: descriptionLines.join('\n'),
    location: isOnline ? 'Online su KaiPai' : undefined,
    timezone: BOOKING_TIME_ZONE,
  };

  return {
    input,
    url: buildGoogleCalendarUrl(input),
    startAt,
    endAt,
    detailUrl,
    videoUrl,
  };
}

export function buildBookingGoogleCalendarUrl(
  booking: BookingCalendarSource,
  now: Date = new Date()
): string | null {
  return buildBookingCalendarEvent(booking, now)?.url ?? null;
}

