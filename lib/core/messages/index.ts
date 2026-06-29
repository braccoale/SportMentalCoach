import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  messages,
  bookings,
  providerProfiles,
  profiles,
  services,
  users,
} from '@/lib/db/schema';
import type { Result } from '@/lib/core/result';

export type BookingChatContext = {
  bookingId: number;
  status: string;
  clientId: number;
  coachUserId: number;
  clientName: string | null;
  clientEmail: string;
  coachName: string | null;
  coachSlug: string | null;
  serviceTitle: string | null;
  scheduledFor: Date | null;
};

export type ChatMessage = {
  id: number;
  senderId: number;
  senderName: string | null;
  senderEmail: string;
  body: string;
  createdAt: Date;
};

const MAX_BODY = 4000;

/**
 * Loads a booking's chat context, but only if `userId` is a participant
 * (the athlete client or the coach behind the provider profile). Returns
 * `null` when the booking does not exist or the user is not a participant —
 * callers should treat that as "not found" (no information leak).
 */
export async function getBookingChatContext(
  bookingId: number,
  userId: number
): Promise<BookingChatContext | null> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      status: bookings.status,
      clientId: bookings.clientId,
      coachUserId: providerProfiles.userId,
      clientName: users.name,
      clientEmail: users.email,
      coachName: profiles.displayName,
      coachSlug: providerProfiles.slug,
      serviceTitle: services.title,
      scheduledFor: bookings.scheduledFor,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .innerJoin(users, eq(bookings.clientId, users.id))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!row) return null;
  if (userId !== row.clientId && userId !== row.coachUserId) return null;
  return row;
}

/**
 * Returns the chat (context + messages) for a participant. Chat is available
 * only for `accepted` bookings. Returns `null` if not a participant, not found,
 * or not accepted.
 */
export async function getChat(
  bookingId: number,
  userId: number
): Promise<{ context: BookingChatContext; messages: ChatMessage[] } | null> {
  const context = await getBookingChatContext(bookingId, userId);
  if (!context) return null;
  if (context.status !== 'accepted') return null;

  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      senderName: users.name,
      senderEmail: users.email,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.bookingId, bookingId))
    .orderBy(asc(messages.createdAt));

  return { context, messages: rows };
}

/**
 * Posts a message to a booking chat. Re-verifies that the sender is a
 * participant and that the booking is accepted before inserting.
 */
export async function sendMessage(
  bookingId: number,
  userId: number,
  body: string
): Promise<Result> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'Il messaggio non può essere vuoto.' };
  if (trimmed.length > MAX_BODY) {
    return { ok: false, error: 'Messaggio troppo lungo.' };
  }

  const context = await getBookingChatContext(bookingId, userId);
  if (!context) return { ok: false, error: 'Chat non disponibile.' };
  if (context.status !== 'accepted') {
    return { ok: false, error: 'La chat è disponibile solo per le richieste accettate.' };
  }

  await db.insert(messages).values({ bookingId, senderId: userId, body: trimmed });
  return { ok: true };
}
