import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import { notifications, type Notification } from '@/lib/db/schema';

/**
 * Stable notification type keys. Generic marketplace events — any vertical on
 * this framework can reuse them (and add its own keys).
 */
export const NOTIFICATION_TYPES = [
  'booking_requested',
  'booking_accepted',
  'booking_cancelled',
  'booking_completed',
  'new_message',
  'provider_approved',
  'provider_rejected',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationData = {
  /** In-app link to open when the notification is clicked. */
  link?: string;
  [key: string]: unknown;
};

export type NotificationView = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  data: NotificationData | null;
  readAt: Date | null;
  createdAt: Date;
};

// --- Generic CRUD (reusable primitive) -------------------------------------

/**
 * Inserts a notification. Fully content-agnostic — callers (or the default
 * `notify` helper below) pre-render `title`/`body`. Accepts a transaction
 * executor so it can be created atomically with a domain write when needed.
 */
export async function createNotification(
  input: {
    userId: number;
    type: string;
    title: string;
    body?: string | null;
    data?: NotificationData | null;
  },
  exec: DbOrTx = db
): Promise<void> {
  await exec.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    data: input.data ?? null,
  });
}

/** Recent notifications + unread count for a user (for the header bell). */
export async function getRecentWithCount(
  userId: number,
  limit = 10
): Promise<{ unreadCount: number; items: NotificationView[] }> {
  const [items, [{ count }]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), isNull(notifications.readAt))
      ),
  ]);
  return { unreadCount: count, items: items.map(toView) };
}

/** Full notification list for a user (for the notifications page). */
export async function getNotifications(
  userId: number,
  limit = 50
): Promise<NotificationView[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map(toView);
}

/** Marks one of the user's own notifications as read (idempotent). */
export async function markAsRead(
  userId: number,
  notificationId: number
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt)
      )
    );
}

/** Marks all of the user's unread notifications as read. */
export async function markAllAsRead(userId: number): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt))
    );
}

function toView(n: Notification): NotificationView {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: (n.data as NotificationData | null) ?? null,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

// --- Default marketplace content layer (swappable per vertical) -------------

export type NotifyContext = {
  serviceTitle?: string | null;
  senderName?: string | null;
  bookingId?: number;
  /** For ambiguous-recipient events (e.g. cancel), which dashboard to link. */
  audience?: 'athlete' | 'coach';
};

/**
 * Maps a notification type + context to default title/body/link. This is the
 * one place holding marketplace-default copy; a vertical can override it.
 */
function buildContent(
  type: NotificationType,
  ctx: NotifyContext
): { title: string; body: string; data: NotificationData } {
  const bookingLink = ctx.bookingId
    ? `/dashboard/chat/${ctx.bookingId}`
    : undefined;

  switch (type) {
    case 'booking_requested':
      return {
        title: 'Nuova richiesta di sessione',
        body: ctx.serviceTitle
          ? `Hai ricevuto una richiesta per “${ctx.serviceTitle}”.`
          : 'Hai ricevuto una nuova richiesta di sessione.',
        data: { link: '/dashboard/coach', bookingId: ctx.bookingId },
      };
    case 'booking_accepted':
      return {
        title: 'Richiesta accettata',
        body: 'La tua richiesta di sessione è stata accettata.',
        data: { link: '/dashboard/athlete', bookingId: ctx.bookingId },
      };
    case 'booking_cancelled':
      return {
        title: 'Prenotazione annullata',
        body: 'Una prenotazione è stata annullata.',
        data: {
          link: ctx.audience === 'coach' ? '/dashboard/coach' : '/dashboard/athlete',
          bookingId: ctx.bookingId,
        },
      };
    case 'booking_completed':
      return {
        title: 'Sessione completata',
        body: 'La tua sessione è stata completata.',
        data: { link: '/dashboard/athlete', bookingId: ctx.bookingId },
      };
    case 'new_message':
      return {
        title: 'Nuovo messaggio',
        body: ctx.senderName
          ? `Nuovo messaggio da ${ctx.senderName}.`
          : 'Hai ricevuto un nuovo messaggio.',
        data: { link: bookingLink ?? '/dashboard', bookingId: ctx.bookingId },
      };
    case 'provider_approved':
      return {
        title: 'Profilo approvato',
        body: 'Il tuo profilo è stato approvato ed è ora pubblico.',
        data: { link: '/dashboard/coach' },
      };
    case 'provider_rejected':
      return {
        title: 'Profilo rifiutato',
        body: 'Il tuo profilo è stato rifiutato. Aggiornalo e invialo di nuovo.',
        data: { link: '/dashboard/coach' },
      };
  }
}

/**
 * Emits a notification for a domain event. Best-effort: a notification failure
 * never breaks the underlying domain action.
 */
export async function notify(
  type: NotificationType,
  recipientUserId: number,
  ctx: NotifyContext = {}
): Promise<void> {
  try {
    const { title, body, data } = buildContent(type, ctx);
    await createNotification({ userId: recipientUserId, type, title, body, data });
  } catch (error) {
    console.error('notify failed:', type, error);
  }
}
