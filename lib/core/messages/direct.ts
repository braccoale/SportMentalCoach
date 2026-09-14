import 'server-only';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { directConversations, directMessages, notifications, profiles, providerProfiles, userRoles, users } from '@/lib/db/schema';
import { notify } from '@/lib/core/notifications';
import type { Result } from '@/lib/core/result';
import type { Conversation } from './index';

export async function openDirectConversation(userId: number, slug: string): Promise<Result<{ conversationId: number }>> {
  const [athlete] = await db.select({ id: users.id }).from(users)
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.roleKey, 'athlete')))
    .where(and(eq(users.id, userId), eq(users.isDemo, false), isNull(users.deletedAt))).limit(1);
  if (!athlete) return { ok: false, error: 'Accedi con un account atleta per scrivere al coach.' };
  const [coach] = await db.select({ id: providerProfiles.id, userId: providerProfiles.userId }).from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(and(eq(providerProfiles.slug, slug), eq(providerProfiles.status, 'approved'), eq(users.isDemo, false), isNull(users.deletedAt))).limit(1);
  if (!coach || coach.userId === userId) return { ok: false, error: 'Coach non disponibile per la chat.' };
  await db.insert(directConversations).values({ athleteId: userId, providerId: coach.id, createdBy: userId }).onConflictDoNothing();
  const [conversation] = await db.select({ id: directConversations.id }).from(directConversations)
    .where(and(eq(directConversations.athleteId, userId), eq(directConversations.providerId, coach.id))).limit(1);
  return { ok: true, conversationId: conversation.id };
}

export async function getDirectConversation(conversationId: number, userId: number) {
  const [row] = await db.select({
    id: directConversations.id,
    athleteId: directConversations.athleteId,
    coachUserId: providerProfiles.userId,
    coachName: profiles.displayName,
    coachSlug: providerProfiles.slug,
    coachStatus: providerProfiles.status,
    athleteName: sql<string>`trim(concat(${users.name}, ' ', ${users.lastName}))`,
  }).from(directConversations)
    .innerJoin(providerProfiles, eq(providerProfiles.id, directConversations.providerId))
    .innerJoin(users, eq(users.id, directConversations.athleteId))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .where(and(eq(directConversations.id, conversationId), or(eq(directConversations.athleteId, userId), eq(providerProfiles.userId, userId)))).limit(1);
  return row ?? null;
}

export async function getDirectChat(conversationId: number, userId: number) {
  const context = await getDirectConversation(conversationId, userId);
  if (!context) return null;
  // Bound each response while retaining the latest conversation history.
  const rows = await db.select({ id: directMessages.id, senderId: directMessages.senderId, body: directMessages.body, createdAt: directMessages.createdAt })
    .from(directMessages).where(eq(directMessages.conversationId, conversationId)).orderBy(desc(directMessages.id)).limit(200);
  return { context, messages: rows.reverse().map(row => ({ ...row, createdAt: row.createdAt.toISOString() })) };
}

export async function sendDirectMessage(conversationId: number, userId: number, body: string): Promise<Result> {
  const text = body.trim();
  if (!text || text.length > 4000) return { ok: false, error: 'Scrivi un messaggio da 1 a 4000 caratteri.' };
  const context = await getDirectConversation(conversationId, userId);
  if (!context || context.coachStatus !== 'approved') return { ok: false, error: 'Chat non disponibile.' };
  const participants = await db.select({ id: users.id }).from(users).where(and(
    inArray(users.id, [context.athleteId, context.coachUserId]), eq(users.isDemo, false), isNull(users.deletedAt),
  ));
  if (participants.length !== 2) return { ok: false, error: 'Chat non disponibile.' };
  await db.transaction(async tx => {
    await tx.insert(directMessages).values({ conversationId, senderId: userId, body: text, createdBy: userId });
    await tx.update(directConversations).set({ updatedAt: new Date(), updatedBy: userId }).where(eq(directConversations.id, conversationId));
  });
  const fromAthlete = userId === context.athleteId;
  await notify('new_message', fromAthlete ? context.coachUserId : context.athleteId, {
    directConversationId: conversationId,
    senderName: (fromAthlete ? context.athleteName : context.coachName) || (fromAthlete ? 'Atleta' : 'Coach'),
  });
  return { ok: true };
}

export async function markDirectMessagesRead(conversationId: number, userId: number) {
  if (!await getDirectConversation(conversationId, userId)) return;
  await db.update(notifications).set({ readAt: new Date() }).where(and(
    eq(notifications.userId, userId), eq(notifications.type, 'new_message'), isNull(notifications.readAt),
    sql`${notifications.data}->>'directConversationId' = ${String(conversationId)}`,
  ));
}

export async function getDirectConversations(userId: number): Promise<Conversation[]> {
  const rows = await db.select({
    id: directConversations.id, athleteId: directConversations.athleteId, coachName: profiles.displayName,
    coachAvatar: profiles.avatarUrl, updatedAt: directConversations.updatedAt,
    athleteName: sql<string>`trim(concat(${users.name}, ' ', ${users.lastName}))`,
    athleteAvatar: sql<string | null>`(select avatar_url from profiles where user_id = ${directConversations.athleteId} limit 1)`,
    readOnly: sql<boolean>`${providerProfiles.status} <> 'approved'`,
    lastBody: sql<string | null>`(select body from direct_messages where conversation_id = ${directConversations.id} order by id desc limit 1)`,
    lastSenderId: sql<number | null>`(select sender_id from direct_messages where conversation_id = ${directConversations.id} order by id desc limit 1)`,
    unread: sql<number>`(select count(*)::int from notifications where user_id = ${userId} and type = 'new_message' and read_at is null and data->>'directConversationId' = ${directConversations.id}::text)`,
  }).from(directConversations)
    .innerJoin(providerProfiles, eq(providerProfiles.id, directConversations.providerId))
    .innerJoin(users, eq(users.id, directConversations.athleteId))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .where(or(eq(directConversations.athleteId, userId), eq(providerProfiles.userId, userId)))
    .orderBy(desc(directConversations.updatedAt));
  return rows.map(row => ({
    bookingId: null, href: `/dashboard/messages/direct/${row.id}`,
    otherName: row.athleteId === userId ? row.coachName : row.athleteName,
    otherAvatarUrl: row.athleteId === userId ? row.coachAvatar : row.athleteAvatar,
    serviceTitle: 'Chat diretta', scheduledFor: null, lastBody: row.lastBody,
    lastAt: row.updatedAt, lastFromMe: row.lastSenderId === userId, unread: row.unread, readOnly: row.readOnly,
  }));
}
