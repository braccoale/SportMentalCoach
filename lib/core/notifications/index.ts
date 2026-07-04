import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  notifications,
  notificationPreferences,
  users,
  type Notification,
} from '@/lib/db/schema';
import { isEmailEnabled } from '@/lib/core/flags';
import { sendNotificationEmail } from '@/lib/core/email';

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

/**
 * Human-readable labels for each type (default marketplace copy; a vertical can
 * override). Used by the email-preferences UI.
 */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  booking_requested: 'Nuova richiesta di sessione',
  booking_accepted: 'Richiesta accettata',
  booking_cancelled: 'Prenotazione annullata',
  booking_completed: 'Sessione completata',
  new_message: 'Nuovo messaggio',
  provider_approved: 'Profilo approvato',
  provider_rejected: 'Profilo rifiutato',
};

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

/** Unread notifications of a given type (e.g. `new_message` for chat KPIs). */
export async function getUnreadCountForType(
  userId: number,
  type: NotificationType
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, type),
        isNull(notifications.readAt)
      )
    );
  return row?.count ?? 0;
}

/**
 * Marks all unread `new_message` notifications for one booking as read —
 * called when the user opens that chat, so unread counters stay honest.
 */
export async function markMessageNotificationsRead(
  userId: number,
  bookingId: number
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, 'new_message'),
        isNull(notifications.readAt),
        sql`${notifications.data}->>'bookingId' = ${String(bookingId)}`
      )
    );
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

// --- Email preferences (per-user, per-type) --------------------------------

export type EmailPreferences = Record<NotificationType, boolean>;

/**
 * Returns the user's email preference for every notification type, defaulting
 * to `true` (enabled) for any type without a stored row.
 */
export async function getEmailPreferences(
  userId: number
): Promise<EmailPreferences> {
  const rows = await db
    .select({
      type: notificationPreferences.type,
      emailEnabled: notificationPreferences.emailEnabled,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));

  const stored = new Map(rows.map((r) => [r.type, r.emailEnabled]));
  return NOTIFICATION_TYPES.reduce((acc, type) => {
    acc[type] = stored.get(type) ?? true; // default enabled
    return acc;
  }, {} as EmailPreferences);
}

/** Upserts the user's per-type email preferences. */
export async function setEmailPreferences(
  userId: number,
  prefs: Partial<EmailPreferences>
): Promise<void> {
  const rows = Object.entries(prefs).map(([type, emailEnabled]) => ({
    userId,
    type,
    emailEnabled: Boolean(emailEnabled),
  }));
  if (rows.length === 0) return;

  await db
    .insert(notificationPreferences)
    .values(rows)
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.type],
      set: {
        emailEnabled: sql`excluded.email_enabled`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Resolves the recipient's email for a given type — but only if the user has
 * email enabled for it (default enabled). Returns null when there is no email
 * or the user opted out of this type. One indexed query (left join).
 */
async function resolveEmailRecipient(
  userId: number,
  type: NotificationType
): Promise<string | null> {
  const [row] = await db
    .select({
      email: users.email,
      emailEnabled: notificationPreferences.emailEnabled,
    })
    .from(users)
    .leftJoin(
      notificationPreferences,
      and(
        eq(notificationPreferences.userId, users.id),
        eq(notificationPreferences.type, type)
      )
    )
    .where(eq(users.id, userId))
    .limit(1);

  if (!row?.email) return null;
  const enabled = row.emailEnabled ?? true; // default enabled
  return enabled ? row.email : null;
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
        title: 'Congratulazioni, sei un coach Kai Pai! 🎉',
        body:
          'Il tuo profilo è stato approvato ed è ora visibile agli atleti. ' +
          'Da oggi puoi ricevere richieste di sessione, gestire calendario e ' +
          'servizi, e far crescere la tua presenza sulla piattaforma. Benvenuto!',
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
  const { title, body, data } = buildContent(type, ctx);

  // In-app notification: the source of truth.
  try {
    await createNotification({ userId: recipientUserId, type, title, body, data });
  } catch (error) {
    console.error('notify failed:', type, error);
  }

  // Optional email mirror — best-effort; never breaks the action. Respects the
  // user's per-type email preference (default enabled).
  if (isEmailEnabled()) {
    try {
      const to = await resolveEmailRecipient(recipientUserId, type);
      if (to) {
        await sendNotificationEmail({ to, title, body, link: data.link });
      } else {
        console.log(`[email] skipped (preference/no-email): "${title}"`);
      }
    } catch (error) {
      console.error('[email] notify-email failed:', type, error);
    }
  } else {
    console.log(`[email] skipped (disabled): "${title}"`);
  }
}
