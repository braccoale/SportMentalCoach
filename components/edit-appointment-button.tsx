'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Pencil, X } from 'lucide-react';
import type { BookableDay } from '@/lib/core/availability';
import {
  isStartBusyForDuration,
  slotPresentation,
  timeValueToMinutes,
} from '@/lib/core/availability/validation';
import { SLOT_TONE_CLASS, SLOT_TONE_STYLE } from '@/components/slot-tone';
import { SESSION_DURATION_OPTIONS } from '@/lib/core/bookings/duration';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { rescheduleBookingAction } from '@/app/(dashboard)/dashboard/appointments/actions';

function isOwnSessionTime(
  dayValue: string,
  time: string,
  currentDay: string,
  currentTime: string,
  durationMin: number
): boolean {
  if (dayValue !== currentDay) return false;
  const minute = timeValueToMinutes(time);
  const currentMinute = timeValueToMinutes(currentTime);
  return (
    minute != null &&
    currentMinute != null &&
    minute >= currentMinute &&
    minute < currentMinute + durationMin
  );
}

function isBusy(
  day: BookableDay,
  time: string,
  currentDay: string,
  currentTime: string,
  durationMin: number
): boolean {
  return (
    isStartBusyForDuration(day.maxDurationMin, time, durationMin) &&
    !isOwnSessionTime(
      day.value,
      time,
      currentDay,
      currentTime,
      durationMin
    )
  );
}

function firstFreeTime(
  day: BookableDay | undefined,
  currentDay: string,
  currentTime: string,
  durationMin: number
): string {
  return (
    day?.times.find(
      (time) =>
        !isBusy(day, time, currentDay, currentTime, durationMin)
    ) ?? ''
  );
}

export function EditAppointmentButton({
  bookingId,
  bookableDays,
  currentDay,
  currentTime,
  durationMin,
  compact = false,
}: {
  bookingId: number;
  bookableDays: BookableDay[];
  currentDay: string;
  currentTime: string;
  durationMin: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initialDay = bookableDays.some((day) => day.value === currentDay)
    ? currentDay
    : bookableDays[0]?.value ?? '';
  const initialTime =
    initialDay === currentDay &&
    bookableDays
      .find((day) => day.value === initialDay)
      ?.times.includes(currentTime)
      ? currentTime
      : firstFreeTime(
          bookableDays.find((day) => day.value === initialDay),
          currentDay,
          currentTime,
          durationMin
        );
  const [day, setDay] = useState(initialDay);
  const [time, setTime] = useState(initialTime);
  /**
   * La durata è modificabile qui dentro, non solo la data.
   *
   * Spostare una sessione in uno spazio più stretto è esattamente il caso in
   * cui serve accorciarla: separare le due operazioni obbligherebbe a passare
   * da uno stato che il server rifiuta comunque.
   */
  const [duration, setDuration] = useState(durationMin);
  /** La durata voluta, a cui tornare quando un orario torna a contenerla. */
  const [preferredDuration, setPreferredDuration] = useState(durationMin);

  const selectedDay = useMemo(
    () => bookableDays.find((candidate) => candidate.value === day),
    [bookableDays, day]
  );
  const scheduledFor = day && time ? `${day}T${time}` : '';

  function openDialog() {
    setDay(initialDay);
    setTime(initialTime);
    setDuration(durationMin);
    setPreferredDuration(durationMin);
    setOpen(true);
  }

  /** Sceglie l'orario e adatta la durata, in entrambe le direzioni. */
  function chooseTime(next: string) {
    setTime(next);
    if (!selectedDay) return;
    const slot = slotPresentation(
      selectedDay.maxDurationMin,
      next,
      preferredDuration,
      true
    );
    setDuration(slot.fitsDurationMin ?? preferredDuration);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={compact ? 'sm' : 'default'}
        className="rounded-full"
        onClick={openDialog}
        disabled={bookableDays.length === 0}
        title={
          bookableDays.length === 0
            ? 'Il coach non ha configurato disponibilità modificabili.'
            : 'Modifica data e orario'
        }
      >
        <Pencil className="h-4 w-4" />
        Modifica
      </Button>

      {open && (
        <div className="fixed inset-0 z-[110]" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Chiudi"
            className="absolute inset-0 cursor-default bg-black/45"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <CalendarClock className="h-5 w-5" />
                </span>
                <h2 className="mt-3 text-xl font-semibold text-gray-950">
                  Modifica appuntamento
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Correggi la data o l’orario della sessione.
                </p>
              </div>
              <button
                type="button"
                aria-label="Chiudi"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <ActionForm
              action={rescheduleBookingAction}
              className="mt-5 flex flex-col gap-4"
              onSuccess={() => {
                setOpen(false);
                router.refresh();
              }}
            >
              <input type="hidden" name="bookingId" value={bookingId} />
              <input
                type="hidden"
                name="scheduledFor"
                value={scheduledFor}
              />

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-gray-700">
                    Giorno
                  </span>
                  <select
                    value={day}
                    onChange={(event) => {
                      const nextDayValue = event.target.value;
                      const nextDay = bookableDays.find(
                        (candidate) => candidate.value === nextDayValue
                      );
                      setDay(nextDayValue);
                      setTime(
                        firstFreeTime(
                          nextDay,
                          currentDay,
                          currentTime,
                          durationMin
                        )
                      );
                    }}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    {bookableDays.map((candidate) => (
                      <option key={candidate.value} value={candidate.value}>
                        {candidate.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-gray-700">
                    Orario
                  </span>
                  <select
                    value={time}
                    required
                    onChange={(event) => chooseTime(event.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    {!time && (
                      <option value="" disabled>
                        Nessun orario libero
                      </option>
                    )}
                    {selectedDay?.times.map((candidateTime) => {
                      const own = isOwnSessionTime(
                        selectedDay.value,
                        candidateTime,
                        currentDay,
                        currentTime,
                        durationMin
                      );
                      /* Gli orari della sessione che si sta spostando non
                         sono occupati da nessuno: è lei stessa, e spostandola
                         si liberano. */
                      const slot = own
                        ? {
                            suffix: '',
                            selectable: true,
                            tone: 'free' as const,
                          }
                        : slotPresentation(
                            selectedDay.maxDurationMin,
                            candidateTime,
                            duration,
                            true
                          );
                      return (
                        <option
                          key={candidateTime}
                          value={candidateTime}
                          disabled={!slot.selectable}
                          className={SLOT_TONE_CLASS[slot.tone]}
                          style={SLOT_TONE_STYLE[slot.tone]}
                        >
                          {candidateTime}
                          {slot.suffix}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">
                  Durata
                </span>
                <select
                  name="durationMin"
                  value={duration}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setDuration(next);
                    setPreferredDuration(next);
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  {SESSION_DURATION_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minuti
                    </option>
                  ))}
                </select>
              </label>

              <p className="text-xs text-gray-500">
                Gli orari occupati restano visibili in rosso e non sono
                selezionabili.
              </p>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setOpen(false)}
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  className="rounded-full"
                  disabled={!scheduledFor}
                >
                  Salva modifica
                </Button>
              </div>
            </ActionForm>
          </div>
        </div>
      )}
    </>
  );
}
