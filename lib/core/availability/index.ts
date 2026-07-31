import 'server-only';
import { and, asc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  bookings,
  coachAvailability,
  providerProfiles,
  services,
  type CoachAvailability,
} from '@/lib/db/schema';
import type { Result } from '@/lib/core/result';
import {
  WEEKDAY_LABELS,
  formatDateTime,
  formatMinutesOfDay,
} from '@/lib/core/format';
import {
  BOOKING_START_STEP_MINUTES,
  appointmentIntervalsOverlap,
  isScheduledDateWithinSlot,
  romeWeekdayAndMinute,
  validateAvailabilitySchedule,
  type AvailabilityInput,
  type BusyInterval,
} from './validation';
import { DEFAULT_SERVICE_DURATION_MIN } from '@/lib/core/services/validation';

export type { AvailabilityInput } from './validation';

export type AvailabilitySlot = Pick<
  CoachAvailability,
  'id' | 'weekday' | 'startMinute' | 'endMinute'
>;

export type CoachBusyInterval = BusyInterval;

const slotColumns = {
  id: coachAvailability.id,
  weekday: coachAvailability.weekday,
  startMinute: coachAvailability.startMinute,
  endMinute: coachAvailability.endMinute,
};

async function findFirstFutureBookingInSlot(
  exec: DbOrTx,
  providerId: number,
  slot: AvailabilityInput
): Promise<Date | null> {
  const futureBookings = await exec
    .select({ scheduledFor: bookings.scheduledFor })
    .from(bookings)
    .where(
      and(
        eq(bookings.providerId, providerId),
        gt(bookings.scheduledFor, new Date()),
        inArray(bookings.status, ['requested', 'accepted'])
      )
    )
    .orderBy(asc(bookings.scheduledFor));

  return (
    futureBookings.find(
      (booking) =>
        booking.scheduledFor &&
        isScheduledDateWithinSlot(booking.scheduledFor, slot)
    )?.scheduledFor ?? null
  );
}

async function resolveProviderId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, userId))
    .limit(1);
  return row?.id ?? null;
}

/** A coach's weekly availability (by user id), ordered weekday → start. */
export async function getCoachAvailability(
  userId: number
): Promise<AvailabilitySlot[]> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return [];
  return db
    .select(slotColumns)
    .from(coachAvailability)
    .where(eq(coachAvailability.providerId, providerId))
    .orderBy(asc(coachAvailability.weekday), asc(coachAvailability.startMinute));
}

/** A coach's weekly availability by provider id (empty if none configured). */
export async function getCoachAvailabilityByProviderId(
  providerId: number
): Promise<AvailabilitySlot[]> {
  return db
    .select(slotColumns)
    .from(coachAvailability)
    .where(eq(coachAvailability.providerId, providerId))
    .orderBy(asc(coachAvailability.weekday), asc(coachAvailability.startMinute));
}

type RomeDay = {
  year: string;
  /** "01"–"12". */
  month: string;
  /** "01"–"31". */
  day: string;
  /** 0=Sun…6=Sat. */
  weekday: number;
  /** Midday UTC on that date — safe to format as a Rome date label. */
  at: Date;
};

/**
 * The Rome calendar date `offset` days after `from`.
 *
 * Steps the *calendar* rather than adding 86_400_000 ms per day: a fixed 24h
 * hop from a late-evening `from` skips a whole calendar day at the
 * spring-forward transition (23:30 Mar 28 + 24h lands on Mar 30). UTC has no
 * DST, so doing the arithmetic on the Y-M-D triple is exact.
 */
function romeDayAt(from: Date, offset: number): RomeDay {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(from);
  const base = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const at = new Date(
    Date.UTC(
      Number(base.year),
      Number(base.month) - 1,
      Number(base.day) + offset,
      12
    )
  );
  return {
    year: String(at.getUTCFullYear()),
    month: String(at.getUTCMonth() + 1).padStart(2, '0'),
    day: String(at.getUTCDate()).padStart(2, '0'),
    weekday: at.getUTCDay(),
    at,
  };
}

/**
 * Parses a `datetime-local` string (e.g. "2026-07-21T08:39") as Rome
 * wall-clock time and returns the corresponding UTC `Date`. Plain
 * `new Date(str)` interprets the string in the *server* timezone (UTC on
 * Vercel), silently shifting the intended time by the Rome offset — this fixes
 * that so "08:39" the athlete typed means 08:39 in Italy.
 */
export function parseRomeLocalDateTime(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Rome's offset can differ side-of-DST; resolve against the tentative
  // instant, then re-check once in case the guess landed across a transition.
  const offset1 = romeOffsetMinutes(new Date(asUtc));
  let result = new Date(asUtc - offset1 * 60_000);
  const offset2 = romeOffsetMinutes(result);
  if (offset2 !== offset1) result = new Date(asUtc - offset2 * 60_000);
  return result;
}

/** Minutes Europe/Rome is ahead of UTC at the given instant (60 in winter, 120 in summer). */
function romeOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * Whether `date` falls inside one of the coach's weekly availability slots.
 * A coach with no configured slots has nothing to validate against, so any
 * time is allowed — the constraint only kicks in once they've set a schedule.
 */
export function isWithinAvailability(
  slots: AvailabilitySlot[],
  date: Date,
  durationMin = 1
): boolean {
  if (slots.length === 0) return true;
  const { weekday, minuteOfDay } = romeWeekdayAndMinute(date);
  return slots.some(
    (s) =>
      s.weekday === weekday &&
      minuteOfDay >= s.startMinute &&
      minuteOfDay + durationMin <= s.endMinute
  );
}

export type BookableDay = {
  /** Rome-local date, "YYYY-MM-DD" — combined with a chosen time for the booking. */
  value: string;
  /** Human label, e.g. "Lunedì 27 lug". */
  label: string;
  /** Selectable start times ("HH:mm"), only inside the coach's slots for that day. */
  times: string[];
  /** Starts whose default-length session overlaps a requested/accepted one. */
  busyTimes: string[];
};

/**
 * Future requested/accepted sessions grouped by coach. Durations come from the
 * coach-owned service and use the platform default only for legacy rows.
 */
export async function getCoachBusyIntervalsByProviderIds(
  providerIds: number[]
): Promise<Map<number, CoachBusyInterval[]>> {
  if (providerIds.length === 0) return new Map();

  const rows = await db
    .select({
      providerId: bookings.providerId,
      scheduledFor: bookings.scheduledFor,
      durationMin: services.durationMin,
    })
    .from(bookings)
    .leftJoin(services, eq(services.id, bookings.serviceId))
    .where(
      and(
        inArray(bookings.providerId, providerIds),
        inArray(bookings.status, ['requested', 'accepted']),
        sql`${bookings.scheduledFor} + coalesce(${services.durationMin}, ${DEFAULT_SERVICE_DURATION_MIN}) * interval '1 minute' > now()`
      )
    )
    .orderBy(asc(bookings.scheduledFor));

  const grouped = new Map<number, CoachBusyInterval[]>();
  for (const row of rows) {
    if (!row.scheduledFor) continue;
    const list = grouped.get(row.providerId) ?? [];
    list.push({
      scheduledFor: row.scheduledFor,
      durationMin: row.durationMin ?? DEFAULT_SERVICE_DURATION_MIN,
    });
    grouped.set(row.providerId, list);
  }
  return grouped;
}

/**
 * Concrete upcoming appointment options derived from the coach's weekly
 * availability — only the weekdays they actually work, each with the start
 * times that fall inside their configured ranges. Powers a constrained
 * day+time picker so the athlete can never pick a day/hour the coach didn't
 * set. Scans `daysAhead` days; today only offers times still in the future.
 */
export function getBookableDays(
  slots: Pick<AvailabilitySlot, 'weekday' | 'startMinute' | 'endMinute'>[],
  opts: {
    daysAhead?: number;
    stepMinutes?: number;
    from?: Date;
    busyIntervals?: CoachBusyInterval[];
  } = {}
): BookableDay[] {
  if (slots.length === 0) return [];
  const daysAhead = opts.daysAhead ?? 21;
  const step = opts.stepMinutes ?? BOOKING_START_STEP_MINUTES;
  const from = opts.from ?? new Date();
  const busyIntervals = opts.busyIntervals ?? [];
  const { minuteOfDay: nowMinute } =
    romeWeekdayAndMinute(from);

  const days: BookableDay[] = [];
  for (let offset = 0; offset <= daysAhead; offset++) {
    const d = romeDayAt(from, offset);

    const daySlots = slots
      .filter((s) => s.weekday === d.weekday)
      .sort((a, b) => a.startMinute - b.startMinute);
    if (daySlots.length === 0) continue;

    const times: string[] = [];
    for (const s of daySlots) {
      // Latest start leaves at least one step before the slot closes.
      for (let m = s.startMinute; m <= s.endMinute - step; m += step) {
        if (offset === 0 && m <= nowMinute + 1) continue; // already passed today
        times.push(
          `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
        );
      }
    }
    if (times.length === 0) continue;

    const label = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    }).format(d.at);
    const value = `${d.year}-${d.month}-${d.day}`;
    const uniqueTimes = [...new Set(times)];
    const busyTimes = uniqueTimes.filter((time) => {
      const candidate = parseRomeLocalDateTime(`${value}T${time}`);
      if (!candidate) return false;
      return busyIntervals.some((interval) =>
        appointmentIntervalsOverlap(
          candidate,
          DEFAULT_SERVICE_DURATION_MIN,
          interval
        )
      );
    });

    days.push({
      value,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      times: uniqueTimes,
      busyTimes,
    });
  }
  return days;
}

/** Compact human-readable summary of weekly availability, e.g. "Lun 09:00–18:00 · Mer 14:00–19:00". */
export function describeAvailability(
  slots: Pick<AvailabilitySlot, 'weekday' | 'startMinute' | 'endMinute'>[]
): string {
  return slots
    .map(
      (s) =>
        `${WEEKDAY_LABELS[s.weekday]} ${formatMinutesOfDay(s.startMinute)}–${formatMinutesOfDay(s.endMinute)}`
    )
    .join(' · ');
}

/** Public availability for an approved coach by slug (empty if not approved). */
export async function getApprovedCoachAvailabilityBySlug(
  slug: string
): Promise<AvailabilitySlot[]> {
  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(
      and(eq(providerProfiles.slug, slug), eq(providerProfiles.status, 'approved'))
    )
    .limit(1);
  if (!provider) return [];
  return db
    .select(slotColumns)
    .from(coachAvailability)
    .where(eq(coachAvailability.providerId, provider.id))
    .orderBy(asc(coachAvailability.weekday), asc(coachAvailability.startMinute));
}

/**
 * Replaces the coach's complete weekly schedule atomically. Either every
 * add/change/removal is persisted, or none is, so the UI cannot display a
 * partially saved week.
 */
export async function replaceCoachAvailability(
  userId: number,
  input: unknown
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  const validated = validateAvailabilitySchedule(input);
  if (!validated.ok) return { ok: false, error: validated.error };

  await db.transaction(async (tx) => {
    await tx
      .delete(coachAvailability)
      .where(eq(coachAvailability.providerId, providerId));

    if (validated.slots.length > 0) {
      await tx.insert(coachAvailability).values(
        validated.slots.map((slot) => ({
          providerId,
          ...slot,
          createdBy: userId,
          updatedBy: userId,
        }))
      );
    }
  });

  return { ok: true };
}

/** Adds a weekly slot for the coach. Ownership + range validated. */
export async function addAvailabilitySlot(
  userId: number,
  input: AvailabilityInput
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  return db.transaction(async (tx) => {
    // Availability writes for the same coach are serialized so simultaneous
    // requests cannot both pass the overlap check and then insert.
    await tx.execute(sql`select pg_advisory_xact_lock(${providerId})`);

    const current = await tx
      .select({
        weekday: coachAvailability.weekday,
        startMinute: coachAvailability.startMinute,
        endMinute: coachAvailability.endMinute,
      })
      .from(coachAvailability)
      .where(eq(coachAvailability.providerId, providerId));
    const validated = validateAvailabilitySchedule([...current, input]);
    if (!validated.ok) return { ok: false, error: validated.error };

    await tx.insert(coachAvailability).values({
      providerId,
      ...input,
      createdBy: userId,
      updatedBy: userId,
    });
    return { ok: true };
  });
}

/** Updates one of the coach's own slots (day/time). Ownership + range validated. */
export async function updateAvailabilitySlot(
  userId: number,
  slotId: number,
  input: AvailabilityInput
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${providerId})`);

    const [owned] = await tx
      .select(slotColumns)
      .from(coachAvailability)
      .where(
        and(
          eq(coachAvailability.id, slotId),
          eq(coachAvailability.providerId, providerId)
        )
      )
      .limit(1);
    if (!owned) return { ok: false, error: 'Fascia non trovata.' };

    const plannedFor = await findFirstFutureBookingInSlot(
      tx,
      providerId,
      owned
    );
    if (
      plannedFor &&
      !isScheduledDateWithinSlot(plannedFor, input)
    ) {
      return {
        ok: false,
        error: `Non puoi modificare questa fascia perché contiene una sessione futura pianificata per ${formatDateTime(plannedFor)}. Annulla o riprogramma prima l’appuntamento.`,
      };
    }

    const otherSlots = await tx
      .select({
        weekday: coachAvailability.weekday,
        startMinute: coachAvailability.startMinute,
        endMinute: coachAvailability.endMinute,
      })
      .from(coachAvailability)
      .where(
        and(
          eq(coachAvailability.providerId, providerId),
          ne(coachAvailability.id, slotId)
        )
      );
    const validated = validateAvailabilitySchedule([...otherSlots, input]);
    if (!validated.ok) return { ok: false, error: validated.error };

    await tx
      .update(coachAvailability)
      .set({ ...input, updatedBy: userId })
      .where(
        and(
          eq(coachAvailability.id, slotId),
          eq(coachAvailability.providerId, providerId)
        )
      );
    return { ok: true };
  });
}

/** Deletes one of the coach's own slots. */
export async function deleteAvailabilitySlot(
  userId: number,
  slotId: number
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${providerId})`);

    const [slot] = await tx
      .select(slotColumns)
      .from(coachAvailability)
      .where(
        and(
          eq(coachAvailability.id, slotId),
          eq(coachAvailability.providerId, providerId)
        )
      )
      .limit(1);
    if (!slot) return { ok: false, error: 'Fascia non trovata.' };

    const plannedFor = await findFirstFutureBookingInSlot(
      tx,
      providerId,
      slot
    );
    if (plannedFor) {
      return {
        ok: false,
        error: `Non puoi eliminare questa fascia: è presente una sessione futura pianificata per ${formatDateTime(plannedFor)}. Annulla o riprogramma prima l’appuntamento.`,
      };
    }

    await tx
      .delete(coachAvailability)
      .where(
        and(
          eq(coachAvailability.id, slotId),
          eq(coachAvailability.providerId, providerId)
        )
      );
    return { ok: true };
  });
}
