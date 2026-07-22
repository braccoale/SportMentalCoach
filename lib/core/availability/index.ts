import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  coachAvailability,
  providerProfiles,
  type CoachAvailability,
} from '@/lib/db/schema';
import type { Result } from '@/lib/core/result';
import { WEEKDAY_LABELS, formatMinutesOfDay } from '@/lib/core/format';

export type AvailabilitySlot = Pick<
  CoachAvailability,
  'id' | 'weekday' | 'startMinute' | 'endMinute'
>;

const slotColumns = {
  id: coachAvailability.id,
  weekday: coachAvailability.weekday,
  startMinute: coachAvailability.startMinute,
  endMinute: coachAvailability.endMinute,
};

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

/** Maps Intl short weekday names to 0=Sun…6=Sat (matching `WEEKDAY_LABELS`). */
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

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
 * Weekday (0=Sun…6=Sat) and minute-of-day for a `Date`, read in the app's
 * fixed display timezone (Europe/Rome) — not the server process's timezone,
 * which the Vercel runtime otherwise defaults to UTC. Availability slots are
 * configured in local (Rome) wall-clock time, so comparisons must use the
 * same zone.
 */
function romeWeekdayAndMinute(d: Date): { weekday: number; minuteOfDay: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
    minuteOfDay: Number(map.hour) * 60 + Number(map.minute),
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
  date: Date
): boolean {
  if (slots.length === 0) return true;
  const { weekday, minuteOfDay } = romeWeekdayAndMinute(date);
  return slots.some(
    (s) =>
      s.weekday === weekday &&
      minuteOfDay >= s.startMinute &&
      minuteOfDay < s.endMinute
  );
}

export type BookableDay = {
  /** Rome-local date, "YYYY-MM-DD" — combined with a chosen time for the booking. */
  value: string;
  /** Human label, e.g. "Lunedì 27 lug". */
  label: string;
  /** Selectable start times ("HH:mm"), only inside the coach's slots for that day. */
  times: string[];
};

/**
 * Concrete upcoming appointment options derived from the coach's weekly
 * availability — only the weekdays they actually work, each with the start
 * times that fall inside their configured ranges. Powers a constrained
 * day+time picker so the athlete can never pick a day/hour the coach didn't
 * set. Scans `daysAhead` days; today only offers times still in the future.
 */
export function getBookableDays(
  slots: Pick<AvailabilitySlot, 'weekday' | 'startMinute' | 'endMinute'>[],
  opts: { daysAhead?: number; stepMinutes?: number; from?: Date } = {}
): BookableDay[] {
  if (slots.length === 0) return [];
  const daysAhead = opts.daysAhead ?? 21;
  const step = opts.stepMinutes ?? 30;
  const from = opts.from ?? new Date();
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
    days.push({
      value: `${d.year}-${d.month}-${d.day}`,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      times: [...new Set(times)],
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

export type AvailabilityInput = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

/** Adds a weekly slot for the coach. Ownership + range validated. */
export async function addAvailabilitySlot(
  userId: number,
  input: AvailabilityInput
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  const { weekday, startMinute, endMinute } = input;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { ok: false, error: 'Giorno non valido.' };
  }
  if (
    ![startMinute, endMinute].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 1440
    )
  ) {
    return { ok: false, error: 'Orario non valido.' };
  }
  if (endMinute <= startMinute) {
    return { ok: false, error: 'L’orario di fine deve essere dopo l’inizio.' };
  }

  const [created] = await db
    .insert(coachAvailability)
    .values({ providerId, weekday, startMinute, endMinute, createdBy: userId })
    .onConflictDoNothing()
    .returning({ id: coachAvailability.id });

  if (!created) {
    return {
      ok: false,
      error: 'Esiste già una fascia con questo orario di inizio in quel giorno.',
    };
  }
  return { ok: true };
}

/** Updates one of the coach's own slots (day/time). Ownership + range validated. */
export async function updateAvailabilitySlot(
  userId: number,
  slotId: number,
  input: AvailabilityInput
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  const { weekday, startMinute, endMinute } = input;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { ok: false, error: 'Giorno non valido.' };
  }
  if (
    ![startMinute, endMinute].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 1440
    )
  ) {
    return { ok: false, error: 'Orario non valido.' };
  }
  if (endMinute <= startMinute) {
    return { ok: false, error: 'L’orario di fine deve essere dopo l’inizio.' };
  }

  const [updated] = await db
    .update(coachAvailability)
    .set({ weekday, startMinute, endMinute, updatedBy: userId })
    .where(
      and(
        eq(coachAvailability.id, slotId),
        eq(coachAvailability.providerId, providerId)
      )
    )
    .returning({ id: coachAvailability.id });

  if (!updated) return { ok: false, error: 'Fascia non trovata.' };
  return { ok: true };
}

/** Deletes one of the coach's own slots. */
export async function deleteAvailabilitySlot(
  userId: number,
  slotId: number
): Promise<Result> {
  const providerId = await resolveProviderId(userId);
  if (!providerId) return { ok: false, error: 'Profilo coach non trovato.' };

  const [deleted] = await db
    .delete(coachAvailability)
    .where(
      and(
        eq(coachAvailability.id, slotId),
        eq(coachAvailability.providerId, providerId)
      )
    )
    .returning({ id: coachAvailability.id });

  if (!deleted) return { ok: false, error: 'Fascia non trovata.' };
  return { ok: true };
}
