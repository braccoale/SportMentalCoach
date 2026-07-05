import 'server-only';
import { asc, desc, eq, or, and, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  messages,
  bookings,
  providerProfiles,
  profiles,
  services,
  users,
} from '@/lib/db/schema';
import { notify } from '@/lib/core/notifications';
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

export type Conversation = {
  bookingId: number;
  /** Counterpart display name (athlete for a coach, coach for an athlete). */
  otherName: string | null;
  serviceTitle: string | null;
  scheduledFor: Date | null;
  lastBody: string | null;
  lastAt: Date | null;
  lastFromMe: boolean;
  unread: number;
};

/**
 * All chat conversations for a user (both roles): accepted bookings they
 * participate in, newest activity first, with last-message preview and the
 * per-conversation unread count (from unread `new_message` notifications).
 */
export async function getConversations(userId: number): Promise<Conversation[]> {
  const clientProfilesAlias = profiles; // coach display name lives in profiles

  const rows = await db
    .select({
      bookingId: bookings.id,
      clientId: bookings.clientId,
      clientName: sql<string | null>`nullif(trim(concat(${users.name}, ' ', coalesce(${users.lastName}, ''))), '')`,
      coachName: clientProfilesAlias.displayName,
      serviceTitle: services.title,
      scheduledFor: bookings.scheduledFor,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .innerJoin(users, eq(bookings.clientId, users.id))
    .leftJoin(
      clientProfilesAlias,
      eq(clientProfilesAlias.userId, providerProfiles.userId)
    )
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        eq(bookings.status, 'accepted'),
        or(
          eq(bookings.clientId, userId),
          eq(providerProfiles.userId, userId)
        )
      )
    );

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.bookingId);

  // Last message per booking.
  const lastMessages = await db
    .select({
      bookingId: messages.bookingId,
      senderId: messages.senderId,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.bookingId, ids))
    .orderBy(desc(messages.createdAt));
  const lastByBooking = new Map<number, (typeof lastMessages)[number]>();
  for (const m of lastMessages) {
    if (!lastByBooking.has(m.bookingId)) lastByBooking.set(m.bookingId, m);
  }

  // Unread new_message notifications grouped by bookingId (stored in data).
  const unreadRows = await db.execute(sql`
    SELECT (data->>'bookingId')::int AS booking_id, count(*)::int AS n
    FROM notifications
    WHERE user_id = ${userId}
      AND type = 'new_message'
      AND read_at IS NULL
      AND data->>'bookingId' IS NOT NULL
    GROUP BY 1
  `);
  const unreadByBooking = new Map<number, number>();
  for (const r of unreadRows as unknown as { booking_id: number; n: number }[]) {
    unreadByBooking.set(Number(r.booking_id), Number(r.n));
  }

  return rows
    .map((r) => {
      const last = lastByBooking.get(r.bookingId);
      const isClient = r.clientId === userId;
      return {
        bookingId: r.bookingId,
        otherName: isClient ? r.coachName : r.clientName,
        serviceTitle: r.serviceTitle,
        scheduledFor: r.scheduledFor,
        lastBody: last?.body ?? null,
        lastAt: last?.createdAt ?? null,
        lastFromMe: last ? last.senderId === userId : false,
        unread: unreadByBooking.get(r.bookingId) ?? 0,
      };
    })
    .sort(
      (a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0)
    );
}

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
      clientName: sql<string | null>`nullif(trim(concat(${users.name}, ' ', coalesce(${users.lastName}, ''))), '')`,
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

  await db.insert(messages).values({ bookingId, senderId: userId, body: trimmed, createdBy: userId });

  // Notify the other participant of the new message.
  const isClient = userId === context.clientId;
  const recipientId = isClient ? context.coachUserId : context.clientId;
  const senderName = isClient
    ? context.clientName ?? context.clientEmail
    : context.coachName;
  await notify('new_message', recipientId, { senderName, bookingId });

  return { ok: true };
}
