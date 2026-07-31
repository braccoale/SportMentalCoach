import type { Result } from '@/lib/core/result';

export type AvailabilityInput = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export const MAX_AVAILABILITY_SLOTS = 50;

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
