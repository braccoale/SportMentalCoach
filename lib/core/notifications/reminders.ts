import 'server-only';
import { and, between, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  services,
  users,
} from '@/lib/db/schema';
import { notify } from './index';
import { scopeForBooking } from './idempotency';

/**
 * Appointment reminders, driven by a scheduler rather than by a user action.
 *
 * Idempotency is what makes this safe to run often: each (booking, window) pair
 * produces one in-app notification and one email, and the delivery ledger
 * rejects a second send for the same booking and window even if the cron fires
 * twice, overlaps, or is replayed by hand.
 *
 * The two windows are separate catalogue events, so `b{bookingId}` is enough to
 * disambiguate them — `booking_reminder_24h` and `booking_reminder_1h` are
 * already part of the key.
 */

export type ReminderWindow = '24h' | '1h';

const WINDOWS: Record<
  ReminderWindow,
  { event: 'booking_reminder_24h' | 'booking_reminder_1h'; leadMinutes: number }
> = {
  '24h': { event: 'booking_reminder_24h', leadMinutes: 24 * 60 },
  '1h': { event: 'booking_reminder_1h', leadMinutes: 60 },
};

/**
 * How wide a slice of time one run covers. Must be at least as long as the cron
 * interval, otherwise a booking can fall between two runs and never be
 * reminded. Generous on purpose: over-selecting is harmless (the ledger
 * deduplicates), under-selecting silently loses reminders.
 */
const WINDOW_TOLERANCE_MINUTES = 35;

const it = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Rome',
});
const itTime = new Intl.DateTimeFormat('it-IT', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Rome',
});

export type ReminderRunResult = {
  window: ReminderWindow;
  considered: number;
  notified: number;
};

/**
 * Sends the reminders due in one window. Returns counts for the cron log.
 *
 * Both participants are reminded: the athlete and the coach. Each gets their
 * own notification, their own preference check and their own ledger row.
 */
export async function sendDueReminders(
  window: ReminderWindow,
  now: Date = new Date()
): Promise<ReminderRunResult> {
  const { event, leadMinutes } = WINDOWS[window];

  const target = new Date(now.getTime() + leadMinutes * 60_000);
  const from = new Date(target.getTime() - WINDOW_TOLERANCE_MINUTES * 60_000);
  const to = new Date(target.getTime() + WINDOW_TOLERANCE_MINUTES * 60_000);

  const rows = await db
    .select({
      bookingId: bookings.id,
      scheduledFor: bookings.scheduledFor,
      athleteUserId: bookings.clientId,
      athleteName: users.name,
      coachUserId: providerProfiles.userId,
      serviceTitle: services.title,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .innerJoin(users, eq(bookings.clientId, users.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        inArray(bookings.status, ['accepted']),
        between(bookings.scheduledFor, from, to)
      )
    );

  // Coach display names come from the provider profile owner, fetched in one
  // extra query rather than a second join on `users`.
  const coachIds = [...new Set(rows.map((r) => r.coachUserId))];
  const coachNames = new Map<number, string>();
  if (coachIds.length > 0) {
    const coaches = await db
      .select({ id: users.id, name: users.name, lastName: users.lastName })
      .from(users)
      .where(inArray(users.id, coachIds));
    for (const c of coaches) {
      coachNames.set(
        c.id,
        [c.name, c.lastName].filter(Boolean).join(' ') || 'il tuo coach'
      );
    }
  }

  let notified = 0;

  for (const row of rows) {
    if (!row.scheduledFor) continue;

    const shared = {
      bookingId: row.bookingId,
      serviceTitle: row.serviceTitle,
      sessionDate: it.format(row.scheduledFor),
      sessionTime: itTime.format(row.scheduledFor),
      coachName: coachNames.get(row.coachUserId) ?? 'il tuo coach',
      athleteName: row.athleteName ?? 'il tuo atleta',
      idempotencyScope: scopeForBooking(row.bookingId),
    };

    // One failure must not stop the batch: the remaining bookings still get
    // their reminder, and the failed one is retried on the next run because no
    // ledger row was written for it.
    for (const [userId, audience] of [
      [row.athleteUserId, 'athlete'],
      [row.coachUserId, 'coach'],
    ] as const) {
      try {
        await notify(event, userId, { ...shared, audience });
        notified += 1;
      } catch (error) {
        console.error(
          `[reminders] ${event} failed for booking ${row.bookingId}, user ${userId}:`,
          error
        );
      }
    }
  }

  return { window, considered: rows.length, notified };
}

/** Runs both windows. Called by the cron endpoint. */
export async function sendAllDueReminders(
  now: Date = new Date()
): Promise<ReminderRunResult[]> {
  return [await sendDueReminders('24h', now), await sendDueReminders('1h', now)];
}
