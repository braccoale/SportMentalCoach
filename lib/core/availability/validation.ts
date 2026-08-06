import type { Result } from '@/lib/core/result';

export type AvailabilityInput = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type BusyInterval = {
  scheduledFor: Date;
  durationMin: number;
};

export const MAX_AVAILABILITY_SLOTS = 50;
/** Interval between selectable appointment start times across every booking flow. */
export const BOOKING_START_STEP_MINUTES = 10;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function isValidMinute(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 1440;
}

/**
 * Validates and sorts a complete weekly schedule before it is persisted.
 * Adjacent ranges are allowed; overlapping ranges on the same day are not.
 */
export function validateAvailabilitySchedule(
  input: unknown
): Result<{ slots: AvailabilityInput[] }> {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Disponibilità non valida.' };
  }
  if (input.length > MAX_AVAILABILITY_SLOTS) {
    return {
      ok: false,
      error: `Puoi configurare al massimo ${MAX_AVAILABILITY_SLOTS} fasce.`,
    };
  }

  const slots: AvailabilityInput[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: 'Disponibilità non valida.' };
    }
    const candidate = raw as Record<string, unknown>;
    const weekday = Number(candidate.weekday);
    const startMinute = Number(candidate.startMinute);
    const endMinute = Number(candidate.endMinute);

    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return { ok: false, error: 'Giorno non valido.' };
    }
    if (!isValidMinute(startMinute) || !isValidMinute(endMinute)) {
      return { ok: false, error: 'Orario non valido.' };
    }
    if (endMinute <= startMinute) {
      return {
        ok: false,
        error: 'L’orario di fine deve essere dopo l’inizio.',
      };
    }
    slots.push({ weekday, startMinute, endMinute });
  }

  slots.sort(
    (a, b) =>
      a.weekday - b.weekday ||
      a.startMinute - b.startMinute ||
      a.endMinute - b.endMinute
  );

  for (let i = 1; i < slots.length; i += 1) {
    const previous = slots[i - 1]!;
    const current = slots[i]!;
    if (
      current.weekday === previous.weekday &&
      current.startMinute < previous.endMinute
    ) {
      return {
        ok: false,
        error:
          'Due fasce dello stesso giorno si sovrappongono. Modifica gli orari e riprova.',
      };
    }
  }

  return { ok: true, slots };
}

/** Parses a native time-input value (`HH:mm`) to minutes from midnight. */
export function timeValueToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Whether a proposed appointment overlaps one existing open appointment. */
export function appointmentIntervalsOverlap(
  scheduledFor: Date,
  durationMin: number,
  busy: BusyInterval
): boolean {
  if (
    Number.isNaN(scheduledFor.getTime()) ||
    !Number.isInteger(durationMin) ||
    durationMin <= 0 ||
    Number.isNaN(busy.scheduledFor.getTime()) ||
    !Number.isInteger(busy.durationMin) ||
    busy.durationMin <= 0
  ) {
    return false;
  }
  const proposedStart = scheduledFor.getTime();
  const proposedEnd = proposedStart + durationMin * 60_000;
  const busyStart = busy.scheduledFor.getTime();
  const busyEnd = busyStart + busy.durationMin * 60_000;
  return proposedStart < busyEnd && proposedEnd > busyStart;
}

/**
 * Longest session that can start at `scheduledFor` without running into one of
 * the coach's open appointments — `null` when nothing is booked ahead of it,
 * `0` when the start itself falls inside an appointment.
 *
 * Pickers need this rather than a plain busy/free flag: how far a start is
 * usable depends on the service being booked, so a 20-minute session can
 * legitimately start in a gap where a 40-minute one cannot.
 */
export function maxSessionMinutesAt(
  scheduledFor: Date,
  busy: BusyInterval[]
): number | null {
  if (Number.isNaN(scheduledFor.getTime())) return null;
  const start = scheduledFor.getTime();
  let max: number | null = null;
  for (const interval of busy) {
    if (
      Number.isNaN(interval.scheduledFor.getTime()) ||
      !Number.isInteger(interval.durationMin) ||
      interval.durationMin <= 0
    ) {
      continue;
    }
    const busyStart = interval.scheduledFor.getTime();
    const busyEnd = busyStart + interval.durationMin * 60_000;
    if (start >= busyStart && start < busyEnd) return 0;
    if (busyStart > start) {
      const gap = Math.floor((busyStart - start) / 60_000);
      if (max === null || gap < max) max = gap;
    }
  }
  return max;
}

/**
 * Whether a session of `durationMin` cannot start at `time` on a bookable day,
 * given that day's per-start capacities (see `BookableDay.maxDurationMin`).
 * A missing entry means no appointment follows: the start is always free.
 *
 * `durationMin: null` = no service picked yet. Only starts sitting *inside* an
 * appointment are blocked then: guessing a length would grey out perfectly
 * bookable earlier starts (a start 30 minutes before a session is fine for a
 * short service), and the picker re-narrows once a service is chosen.
 */
export function isStartBusyForDuration(
  maxDurationMin: Record<string, number>,
  time: string,
  durationMin: number | null
): boolean {
  const max = maxDurationMin[time];
  if (max === undefined) return false;
  return durationMin === null ? max === 0 : durationMin > max;
}

/**
 * The appointments that still occupy the coach's calendar at `now` — including
 * one that started before `now` and is not over yet.
 *
 * Filtering on the *start* instead would hide a session already underway, and
 * the picker would offer starts the server then rejects as occupied: the
 * overlap check on insert compares against each session's end, so this must
 * too.
 */
export function busyIntervalsAt(
  intervals: BusyInterval[],
  now: Date
): BusyInterval[] {
  return intervals.filter(
    (interval) =>
      interval.scheduledFor.getTime() + interval.durationMin * 60_000 >
      now.getTime()
  );
}

/**
 * Removes start times that have gone by since the options were computed.
 *
 * The day/time options are built server-side, so today's list stops being
 * accurate the moment the page has been sitting open (or was served from the
 * router cache): re-anchoring the picker on the first option isn't enough,
 * because that option itself may now be in the past and the server would
 * reject it. Callers pass the current instant at the moment the picker opens.
 */
export function dropPastStarts<T extends { value: string; times: string[] }>(
  days: T[],
  now: Date
): T[] {
  const { date: today, minuteOfDay } = romeDateAndMinute(now);
  const result: T[] = [];
  for (const day of days) {
    if (day.value < today) continue;
    if (day.value > today) {
      result.push(day);
      continue;
    }
    // Same rule as the server-side generator: the current minute is already
    // too late to be a usable start.
    const times = day.times.filter((time) => {
      const minutes = timeValueToMinutes(time);
      return minutes !== null && minutes > minuteOfDay + 1;
    });
    if (times.length > 0) result.push({ ...day, times });
  }
  return result;
}

/** Reads the Rome-local date ("YYYY-MM-DD") and minute-of-day of an instant. */
export function romeDateAndMinute(date: Date): {
  date: string;
  minuteOfDay: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    minuteOfDay: Number(map.hour) * 60 + Number(map.minute),
  };
}

/** Reads weekday and minute-of-day in the platform timezone (Europe/Rome). */
export function romeWeekdayAndMinute(date: Date): {
  weekday: number;
  minuteOfDay: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
    minuteOfDay: Number(map.hour) * 60 + Number(map.minute),
  };
}

/** Whether a scheduled instant starts inside one weekly availability slot. */
export function isScheduledDateWithinSlot(
  date: Date,
  slot: AvailabilityInput
): boolean {
  const { weekday, minuteOfDay } = romeWeekdayAndMinute(date);
  return (
    weekday === slot.weekday &&
    minuteOfDay >= slot.startMinute &&
    minuteOfDay < slot.endMinute
  );
}
