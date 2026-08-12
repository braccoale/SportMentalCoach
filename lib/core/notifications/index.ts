import 'server-only';
import { after } from 'next/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  notifications,
  notificationPreferences,
  users,
  type Notification,
} from '@/lib/db/schema';
import { isEmailEnabled } from '@/lib/core/flags';
import { sendEventEmail } from '@/lib/core/email';
import type { TemplateContext } from '@/lib/core/email/render';
import type { DetailsCard } from '@/lib/core/email/details-card';
import { formatDateTimeIt, roleLabelIt } from '@/lib/core/email/format';
import {
  buildBookingCard,
  buildCalendarAction,
  loadBookingEmailData,
  participantRole,
  sessionLabel,
} from '@/lib/core/email/booking-context';
import { isPushConfigured, sendPushToUser } from '@/lib/core/push';
import {
  callStartedContent,
  coachCreatedAppointmentContent,
  rescheduledAppointmentContent,
  type AppointmentNotificationActor,
} from './appointment-content';
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_KEYS,
  getEvent,
  type NotificationEventKey,
} from './catalog';
import { buildEmailIdempotencyKey } from './idempotency';

export * from './catalog';
export * from './idempotency';

/**
 * Stable notification type keys, derived from the event catalogue so the two
 * can never drift. Existing call sites (`notify('booking_accepted', …)`) keep
 * working unchanged — this is the same union, just sourced from one place.
 */
export const NOTIFICATION_TYPES = NOTIFICATION_EVENT_KEYS;

export type NotificationType = NotificationEventKey;

/**
 * Human-readable labels for each type, also derived from the catalogue. Kept
 * exported because the preferences UI and older code import it.
 */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> =
  NOTIFICATION_EVENT_KEYS.reduce(
    (acc, key) => {
      acc[key] = NOTIFICATION_EVENTS[key].label;
      return acc;
    },
    {} as Record<NotificationType, string>
  );

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
): Promise<number> {
  const [row] = await exec
    .insert(notifications)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      data: input.data ?? null,
    })
    // The id is what makes the email idempotency key unique per event; callers
    // that ignore it are unaffected.
    .returning({ id: notifications.id });
  return row.id;
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
        isNull(notifications.readAt),
        visibleInApp()
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
      .where(and(eq(notifications.userId, userId), visibleInApp()))
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          visibleInApp()
        )
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
    .where(and(eq(notifications.userId, userId), visibleInApp()))
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

// --- Channel preferences (per-user, per-type) ------------------------------

export type EmailPreferences = Record<NotificationType, boolean>;

/** The two independent channels a user can switch on or off per event. */
export type ChannelPreference = { inApp: boolean; email: boolean };
export type ChannelPreferences = Record<NotificationType, ChannelPreference>;

/**
 * The user's per-event choice for both channels.
 *
 * Three rules, all owned by the catalogue rather than by the table:
 *   * a missing row falls back to the event's defaults (no row is created just
 *     to record a default);
 *   * a mandatory event always reads back as enabled on both channels,
 *     whatever the row says;
 *   * an event with no in-app twin (an invitation to someone who has no
 *     account yet) reports `inApp: false` and is not offered in the UI.
 */
export async function getChannelPreferences(
  userId: number
): Promise<ChannelPreferences> {
  const rows = await db
    .select({
      type: notificationPreferences.type,
      emailEnabled: notificationPreferences.emailEnabled,
      inAppEnabled: notificationPreferences.inAppEnabled,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));

  const stored = new Map(rows.map((r) => [r.type, r]));

  return NOTIFICATION_TYPES.reduce((acc, type) => {
    const event = NOTIFICATION_EVENTS[type];
    const row = stored.get(type);
    acc[type] = {
      email: event.mandatoryEmail
        ? true
        : (row?.emailEnabled ?? event.emailDefault),
      inApp: !event.hasInApp
        ? false
        : event.mandatoryEmail
          ? true
          : (row?.inAppEnabled ?? event.inAppDefault),
    };
    return acc;
  }, {} as ChannelPreferences);
}

/**
 * Back-compatible view of the email column alone. Kept because older call
 * sites and tests import it.
 */
export async function getEmailPreferences(
  userId: number
): Promise<EmailPreferences> {
  const prefs = await getChannelPreferences(userId);
  return NOTIFICATION_TYPES.reduce((acc, type) => {
    acc[type] = prefs[type].email;
    return acc;
  }, {} as EmailPreferences);
}

/**
 * Upserts the user's per-event channel choices.
 *
 * Mandatory events are dropped silently: the UI renders them locked, and a
 * crafted form post must not be able to switch off a security alert. Events
 * without an in-app twin keep `in_app_enabled` untouched — there is nothing to
 * switch off.
 */
export async function setChannelPreferences(
  userId: number,
  prefs: Partial<Record<NotificationType, Partial<ChannelPreference>>>
): Promise<void> {
  const rows = Object.entries(prefs)
    .map(([type, value]) => ({ event: getEvent(type), type, value }))
    .filter(({ event }) => event !== null && !event.mandatoryEmail)
    .map(({ event, type, value }) => ({
      userId,
      type,
      emailEnabled: value?.email ?? event!.emailDefault,
      inAppEnabled: event!.hasInApp
        ? (value?.inApp ?? event!.inAppDefault)
        : true,
    }));
  if (rows.length === 0) return;

  await db
    .insert(notificationPreferences)
    .values(rows)
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.type],
      set: {
        emailEnabled: sql`excluded.email_enabled`,
        inAppEnabled: sql`excluded.in_app_enabled`,
        updatedAt: new Date(),
      },
    });
}

/** Back-compatible setter that touches the email column only. */
export async function setEmailPreferences(
  userId: number,
  prefs: Partial<EmailPreferences>
): Promise<void> {
  const rows = Object.entries(prefs)
    .filter(([type]) => {
      const event = getEvent(type);
      return event !== null && !event.mandatoryEmail;
    })
    .map(([type, emailEnabled]) => ({
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
 * Whether this user wants this event in the app at all.
 *
 * Governs the push notification too: from the user's point of view the "App"
 * switch means "avvisami dentro l'applicazione", and a native banner on the
 * phone is exactly that. Splitting bell and push into two switches would be a
 * distinction only an engineer can explain.
 */
async function isInAppEnabled(
  userId: number,
  type: NotificationType
): Promise<boolean> {
  const event = NOTIFICATION_EVENTS[type];
  if (!event.hasInApp) return false;
  if (event.mandatoryEmail) return true;

  const [row] = await db
    .select({ inAppEnabled: notificationPreferences.inAppEnabled })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.type, type)
      )
    )
    .limit(1);

  return row?.inAppEnabled ?? event.inAppDefault;
}

/**
 * Hides from the bell the events the user switched off in-app.
 *
 * Applied when READING rather than when writing. The notification row is always
 * inserted, for two reasons that matter:
 *   * it is the anchor of the email idempotency key — dropping it would make
 *     two chat messages share one key, and the second email would vanish;
 *   * re-enabling a channel brings the history back instead of leaving a hole.
 *
 * Mandatory events are never hidden, whatever the stored row says.
 */
function visibleInApp() {
  const mandatory = NOTIFICATION_EVENT_KEYS.filter(
    (k) => NOTIFICATION_EVENTS[k].mandatoryEmail
  );

  return sql`(
    ${notifications.type} in ${mandatory}
    or not exists (
      select 1 from ${notificationPreferences} np
      where np.user_id = ${notifications.userId}
        and np.type = ${notifications.type}
        and np.in_app_enabled = false
    )
  )`;
}

export type EmailRecipient = {
  email: string;
  firstName: string;
  fullName: string;
};

/**
 * Decides whether this user gets an email for this event, and resolves the
 * values every template may need about them.
 *
 * Returns null when there is no address or the user opted out. Mandatory events
 * bypass the preference entirely. One indexed query (left join).
 */
async function resolveEmailRecipient(
  userId: number,
  type: NotificationType
): Promise<EmailRecipient | null> {
  const [row] = await db
    .select({
      email: users.email,
      name: users.name,
      lastName: users.lastName,
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

  const event = NOTIFICATION_EVENTS[type];
  if (!event.mandatoryEmail) {
    const enabled = row.emailEnabled ?? event.emailDefault;
    if (!enabled) return null;
  }

  return { email: row.email, ...recipientNames(row) };
}

/**
 * `recipient.firstName` must always resolve to something: a missing value
 * aborts the send by design, and "the user never filled in their name" is not
 * a reason to withhold a booking confirmation. The local part of the address is
 * the guaranteed last resort.
 */
function recipientNames(row: {
  email: string;
  name: string | null;
  lastName: string | null;
}): { firstName: string; fullName: string } {
  const first = row.name?.trim() || row.email.split('@')[0];
  const full = [row.name?.trim(), row.lastName?.trim()]
    .filter(Boolean)
    .join(' ');
  return { firstName: first, fullName: full || first };
}

/** Il centro notifiche usa lo stesso saluto personale delle email. */
async function resolveInAppFirstName(userId: number): Promise<string | null> {
  const [row] = await db
    .select({ email: users.email, name: users.name, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.email ? recipientNames(row).firstName : null;
}

function withPersonalGreeting(firstName: string | null, body: string): string {
  if (!firstName) return body;
  return `Ciao ${firstName}, ${body.charAt(0).toLocaleLowerCase('it-IT')}${body.slice(1)}`;
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
  /** For `booking_declined`: distinguishes an auto-expiry from a manual decline. */
  expired?: boolean;
  /** For `review_received`: the star rating (1-5) left by the athlete. */
  rating?: number;
  /** Who changed the appointment, so the recipient gets unambiguous copy. */
  actor?: AppointmentNotificationActor;
  /** Session date/time, already formatted, for the reminder events. */
  sessionDate?: string;
  sessionTime?: string;
  /** Counterpart names, for templates that address them explicitly. */
  coachName?: string | null;
  athleteName?: string | null;
  /** Provider lifecycle details shown to admins. */
  providerId?: number;
  registeredAt?: Date;
  submittedAt?: Date;
  /**
   * Who performed the action. Lets the email say "Marco Rossi ha spostato la
   * sessione" instead of the passive, anonymous version. Optional: when absent
   * it is derived, because for cancel/reschedule the actor is by construction
   * the participant who is not the recipient.
   */
  actorUserId?: number;
  /** For `security_alert`: what happened, in plain Italian. */
  securityEvent?: string;
  securityOccurredAt?: string;
  /**
   * Extra values handed to the email template, merged over the ones derived
   * from the context above. Only whitelisted placeholders are ever read.
   */
  emailContext?: Record<string, string | number>;
  /**
   * Dedup scope for events that have no in-app notification or that fire from a
   * scheduler. Ignored when an in-app notification exists — its id is stronger.
   */
  idempotencyScope?: string;
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
    case 'booking_created_by_coach':
      return coachCreatedAppointmentContent(ctx);
    case 'call_started':
      return callStartedContent(ctx);
    case 'booking_accepted':
      return {
        title: 'Richiesta accettata',
        body: 'La tua richiesta di sessione è stata accettata.',
        data: { link: '/dashboard/athlete', bookingId: ctx.bookingId },
      };
    case 'booking_declined':
      return {
        title: 'Richiesta rifiutata',
        body: ctx.expired
          ? 'La tua richiesta di sessione è scaduta senza risposta ed è stata rifiutata automaticamente. Puoi inviarne una nuova.'
          : 'La tua richiesta di sessione è stata rifiutata.',
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
    case 'booking_rescheduled':
      return rescheduledAppointmentContent({
        bookingId: ctx.bookingId,
        actor: ctx.actor ?? 'coach',
        audience: ctx.audience,
      });
    case 'new_message':
      return {
        title: 'Nuovo messaggio',
        body: ctx.senderName
          ? `Nuovo messaggio da ${ctx.senderName}.`
          : 'Hai ricevuto un nuovo messaggio.',
        data: { link: bookingLink ?? '/dashboard', bookingId: ctx.bookingId },
      };
    case 'athlete_registered':
      return {
        title: 'Nuovo atleta registrato',
        body: `${ctx.athleteName?.trim() || 'Un nuovo atleta'} si è registrato su KaiPai.`,
        data: { link: '/dashboard/admin' },
      };
    case 'provider_registered':
      return {
        title: 'Nuovo coach registrato',
        body: `${ctx.coachName?.trim() || 'Un nuovo coach'} si è registrato. Il profilo è ancora in bozza.`,
        data: {
          link: ctx.providerId
            ? `/dashboard/admin#coach-${ctx.providerId}`
            : '/dashboard/admin',
        },
      };
    case 'provider_review_requested':
      return {
        title: 'Nuovo profilo coach da approvare',
        body: `${ctx.coachName?.trim() || 'Un coach'} ha inviato il proprio profilo per la revisione.`,
        data: {
          link: ctx.providerId
            ? `/dashboard/admin#coach-${ctx.providerId}`
            : '/dashboard/admin',
        },
      };
    case 'provider_approved':
      return {
        title: 'Congratulazioni, sei un coach KaiPai! 🎉',
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
    case 'review_received':
      return {
        title: 'Nuova recensione',
        body: ctx.rating
          ? `Hai ricevuto una recensione da ${ctx.rating} ${ctx.rating === 1 ? 'stella' : 'stelle'}.`
          : 'Hai ricevuto una nuova recensione.',
        data: { link: '/dashboard/coach#recensioni' },
      };
    case 'booking_reminder_24h':
      return {
        title: 'La tua sessione è domani',
        body: ctx.sessionTime
          ? `Promemoria: hai una sessione domani alle ${ctx.sessionTime}.`
          : 'Promemoria: hai una sessione domani.',
        data: {
          link: bookingLink ?? '/dashboard',
          bookingId: ctx.bookingId,
        },
      };
    case 'booking_reminder_1h':
      return {
        title: 'La tua sessione inizia tra un’ora',
        body: ctx.sessionTime
          ? `La sessione inizia alle ${ctx.sessionTime}. Preparati.`
          : 'La tua sessione inizia tra circa un’ora.',
        data: {
          link: ctx.bookingId ? `/dashboard/video/${ctx.bookingId}` : '/dashboard',
          bookingId: ctx.bookingId,
        },
      };
    case 'ai_report_ready':
      return {
        title: 'Report della sessione pronto',
        body: 'Il report della tua sessione è disponibile.',
        data: {
          link: bookingLink ?? '/dashboard',
          bookingId: ctx.bookingId,
        },
      };
    case 'coach_invitation':
      return {
        title: 'Ti hanno invitato su KaiPai',
        body: ctx.senderName
          ? `${ctx.senderName} ti ha invitato su KaiPai.`
          : 'Hai ricevuto un invito su KaiPai.',
        data: { link: '/dashboard' },
      };
    case 'security_alert':
      return {
        title: 'Avviso di sicurezza',
        body: ctx.securityEvent
          ? `Attività rilevata sul tuo account: ${ctx.securityEvent}.`
          : 'Abbiamo rilevato un’attività importante sul tuo account.',
        data: { link: '/dashboard/general' },
      };
  }
}

/**
 * Values a template may read, plus the details card.
 *
 * For booking events the data is loaded once from the database rather than
 * being threaded through every call site: the domain layer should not have to
 * know what an email wants to say. The query runs inside `after()`, so it costs
 * the user nothing.
 *
 * The prose only ever receives values that always exist; everything optional
 * goes into the card, which drops the rows it cannot fill.
 */
async function buildEmailPayload(
  type: NotificationType,
  recipientUserId: number,
  ctx: NotifyContext,
  recipient: EmailRecipient
): Promise<{
  context: TemplateContext;
  card: DetailsCard | null;
  secondaryAction: { label: string; url: string } | null;
}> {
  const base: TemplateContext = {
    recipient: {
      firstName: recipient.firstName,
      fullName: recipient.fullName,
    },
    sender: { fullName: ctx.senderName ?? undefined },
    inviter: { name: ctx.senderName ?? undefined },
    coach: { fullName: ctx.coachName ?? undefined },
    athlete: { fullName: ctx.athleteName ?? undefined },
    review: { rating: ctx.rating },
    security: {
      event: ctx.securityEvent,
      occurredAt: ctx.securityOccurredAt,
    },
  };

  const data = ctx.bookingId ? await loadBookingEmailData(ctx.bookingId) : null;

  if (!data) {
    const registrationCard =
      type === 'athlete_registered' ||
      type === 'provider_registered' ||
      type === 'provider_review_requested'
        ? {
            rows: [
              {
                label: type === 'athlete_registered' ? 'Atleta' : 'Coach',
                value: type === 'athlete_registered' ? ctx.athleteName ?? null : ctx.coachName ?? null,
              },
              {
                label: 'Registrato',
                value: formatDateTimeIt(ctx.registeredAt),
              },
              ...(type === 'provider_review_requested'
                ? [
                    {
                      label: 'Richiesta inviata',
                      value: formatDateTimeIt(ctx.submittedAt),
                      emphasis: true,
                    },
                  ]
                : []),
            ],
          }
        : null;
    return {
      context: { ...base, ...(ctx.emailContext ?? {}) },
      card: registrationCard,
      secondaryAction: null,
    };
  }

  const recipientRole = participantRole(data, recipientUserId);
  const counterpart =
    recipientRole === 'coach' ? data.athlete : data.coach;

  // The actor is whoever acted. When the call site did not say, the recipient
  // is the counterpart of the actor by construction, so the other participant
  // is the answer.
  const actorUserId =
    ctx.actorUserId ??
    (recipientRole ? counterpart.userId : data.athlete.userId);
  const actorRole = participantRole(data, actorUserId);
  const actorName =
    actorRole === 'coach' ? data.coach.displayName : data.athlete.displayName;

  const occurredAt =
    type === 'booking_requested' ? data.requestedAt : new Date();

  return {
    context: {
      ...base,
      session: { label: sessionLabel(data) },
      coach: { fullName: data.coach.displayName ?? undefined },
      athlete: { fullName: data.athlete.displayName ?? undefined },
      counterpart: { fullName: counterpart.displayName ?? undefined },
      actor: {
        fullName: actorName ?? undefined,
        role: roleLabelIt(actorRole) ?? undefined,
      },
      ...(ctx.emailContext ?? {}),
    },
    card: buildBookingCard({
      eventKey: type,
      data,
      actorUserId,
      occurredAt,
      recipientRole,
    }),
    secondaryAction: buildCalendarAction({
      eventKey: type,
      data,
      recipientRole,
    }),
  };
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
  const event = NOTIFICATION_EVENTS[type];
  const rawContent = buildContent(type, ctx);
  const firstName = event.hasInApp
    ? await resolveInAppFirstName(recipientUserId).catch(() => null)
    : null;
  const { title, data } = rawContent;
  const body = withPersonalGreeting(firstName, rawContent.body);

  // In-app notification: the source of truth, and the anchor of the email's
  // idempotency key.
  let notificationId: number | null = null;
  if (event.hasInApp) {
    try {
      notificationId = await createNotification({
        userId: recipientUserId,
        type,
        title,
        body,
        data,
      });
    } catch (error) {
      console.error('notify failed:', type, error);
    }
  }

  // Email mirror — a separate channel with its own preference, template and
  // delivery ledger. Best-effort: it never breaks the domain action. Sent AFTER
  // the response (via `after`) so the provider round-trip adds no latency.
  if (isEmailEnabled()) {
    const sendEmail = async () => {
      try {
        const recipient = await resolveEmailRecipient(recipientUserId, type);
        if (!recipient) {
          console.log(`[email] skipped (preference/no-email): "${title}"`);
          return;
        }

        const idempotencyKey = buildEmailIdempotencyKey({
          eventKey: type,
          recipientUserId,
          notificationId,
          scope: ctx.idempotencyScope,
          recipientEmail: recipient.email,
        });

        const payload = await buildEmailPayload(
          type,
          recipientUserId,
          ctx,
          recipient
        );

        const outcome = await sendEventEmail({
          eventKey: type,
          to: recipient.email,
          recipientUserId,
          notificationId,
          idempotencyKey,
          context: payload.context,
          card: payload.card,
          secondaryAction: payload.secondaryAction,
          actionUrl: data.link,
        });

        if (outcome !== 'sent') {
          console.log(`[email] ${outcome} for "${type}" (${idempotencyKey})`);
        }
      } catch (error) {
        console.error('[email] notify-email failed:', type, error);
      }
    };
    try {
      // Runs after the response is flushed (kept alive by the platform).
      after(sendEmail);
    } catch {
      // Outside a request scope (e.g. scripts): fall back to fire-and-forget.
      void sendEmail();
    }
  } else {
    console.log(`[email] skipped (disabled): "${title}"`);
  }

  /*
   * L'avviso sul dispositivo, browser **o** app.
   *
   * Qui c'era un `if (isPushConfigured())`, che verifica le chiavi VAPID del
   * push web. Ma i due canali sono indipendenti: `sendPushToUser` manda al
   * browser solo se VAPID c'è, e all'app sempre. Con quel cancello davanti, un
   * progetto senza VAPID restava muto **anche** sull'app — che è precisamente
   * il canale che non dipende da VAPID.
   *
   * Il cancello non serve nemmeno a risparmiare lavoro: senza dispositivi
   * registrati la funzione esce subito.
   */
  const sendPush = async () => {
    try {
      // Same switch as the bell: "App" off means silent on the device too.
      if (!(await isInAppEnabled(recipientUserId, type))) return;
      await sendPushToUser(recipientUserId, {
        title,
        body: body || undefined,
        url: data.link,
        tag: `${type}-${data.bookingId ?? ''}`,
      });
    } catch (error) {
      console.error('[push] notify-push failed:', type, error);
    }
  };
  try {
    after(sendPush);
  } catch {
    void sendPush();
  }
}
