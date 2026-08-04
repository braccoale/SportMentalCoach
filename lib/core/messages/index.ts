import 'server-only';
import { randomUUID } from 'node:crypto';
import { asc, desc, eq, or, and, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  messages,
  messageReactions,
  bookings,
  providerProfiles,
  profiles,
  services,
  users,
} from '@/lib/db/schema';
import { notify } from '@/lib/core/notifications';
import {
  deletePrivateFile,
  storePrivateFile,
} from '@/lib/core/storage';
import type { Result } from '@/lib/core/result';
import {
  CHAT_HISTORY_STATUSES,
  CHATTABLE_STATUSES,
  canViewBookingChatHistory,
  isMessageReactionEmoji,
  isBookingChatAvailable,
} from './policy';
import { validateChatImageAttachment } from './attachments';

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
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentSize: number | null;
  hasAttachment: boolean;
  reactions: {
    emoji: string;
    count: number;
    reactedByMe: boolean;
  }[];
  createdAt: Date;
};

const MAX_BODY = 4000;

export type Conversation = {
  bookingId: number;
  /** Counterpart display name (athlete for a coach, coach for an athlete). */
  otherName: string | null;
  otherAvatarUrl: string | null;
  serviceTitle: string | null;
  scheduledFor: Date | null;
  lastBody: string | null;
  lastAt: Date | null;
  lastFromMe: boolean;
  unread: number;
  readOnly: boolean;
};

/**
 * All chat conversations for a user (both roles): pending requests, accepted
 * bookings and completed sessions they participate in, newest activity first,
 * with last-message preview and the per-conversation unread count.
 */
export async function getConversations(userId: number): Promise<Conversation[]> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      status: bookings.status,
      clientId: bookings.clientId,
      clientName: sql<string | null>`nullif(trim(concat(${users.name}, ' ', coalesce(${users.lastName}, ''))), '')`,
      clientAvatarUrl: sql<string | null>`(
        select ${profiles.avatarUrl}
        from ${profiles}
        where ${profiles.userId} = ${users.id}
        limit 1
      )`,
      coachName: sql<string | null>`(
        select ${profiles.displayName}
        from ${profiles}
        where ${profiles.userId} = ${providerProfiles.userId}
        limit 1
      )`,
      coachAvatarUrl: sql<string | null>`(
        select ${profiles.avatarUrl}
        from ${profiles}
        where ${profiles.userId} = ${providerProfiles.userId}
        limit 1
      )`,
      serviceTitle: services.title,
      scheduledFor: bookings.scheduledFor,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .innerJoin(users, eq(bookings.clientId, users.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        inArray(bookings.status, [
          ...CHATTABLE_STATUSES,
          ...CHAT_HISTORY_STATUSES,
        ]),
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
      attachmentKey: messages.attachmentKey,
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
    .filter((r) =>
      canViewBookingChatHistory(r.status, lastByBooking.has(r.bookingId))
    )
    .map((r) => {
      const last = lastByBooking.get(r.bookingId);
      const isClient = r.clientId === userId;
      return {
        bookingId: r.bookingId,
        otherName: isClient ? r.coachName : r.clientName,
        otherAvatarUrl: isClient ? r.coachAvatarUrl : r.clientAvatarUrl,
        serviceTitle: r.serviceTitle,
        scheduledFor: r.scheduledFor,
        lastBody:
          last?.body || (last?.attachmentKey ? 'Immagine' : null),
        lastAt: last?.createdAt ?? null,
        lastFromMe: last ? last.senderId === userId : false,
        unread: unreadByBooking.get(r.bookingId) ?? 0,
        readOnly: !isBookingChatAvailable(r.status),
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
 * Returns the chat (context + messages) for a participant. Chat stays open for
 * pending requests, accepted bookings and completed sessions. Returns `null`
 * if not a participant, not found, or the booking is non-chattable.
 */
export async function getChat(
  bookingId: number,
  userId: number
): Promise<{
  context: BookingChatContext;
  messages: ChatMessage[];
  readOnly: boolean;
} | null> {
  const context = await getBookingChatContext(bookingId, userId);
  if (!context) return null;

  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      senderName: users.name,
      senderEmail: users.email,
      body: messages.body,
      attachmentName: messages.attachmentName,
      attachmentMimeType: messages.attachmentMimeType,
      attachmentSize: messages.attachmentSize,
      hasAttachment: sql<boolean>`${messages.attachmentKey} is not null`,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.bookingId, bookingId))
    .orderBy(asc(messages.createdAt));

  if (!canViewBookingChatHistory(context.status, rows.length > 0)) return null;

  const reactionRows =
    rows.length === 0
      ? []
      : await db
          .select({
            messageId: messageReactions.messageId,
            userId: messageReactions.userId,
            emoji: messageReactions.emoji,
          })
          .from(messageReactions)
          .where(
            inArray(
              messageReactions.messageId,
              rows.map((row) => row.id)
            )
          );
  const reactionsByMessage = new Map<
    number,
    Map<string, { count: number; reactedByMe: boolean }>
  >();
  for (const reaction of reactionRows) {
    let byEmoji = reactionsByMessage.get(reaction.messageId);
    if (!byEmoji) {
      byEmoji = new Map();
      reactionsByMessage.set(reaction.messageId, byEmoji);
    }
    const current = byEmoji.get(reaction.emoji) ?? {
      count: 0,
      reactedByMe: false,
    };
    current.count += 1;
    current.reactedByMe ||= reaction.userId === userId;
    byEmoji.set(reaction.emoji, current);
  }

  return {
    context,
    messages: rows.map((row) => ({
      ...row,
      reactions: Array.from(reactionsByMessage.get(row.id) ?? []).map(
        ([emoji, reaction]) => ({
          emoji,
          count: reaction.count,
          reactedByMe: reaction.reactedByMe,
        })
      ),
    })),
    readOnly: !isBookingChatAvailable(context.status),
  };
}

/**
 * Posts a message to a booking chat. Re-verifies that the sender is a
 * participant and that the booking is still chattable before inserting.
 */
export type ChatImageAttachmentInput = {
  name: string;
  mimeType: string;
  size: number;
  bytes: Buffer;
};

export type MessageAttachment = {
  key: string;
  name: string;
  mimeType: string;
  size: number;
};

function safeAttachmentName(name: string, mimeType: string): string {
  const extension =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/webp'
        ? 'webp'
        : 'jpg';
  const base = name
    .replaceAll('\\', '/')
    .split('/')
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 240);
  return base || `screenshot.${extension}`;
}

/**
 * Resolves one attachment only after checking that the caller participates in
 * the booking and may see its current or archived chat history.
 */
export async function getMessageAttachment(
  bookingId: number,
  messageId: number,
  userId: number
): Promise<MessageAttachment | null> {
  const context = await getBookingChatContext(bookingId, userId);
  if (!context) return null;

  const [row] = await db
    .select({
      key: messages.attachmentKey,
      name: messages.attachmentName,
      mimeType: messages.attachmentMimeType,
      size: messages.attachmentSize,
    })
    .from(messages)
    .where(
      and(eq(messages.id, messageId), eq(messages.bookingId, bookingId))
    )
    .limit(1);

  if (
    !row?.key ||
    !row.name ||
    !row.mimeType ||
    row.size == null ||
    !canViewBookingChatHistory(context.status, true)
  ) {
    return null;
  }
  return {
    key: row.key,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
  };
}

/**
 * Adds, changes or removes the caller's single reaction on a message.
 * Participation, booking state, message ownership and the emoji allow-list are
 * all enforced server-side.
 */
export async function toggleMessageReaction(
  bookingId: number,
  messageId: number,
  userId: number,
  emoji: string
): Promise<Result> {
  if (!isMessageReactionEmoji(emoji)) {
    return { ok: false, error: 'Reazione non valida.' };
  }

  const context = await getBookingChatContext(bookingId, userId);
  if (!context || !isBookingChatAvailable(context.status)) {
    return { ok: false, error: 'Chat non disponibile.' };
  }

  const [message] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(eq(messages.id, messageId), eq(messages.bookingId, bookingId))
    )
    .limit(1);
  if (!message) return { ok: false, error: 'Messaggio non trovato.' };

  const [existing] = await db
    .select({
      id: messageReactions.id,
      emoji: messageReactions.emoji,
    })
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId)
      )
    )
    .limit(1);

  if (existing?.emoji === emoji) {
    await db
      .delete(messageReactions)
      .where(eq(messageReactions.id, existing.id));
    return { ok: true };
  }

  await db
    .insert(messageReactions)
    .values({
      messageId,
      userId,
      emoji,
      createdBy: userId,
      updatedBy: userId,
    })
    .onConflictDoUpdate({
      target: [messageReactions.messageId, messageReactions.userId],
      set: {
        emoji,
        updatedAt: new Date(),
        updatedBy: userId,
      },
    });

  return { ok: true };
}

export async function sendMessage(
  bookingId: number,
  userId: number,
  body: string,
  attachment?: ChatImageAttachmentInput
): Promise<Result> {
  const trimmed = body.trim();
  if (!trimmed && !attachment) {
    return { ok: false, error: 'Scrivi un messaggio o aggiungi un’immagine.' };
  }
  if (trimmed.length > MAX_BODY) {
    return { ok: false, error: 'Messaggio troppo lungo.' };
  }
  if (attachment) {
    const attachmentError = validateChatImageAttachment(attachment);
    if (attachmentError) return { ok: false, error: attachmentError };
  }

  const context = await getBookingChatContext(bookingId, userId);
  if (!context) return { ok: false, error: 'Chat non disponibile.' };
  if (!isBookingChatAvailable(context.status)) {
    return {
      ok: false,
      error: 'La chat non è più disponibile per questa sessione.',
    };
  }

  let attachmentKey: string | null = null;
  let attachmentName: string | null = null;
  if (attachment) {
    const extension =
      attachment.mimeType === 'image/png'
        ? 'png'
        : attachment.mimeType === 'image/webp'
          ? 'webp'
          : 'jpg';
    attachmentKey = `chats/${bookingId}/${randomUUID()}.${extension}`;
    attachmentName = safeAttachmentName(attachment.name, attachment.mimeType);
    await storePrivateFile(
      attachmentKey,
      attachment.bytes,
      attachment.mimeType
    );
  }

  try {
    await db.insert(messages).values({
      bookingId,
      senderId: userId,
      body: trimmed,
      attachmentKey,
      attachmentName,
      attachmentMimeType: attachment?.mimeType ?? null,
      attachmentSize: attachment?.size ?? null,
      createdBy: userId,
    });
  } catch (error) {
    if (attachmentKey) {
      await deletePrivateFile(attachmentKey).catch(() => undefined);
    }
    throw error;
  }

  // Notify the other participant.
  const isClient = userId === context.clientId;
  const recipientId = isClient ? context.coachUserId : context.clientId;
  const senderName = isClient
    ? context.clientName ?? context.clientEmail
    : context.coachName;
  await notify('new_message', recipientId, {
    senderName,
    bookingId,
    actorUserId: userId,
  });

  return { ok: true };
}
