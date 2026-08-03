import 'server-only';
import { createHmac } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { WebhookEvent } from 'livekit-server-sdk';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  services,
  videoSessionEvents,
} from '@/lib/db/schema';
import { getBookingChatContext } from '@/lib/core/messages';
import {
  parseBookingRoomName,
  participantTechnicalKind,
  sanitizeTechnicalEventDetails,
  technicalEventOccurredAt,
  type ClientVideoEventType,
} from './technical-events';

function participantReference(identity: string | undefined): string | null {
  if (!identity) return null;
  const secret =
    process.env.AUTH_SECRET ?? process.env.LIVEKIT_API_SECRET ?? 'kaipai';
  return createHmac('sha256', secret)
    .update(identity)
    .digest('hex')
    .slice(0, 32);
}

function asOptionalString(value: unknown, maxLength = 80): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value).slice(0, maxLength);
}

/**
 * Persists a verified LiveKit webhook without names, raw identities, tokens,
 * metadata or media payloads. Events for non-booking rooms are intentionally
 * ignored (including the dedicated preflight rooms).
 */
export async function recordLiveKitWebhookEvent(
  event: WebhookEvent
): Promise<boolean> {
  const roomName =
    event.room?.name || event.egressInfo?.roomName || event.ingressInfo?.roomName;
  const bookingId = parseBookingRoomName(roomName ?? '');
  if (!bookingId || !event.event) return false;

  const booking = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking[0]) return false;

  const participantIdentity = event.participant?.identity;
  const details = sanitizeTechnicalEventDetails({
    status: event.participant?.state,
    reason: event.participant?.disconnectReason,
  });

  await db
    .insert(videoSessionEvents)
    .values({
      bookingId,
      webhookId: event.id || null,
      source: 'livekit_webhook',
      eventType: event.event,
      roomName: roomName!,
      roomSid: asOptionalString(event.room?.sid),
      participantRef: participantReference(participantIdentity),
      participantKind: participantTechnicalKind(participantIdentity),
      participantSid: asOptionalString(event.participant?.sid),
      trackKind: asOptionalString(event.track?.type, 24),
      trackSource: asOptionalString(event.track?.source, 40),
      details,
      occurredAt: technicalEventOccurredAt(event.createdAt),
    })
    .onConflictDoNothing({ target: videoSessionEvents.webhookId });
  return true;
}

export async function recordClientVideoEvent(
  bookingId: number,
  userId: number,
  eventType: ClientVideoEventType,
  rawDetails: unknown
): Promise<boolean> {
  const context = await getBookingChatContext(bookingId, userId);
  if (!context || context.status !== 'accepted') return false;

  await db.insert(videoSessionEvents).values({
    bookingId,
    webhookId: null,
    source: 'client',
    eventType,
    roomName: `booking-${bookingId}`,
    participantRef: participantReference(`user-${userId}`),
    participantKind: 'authenticated',
    details: sanitizeTechnicalEventDetails(rawDetails),
    occurredAt: new Date(),
    createdBy: userId,
    updatedBy: userId,
  });
  return true;
}

export type VideoTechnicalEventItem = {
  id: number;
  bookingId: number;
  eventType: string;
  source: string;
  participantKind: string | null;
  trackKind: string | null;
  trackSource: string | null;
  details: Record<string, string | number | boolean | null>;
  occurredAt: Date;
  scheduledFor: Date | null;
  serviceTitle: string | null;
};

export async function getRecentVideoTechnicalEvents(
  limit = 250
): Promise<VideoTechnicalEventItem[]> {
  return db
    .select({
      id: videoSessionEvents.id,
      bookingId: videoSessionEvents.bookingId,
      eventType: videoSessionEvents.eventType,
      source: videoSessionEvents.source,
      participantKind: videoSessionEvents.participantKind,
      trackKind: videoSessionEvents.trackKind,
      trackSource: videoSessionEvents.trackSource,
      details: videoSessionEvents.details,
      occurredAt: videoSessionEvents.occurredAt,
      scheduledFor: bookings.scheduledFor,
      serviceTitle: services.title,
    })
    .from(videoSessionEvents)
    .innerJoin(bookings, eq(bookings.id, videoSessionEvents.bookingId))
    .leftJoin(services, eq(services.id, bookings.serviceId))
    .orderBy(desc(videoSessionEvents.occurredAt))
    .limit(Math.max(1, Math.min(500, limit)));
}
