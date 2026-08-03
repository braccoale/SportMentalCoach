export const CLIENT_VIDEO_EVENT_TYPES = [
  'preflight_result',
  'connection_quality',
  'reconnecting',
  'reconnected',
  'media_device_error',
  'waiting_room_entered',
  'waiting_room_admitted',
  'picture_in_picture_started',
  'picture_in_picture_stopped',
  'krisp_enabled',
  'krisp_disabled',
  'krisp_error',
] as const;

export type ClientVideoEventType =
  (typeof CLIENT_VIDEO_EVENT_TYPES)[number];

export type TechnicalEventDetails = Record<
  string,
  string | number | boolean | null
>;

const ALLOWED_DETAIL_KEYS = new Set([
  'grade',
  'status',
  'durationMs',
  'effectiveType',
  'rttMs',
  'downlinkMbps',
  'websocket',
  'webrtc',
  'turn',
  'quality',
  'deviceKind',
  'reason',
  'supported',
]);

export function parseBookingRoomName(roomName: string): number | null {
  const match = /^booking-([1-9]\d*)$/.exec(roomName);
  if (!match) return null;
  const bookingId = Number(match[1]);
  return Number.isSafeInteger(bookingId) ? bookingId : null;
}

export function isClientVideoEventType(
  value: unknown
): value is ClientVideoEventType {
  return (
    typeof value === 'string' &&
    (CLIENT_VIDEO_EVENT_TYPES as readonly string[]).includes(value)
  );
}

export function participantTechnicalKind(
  identity: string | undefined
): 'authenticated' | 'guest' | 'service' | 'unknown' {
  if (!identity) return 'unknown';
  if (/^user-\d+$/.test(identity)) return 'authenticated';
  if (identity.startsWith('guest-')) return 'guest';
  if (
    identity.startsWith('preflight-') ||
    identity.startsWith('egress-') ||
    identity.startsWith('agent-')
  ) {
    return 'service';
  }
  return 'unknown';
}

export function sanitizeTechnicalEventDetails(
  input: unknown
): TechnicalEventDetails {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const output: TechnicalEventDetails = {};
  for (const [key, rawValue] of Object.entries(input)) {
    if (!ALLOWED_DETAIL_KEYS.has(key)) continue;
    if (
      typeof rawValue === 'string' ||
      typeof rawValue === 'boolean' ||
      rawValue === null
    ) {
      output[key] =
        typeof rawValue === 'string' ? rawValue.slice(0, 120) : rawValue;
    } else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      output[key] = Math.max(-1_000_000, Math.min(1_000_000, rawValue));
    }
  }
  return output;
}

export function technicalEventOccurredAt(
  unixSeconds: number | bigint | string | undefined
): Date {
  const parsed =
    typeof unixSeconds === 'bigint'
      ? Number(unixSeconds)
      : Number(unixSeconds ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return new Date();
  return new Date(parsed * 1_000);
}
